import { google } from 'googleapis'
import { fetchArchivedIssue, htmlToTextWithLinks, NEWSLETTER_SUBJECT, NewsletterIssueIn } from './archive'

/**
 * The newsletter's back catalogue from Gmail (Stage 16a tab). Mailchimp's public archive lists
 * only the latest 20 issues, but every issue reached Tom's Gmail. Read-only (gmail.readonly,
 * the app's existing connection); nothing is sent or changed in Gmail.
 *
 * Each email's "view in browser" link is the same public page the weekly read uses, so old and
 * new issues are stored in one format. When that page can't be fetched the email's own HTML is used.
 */

export const NEWSLETTER_SENDER = 'info@thechiswickcalendar.co.uk'
const QUERY = `from:${NEWSLETTER_SENDER} subject:"${NEWSLETTER_SUBJECT}"`

export interface GmailTokenRow {
  google_access_token: string | null
  google_refresh_token: string | null
  google_token_expiry: string | null
}

export interface GmailListed {
  messageId: string
  sentOn: string // YYYY-MM-DD, London
}

export function gmailClient(t: GmailTokenRow, onRefresh: (access: string, expiry: Date | null) => Promise<void>) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI)
  auth.setCredentials({
    access_token: t.google_access_token ?? undefined,
    refresh_token: t.google_refresh_token ?? undefined,
    expiry_date: t.google_token_expiry ? new Date(t.google_token_expiry).getTime() : undefined,
  })
  auth.on('tokens', (n) => {
    if (n.access_token) void onRefresh(n.access_token, n.expiry_date ? new Date(n.expiry_date) : null)
  })
  return google.gmail({ version: 'v1', auth })
}

type Gmail = ReturnType<typeof gmailClient>

const londonDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

/** Every newsletter email in the mailbox, oldest first (ids and dates only). */
export async function listGmailIssues(gmail: Gmail): Promise<GmailListed[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const res = await gmail.users.messages.list({ userId: 'me', q: QUERY, maxResults: 500, pageToken })
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id)
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  const out: GmailListed[] = []
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(ids.slice(i, i + 20).map((id) =>
      gmail.users.messages.get({ userId: 'me', id, format: 'minimal' }).then((r) => r.data)))
    for (const m of batch) if (m.id && m.internalDate) out.push({ messageId: m.id, sentOn: londonDay(Number(m.internalDate)) })
  }
  return out.sort((a, b) => a.sentOn.localeCompare(b.sentOn))
}

interface Part { mimeType?: string | null; body?: { data?: string | null } | null; parts?: Part[] | null }

function findHtml(p: Part | undefined | null): string | null {
  if (!p) return null
  if (p.mimeType === 'text/html' && p.body?.data) return Buffer.from(p.body.data, 'base64url').toString('utf-8')
  for (const s of p.parts ?? []) {
    const f = findHtml(s)
    if (f) return f
  }
  return null
}

/** One issue: the public page when its link works, otherwise the email's HTML. */
export async function fetchGmailIssue(gmail: Gmail, listed: GmailListed): Promise<NewsletterIssueIn & { via: 'archive' | 'email' }> {
  const res = await gmail.users.messages.get({ userId: 'me', id: listed.messageId, format: 'full' })
  const headers = res.data.payload?.headers ?? []
  const subject = (headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? NEWSLETTER_SUBJECT).trim()
  const html = findHtml(res.data.payload) ?? ''
  const link = html
    .replace(/&amp;/g, '&')
    .match(/https:\/\/(?:mailchi\.mp\/thechiswickcalendar\/[^"'\s<>?]+|us\d+\.campaign-archive\.com\/\?[^"'\s<>]+)/)?.[0]

  if (link) {
    try {
      return { ...(await fetchArchivedIssue({ url: link, sentOn: listed.sentOn, title: subject })), via: 'archive' }
    } catch {
      // fall through to the email's own HTML
    }
  }
  const start = html.indexOf('id="bodyTable"')
  const body = start >= 0 ? html.slice(html.lastIndexOf('<', start)) : html
  return {
    sourceId: html.match(/mc_cid=([0-9a-f]{10})/)?.[1] ?? `gmail:${listed.messageId}`,
    sentAt: `${listed.sentOn}T12:00:00Z`,
    subject,
    plainText: htmlToTextWithLinks(body),
    browserUrl: link ?? null,
    via: 'email',
  }
}
