import { google } from 'googleapis'
import { makeOAuth2Client, GmailTokens } from '@/lib/email-import/gmail-client'

/**
 * Reads issues of The Chiswick Calendar Newsletter from Tom's Gmail (Stage 16a).
 * Read-only: gmail.readonly scope, list and get only. Nothing is sent or changed in Gmail.
 */

export const NEWSLETTER_SENDER = 'info@thechiswickcalendar.co.uk'
export const NEWSLETTER_SUBJECT = 'The Chiswick Calendar Newsletter'
const QUERY = `from:${NEWSLETTER_SENDER} subject:"${NEWSLETTER_SUBJECT}"`

export interface NewsletterIssueIn {
  gmailMessageId: string
  sentAt: string // ISO
  subject: string
  plainText: string
  browserUrl: string | null
}

/** Gmail refused the stored connection: Tom needs to reconnect Gmail once in the app. */
export class GmailReconnectNeeded extends Error {
  constructor(detail: string) {
    super(`Gmail needs to be reconnected (Import emails, Connect Gmail): ${detail}`)
    this.name = 'GmailReconnectNeeded'
  }
}

function isAuthFailure(e: unknown): string | null {
  const err = e as { message?: string; code?: number | string; response?: { status?: number; data?: { error?: string } } }
  const grant = err?.response?.data?.error
  if (grant === 'invalid_grant' || grant === 'unauthorized_client' || grant === 'invalid_client') return grant
  if (err?.response?.status === 401 || err?.code === 401) return 'unauthorised (401)'
  if (err?.message && /invalid_grant|No refresh token|invalid_client/i.test(err.message)) return err.message
  return null
}

function gmailFor(tokens: GmailTokens, onTokenRefresh?: (t: string, expiry: Date | null) => Promise<void>) {
  const auth = makeOAuth2Client(tokens)
  if (onTokenRefresh) {
    auth.on('tokens', async (t) => {
      if (t.access_token) await onTokenRefresh(t.access_token, t.expiry_date ? new Date(t.expiry_date) : null)
    })
  }
  return google.gmail({ version: 'v1', auth })
}

/** Every newsletter message id in the mailbox, newest first. */
export async function listNewsletterMessageIds(
  tokens: GmailTokens,
  onTokenRefresh?: (t: string, expiry: Date | null) => Promise<void>
): Promise<string[]> {
  const gmail = gmailFor(tokens, onTokenRefresh)
  const ids: string[] = []
  let pageToken: string | undefined
  try {
    do {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: QUERY,
        maxResults: 500,
        pageToken,
        fields: 'messages(id),nextPageToken',
      })
      ids.push(...(res.data.messages ?? []).map((m) => m.id!).filter(Boolean))
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken && ids.length < 5000)
  } catch (e) {
    const auth = isAuthFailure(e)
    if (auth) throw new GmailReconnectNeeded(auth)
    throw e
  }
  return ids
}

interface Part {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: Part[] | null
}

function findPart(part: Part | undefined | null, mimeType: string): string | null {
  if (!part) return null
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, 'base64').toString('utf-8')
  }
  for (const p of part.parts ?? []) {
    const found = findPart(p, mimeType)
    if (found) return found
  }
  return null
}

/** HTML to text that keeps each link's address, like Mailchimp's own text part: "label (url)". */
export function htmlToTextWithLinks(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label} (${href})`)
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

/** The "view in browser" link (mailchi.mp/...), without the per-subscriber ?e= code. */
export function browserUrlFrom(text: string): string | null {
  const m = text.match(/https?:\/\/(?:mailchi\.mp|[a-z0-9.-]*campaign-archive\.com)\/[^\s)>"']+/i)
  if (!m) return null
  try {
    const u = new URL(m[0])
    u.searchParams.delete('e')
    return u.toString()
  } catch {
    return m[0]
  }
}

export async function fetchNewsletterIssue(
  tokens: GmailTokens,
  messageId: string,
  onTokenRefresh?: (t: string, expiry: Date | null) => Promise<void>
): Promise<NewsletterIssueIn | null> {
  const gmail = gmailFor(tokens, onTokenRefresh)
  let msg
  try {
    msg = (await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })).data
  } catch (e) {
    const auth = isAuthFailure(e)
    if (auth) throw new GmailReconnectNeeded(auth)
    throw e
  }
  const headers = msg.payload?.headers ?? []
  const get = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
  const from = get('From').toLowerCase()
  const subject = get('Subject').trim()
  // The search is loose; keep only the real thing (not replies or forwards of it).
  if (!from.includes(NEWSLETTER_SENDER) || !subject.startsWith(NEWSLETTER_SUBJECT)) return null

  const plain = findPart(msg.payload as Part, 'text/plain')
  const html = plain ? null : findPart(msg.payload as Part, 'text/html')
  const plainText = (plain ?? (html ? htmlToTextWithLinks(html) : '')).replace(/\r\n/g, '\n').trim()

  const internal = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(get('Date'))
  return {
    gmailMessageId: messageId,
    sentAt: (isNaN(internal.getTime()) ? new Date() : internal).toISOString(),
    subject,
    plainText,
    browserUrl: browserUrlFrom(plainText) ?? (html ? browserUrlFrom(html) : null),
  }
}
