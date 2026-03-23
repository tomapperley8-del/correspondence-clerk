import { parseEmailAddress, stripHtml, ScanEmailMeta } from './domain-grouper'

export interface OutlookTokens {
  accessToken: string
  refreshToken: string | null
  tokenExpiry: string | null // ISO timestamp
}

export interface OutlookFullEmail {
  externalId: string
  subject: string
  from: string    // raw "Name <email>"
  to: string      // raw "Name <email>, ..."
  date: string    // ISO 8601
  bodyText: string
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

async function refreshOutlookToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    scope: 'Mail.Read offline_access',
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) return null

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

async function graphFetch(
  path: string,
  tokens: OutlookTokens,
  onTokenRefresh?: (newTokens: OutlookTokens) => Promise<void>
): Promise<Response> {
  // Check if token is expired (with 60s buffer)
  const isExpired =
    tokens.tokenExpiry &&
    new Date(tokens.tokenExpiry).getTime() < Date.now() + 60_000

  let accessToken = tokens.accessToken

  if (isExpired && tokens.refreshToken) {
    const refreshed = await refreshOutlookToken(tokens.refreshToken)
    if (refreshed) {
      accessToken = refreshed.accessToken
      const newTokens: OutlookTokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiry: refreshed.expiresAt.toISOString(),
      }
      if (onTokenRefresh) await onTokenRefresh(newTokens)
      tokens = newTokens
    }
  }

  return fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
}

function formatRecipients(recipients: Array<{ emailAddress: { name?: string; address: string } }>): string {
  return recipients
    .map((r) => (r.emailAddress.name ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress.address))
    .join(', ')
}

/**
 * Fetches email metadata (no body) for scanning.
 * Outlook's list endpoint already returns sender info — no per-message calls needed.
 */
export async function scanOutlookEmails(
  tokens: OutlookTokens,
  since: Date,
  onTokenRefresh?: (newTokens: OutlookTokens) => Promise<void>
): Promise<ScanEmailMeta[]> {
  const sinceIso = since.toISOString()
  const results: ScanEmailMeta[] = []

  let url: string | null =
    `/me/messages?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime` +
    `&$filter=receivedDateTime ge ${sinceIso}` +
    `&$top=100&$orderby=receivedDateTime desc`

  let count = 0

  while (url && count < 2000) {
    const res = await graphFetch(url.startsWith('http') ? url.replace(GRAPH_BASE, '') : url, tokens, onTokenRefresh)

    if (!res.ok) break

    const data = await res.json()
    const messages: Array<{
      id: string
      subject?: string
      from?: { emailAddress: { name?: string; address: string } }
      toRecipients?: Array<{ emailAddress: { name?: string; address: string } }>
      ccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>
      receivedDateTime?: string
    }> = data.value ?? []

    for (const msg of messages) {
      if (!msg.from?.emailAddress?.address) continue

      const fromParsed = parseEmailAddress(
        msg.from.emailAddress.name
          ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
          : msg.from.emailAddress.address
      )
      const toParsed = [...(msg.toRecipients ?? []), ...(msg.ccRecipients ?? [])].map((r) =>
        parseEmailAddress(
          r.emailAddress.name
            ? `${r.emailAddress.name} <${r.emailAddress.address}>`
            : r.emailAddress.address
        )
      )

      results.push({
        externalId: msg.id,
        subject: msg.subject || '(no subject)',
        from: fromParsed,
        to: toParsed,
        date: msg.receivedDateTime ?? new Date().toISOString(),
      })
    }

    count += messages.length

    // Follow nextLink for pagination
    const nextLink: string | undefined = data['@odata.nextLink']
    url = nextLink ? nextLink.replace(GRAPH_BASE, '') : null
  }

  return results
}

/**
 * Fetches the full body of a specific Outlook message.
 */
export async function fetchOutlookFullEmail(
  tokens: OutlookTokens,
  messageId: string,
  onTokenRefresh?: (newTokens: OutlookTokens) => Promise<void>
): Promise<OutlookFullEmail | null> {
  const res = await graphFetch(
    `/me/messages/${messageId}?$select=id,subject,from,toRecipients,receivedDateTime,body`,
    tokens,
    onTokenRefresh
  )

  if (!res.ok) return null

  const msg = await res.json()

  const fromStr = msg.from?.emailAddress
    ? msg.from.emailAddress.name
      ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
      : msg.from.emailAddress.address
    : ''

  const toStr = formatRecipients(msg.toRecipients ?? [])

  let bodyText = ''
  if (msg.body?.contentType === 'text') {
    bodyText = msg.body.content ?? ''
  } else if (msg.body?.content) {
    bodyText = stripHtml(msg.body.content)
  }

  return {
    externalId: messageId,
    subject: msg.subject || '(no subject)',
    from: fromStr,
    to: toStr,
    date: msg.receivedDateTime ?? new Date().toISOString(),
    bodyText,
  }
}
