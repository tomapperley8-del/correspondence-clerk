import { google } from 'googleapis'
import { parseEmailAddress, stripHtml, ScanEmailMeta } from './domain-grouper'

export interface GmailTokens {
  accessToken: string
  refreshToken: string | null
  tokenExpiry: string | null // ISO timestamp
}

export interface GmailFullEmail {
  externalId: string
  subject: string
  from: string    // raw "Name <email>"
  to: string      // raw "Name <email>, ..."
  date: string    // ISO 8601
  bodyText: string
}

function makeOAuth2Client(tokens: GmailTokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
    expiry_date: tokens.tokenExpiry ? new Date(tokens.tokenExpiry).getTime() : undefined,
  })
  return oauth2Client
}

/**
 * Fetches email metadata (headers only) for scanning.
 * Returns lightweight ScanEmailMeta objects — no body fetched yet.
 * Uses parallel batches of 20 to stay within Gmail API quota.
 */
export async function scanGmailEmails(
  tokens: GmailTokens,
  since: Date,
  onTokenRefresh?: (newAccessToken: string, newExpiry: Date | null) => Promise<void>
): Promise<ScanEmailMeta[]> {
  const oauth2Client = makeOAuth2Client(tokens)

  if (onTokenRefresh) {
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        const expiry = newTokens.expiry_date ? new Date(newTokens.expiry_date) : null
        await onTokenRefresh(newTokens.access_token, expiry)
      }
    })
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const sinceEpoch = Math.floor(since.getTime() / 1000)

  // Fetch all message IDs in the date range (both inbox and sent)
  const allIds: string[] = []
  let pageToken: string | undefined

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${sinceEpoch}`,
      maxResults: 100,
      pageToken,
      fields: 'messages(id),nextPageToken',
    })

    const messages = listRes.data.messages ?? []
    allIds.push(...messages.map((m) => m.id!).filter(Boolean))
    pageToken = listRes.data.nextPageToken ?? undefined

    // Cap at 2000 messages to avoid very long scans
    if (allIds.length >= 2000) break
  } while (pageToken)

  // Fetch metadata in parallel batches of 20
  const results: ScanEmailMeta[] = []
  const BATCH_SIZE = 20

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE)
    const fetched = await Promise.all(
      batch.map((id) =>
        gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
          fields: 'id,payload(headers)',
        }).then((res) => {
          const headers = res.data.payload?.headers ?? []
          const get = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

          const fromRaw = get('From')
          const toRaw = get('To')
          const ccRaw = get('Cc')
          const subject = get('Subject') || '(no subject)'
          const dateStr = get('Date')

          const fromParsed = parseEmailAddress(fromRaw)
          const toParsed = toRaw
            .split(/,(?=[^,]*@)/)
            .map((s) => parseEmailAddress(s.trim()))
            .filter((p) => p.email)
          const ccParsed = ccRaw
            ? ccRaw.split(/,(?=[^,]*@)/).map((s) => parseEmailAddress(s.trim())).filter((p) => p.email)
            : []

          let parsedDate: string
          try {
            parsedDate = new Date(dateStr).toISOString()
          } catch {
            parsedDate = new Date().toISOString()
          }

          return {
            externalId: id,
            subject,
            from: fromParsed,
            to: [...toParsed, ...ccParsed],
            date: parsedDate,
          } satisfies ScanEmailMeta
        }).catch(() => null)
      )
    )
    results.push(...(fetched.filter(Boolean) as ScanEmailMeta[]))
  }

  return results
}

/**
 * Fetches the full body of a specific Gmail message.
 * Returns raw text suitable for raw_text_original.
 */
export async function fetchGmailFullEmail(
  tokens: GmailTokens,
  messageId: string,
  onTokenRefresh?: (newAccessToken: string, newExpiry: Date | null) => Promise<void>
): Promise<GmailFullEmail | null> {
  const oauth2Client = makeOAuth2Client(tokens)

  if (onTokenRefresh) {
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        const expiry = newTokens.expiry_date ? new Date(newTokens.expiry_date) : null
        await onTokenRefresh(newTokens.access_token, expiry)
      }
    })
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  try {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const msg = res.data
    const headers = msg.payload?.headers ?? []
    const get = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    const fromRaw = get('From')
    const toRaw = get('To')
    const subject = get('Subject') || '(no subject)'
    const dateStr = get('Date')

    let parsedDate: string
    try {
      parsedDate = new Date(dateStr).toISOString()
    } catch {
      parsedDate = new Date().toISOString()
    }

    // Extract plain text body, falling back to stripping HTML
    const bodyText = extractBodyText(msg.payload)

    return {
      externalId: messageId,
      subject,
      from: fromRaw,
      to: toRaw,
      date: parsedDate,
      bodyText,
    }
  } catch {
    return null
  }
}

interface GmailPart {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: GmailPart[] | null
}

function extractBodyText(payload: GmailPart | undefined): string {
  if (!payload) return ''

  // Recursively find parts
  function findPart(part: GmailPart, mimeType: string): string | null {
    if (!part) return null
    if (part.mimeType === mimeType && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    for (const subPart of part.parts ?? []) {
      const found = findPart(subPart, mimeType)
      if (found) return found
    }
    return null
  }

  // Prefer plain text
  const plain = findPart(payload, 'text/plain')
  if (plain) return plain.trim()

  // Fallback: strip HTML
  const html = findPart(payload, 'text/html')
  if (html) return stripHtml(html)

  return ''
}
