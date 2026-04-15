/**
 * HMAC-SHA256 signed tokens for one-click email actions.
 *
 * Tokens are embedded in daily briefing emails so Tom can mark items Done or
 * snooze them directly from the email without opening the app.
 *
 * Token format:  base64url(JSON payload) . hmac_hex
 * Signing key:   CRON_SECRET + ':quick-act' (namespaced to prevent cross-context reuse)
 * Expiry:        48 hours from generation (covers overnight + next day)
 */

import crypto from 'crypto'

export type QuickAction = 'done' | 'snooze'

interface TokenPayload {
  id: string          // correspondence row UUID
  action: QuickAction
  userId: string      // user who received the email
  exp: number         // unix timestamp (seconds)
}

function signingKey(): string {
  const base = process.env.CRON_SECRET || 'dev-fallback-secret'
  return base + ':quick-act'
}

function hmac(payload: string): string {
  return crypto
    .createHmac('sha256', signingKey())
    .update(payload)
    .digest('hex')
}

export function createActionToken(
  id: string,
  action: QuickAction,
  userId: string
): string {
  const exp = Math.floor(Date.now() / 1000) + 48 * 3600
  const payload = Buffer.from(JSON.stringify({ id, action, userId, exp })).toString('base64url')
  return `${payload}.${hmac(payload)}`
}

export function verifyActionToken(token: string): TokenPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null

  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  try {
    const expected = hmac(payload)
    // Constant-time comparison
    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
    ) return null

    const parsed: TokenPayload = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    )

    if (parsed.exp < Math.floor(Date.now() / 1000)) return null
    if (!parsed.id || !parsed.action || !parsed.userId) return null
    if (parsed.action !== 'done' && parsed.action !== 'snooze') return null

    return parsed
  } catch {
    return null
  }
}
