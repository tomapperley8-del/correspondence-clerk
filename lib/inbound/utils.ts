/**
 * Shared utilities for inbound email processing.
 * Kept in lib/ (not app/actions/) so they can be imported by both
 * server actions and API routes without 'use server' restrictions.
 */

// Personal email domains — never mapped to a business
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk',
  'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'proton.me', 'fastmail.com', 'aol.com',
])

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase())
}

/**
 * Strip quoted content from email body text.
 * Postmark's StrippedTextReply already does most of this; we apply
 * an extra pass to catch remaining patterns.
 */
export function stripQuotedContent(text: string): string {
  return text
    // "> quoted line" blocks
    .replace(/^(>+[^\n]*\n?)+/gm, '')
    // "On Mon, 1 Jan 2026, John Smith wrote:" style
    .replace(/^On .{5,80}wrote:\s*$/im, '')
    // "-----Original Message-----" and everything after
    .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*/im, '')
    // "From: ... Sent: ... To: ..." header block at bottom of email
    .replace(/^From:\s.+\nSent:\s.+\nTo:\s.+(\nSubject:\s.+)?$/im, '')
    .trim()
}

/**
 * Extract the original sender from a forwarded email body.
 *
 * MUST be called BEFORE stripQuotedContent — that function removes the
 * Outlook From/Sent/To block that this function needs to read.
 *
 * Handles:
 *  - Outlook auto-forward: no marker, From/Sent/To block at top of body
 *  - Gmail: "---------- Forwarded message ----------" marker
 *  - Apple Mail: "Begin forwarded message:" marker
 *
 * Returns null if no forwarding block is found (non-forwarded email,
 * already-stripped body, or unrecognised format).
 */
export function extractForwardedSender(rawBody: string): { email: string; name: string } | null {
  // Regex to extract email from angle brackets <email@domain>
  const angleEmail = /<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/

  // --- Strategy 1: look for a forwarding marker, then find From: after it ---
  const markerRe = /^(?:-{3,}\s*Forwarded message\s*-{3,}|Begin forwarded message:|>{0,3}\s*-{3,}\s*Forwarded by .+)/im
  const markerMatch = markerRe.exec(rawBody)
  if (markerMatch) {
    const after = rawBody.slice(markerMatch.index + markerMatch[0].length)
    const fromLine = /^From:\s+(.{1,200})$/im.exec(after)
    if (fromLine) {
      const emailMatch = angleEmail.exec(fromLine[1])
      if (emailMatch) {
        const email = emailMatch[1].toLowerCase()
        if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          const name = fromLine[1].replace(/<[^>]+>/, '').trim()
          return { email, name }
        }
      }
    }
  }

  // --- Strategy 2: Outlook block — From: immediately followed by Sent: ---
  // Uses \r?\n to handle both CRLF (Outlook) and LF line endings.
  // The Sent: requirement distinguishes a forwarding header from a lone
  // "From: John" attribution line at the bottom of a reply thread.
  const outlookRe = /^From:\s+(.{1,200})\r?\nSent:\s+/im
  const outlookMatch = outlookRe.exec(rawBody)
  if (outlookMatch) {
    const emailMatch = angleEmail.exec(outlookMatch[1])
    if (emailMatch) {
      const email = emailMatch[1].toLowerCase()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        const name = outlookMatch[1].replace(/<[^>]+>/, '').trim()
        return { email, name }
      }
    }
  }

  return null
}
