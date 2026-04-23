/**
 * Shared utilities for inbound email processing.
 * Kept in lib/ (not app/actions/) so they can be imported by both
 * server actions and API routes without 'use server' restrictions.
 */

// Personal email domains and notification service domains — never mapped to a business
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk',
  'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'proton.me', 'fastmail.com', 'aol.com',
  // Transactional/notification services — emails from these should never be
  // mapped to a business as they're shared infrastructure, not a sender identity
  'notification.intuit.com', 'intuit.com', 'quickbooks.com',
  'mailchimp.com', 'mandrillapp.com', 'sendgrid.net', 'amazonses.com',
  'bounce.gmail.com', 'noreply.github.com',
])

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase())
}

/**
 * Derive the set of domains owned by the user from their own_email_addresses
 * (and optionally their auth email). Used to block domain_mapping creation
 * and lookup when the "sender" is really the user's own infrastructure
 * (e.g. a website contact form that forwards from info@yourdomain.com).
 */
export function getOwnDomains(emails: (string | null | undefined)[]): Set<string> {
  const domains = new Set<string>()
  for (const e of emails) {
    const d = (e ?? '').split('@')[1]?.toLowerCase()
    if (d) domains.add(d)
  }
  return domains
}

/**
 * Extract the real sender from a contact-form-style email body.
 *
 * Websites commonly POST contact-form submissions via their own mail alias
 * (e.g. info@yourdomain.com) with the submitter's name/email as labeled
 * fields in the body:
 *
 *   Name: Emily
 *   E-Mail: emily@example.com
 *   Subject: Enquiry
 *   Message: ...
 *
 * Returns null if no Email/E-Mail label is found. The matched Name: line
 * (within 10 lines of the email label) is returned as the name; otherwise
 * the email's local-part is used.
 */
export function extractContactFormSender(rawBody: string): { email: string; name: string } | null {
  // Match a labeled email field. Accept "E-Mail", "E Mail", "Email", or "Sender Email".
  const emailLine = /^\s*(?:E[-\s]?Mail|Email|Sender\s+Email)\s*:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\s*$/im
  const emailMatch = emailLine.exec(rawBody)
  if (!emailMatch) return null

  const email = emailMatch[1].toLowerCase()
  // Reject obvious junk (like empty local-part after normalisation)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null

  // Look for a Name: line anywhere in the body (contact forms usually put
  // Name immediately above Email, but order can vary)
  const nameLine = /^\s*Name\s*:\s*(.{1,100})$/im
  const nameMatch = nameLine.exec(rawBody)
  const rawName = nameMatch ? nameMatch[1].trim() : ''
  // Fall back to the local-part of the email if no name was supplied
  const name = rawName || email.split('@')[0]

  return { email, name }
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
    // Simple "---" separator line (Gmail, ProtonMail, Forward Email thread separator)
    .replace(/^-{3,}\s*\n[\s\S]*/m, '')
    // RFC 2822 signature separator "-- " on its own line
    .replace(/^-- \n[\s\S]*/m, '')
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
  // Fallback: bare email without angle brackets
  const bareEmail = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/

  function extractEmailFromLine(line: string): { email: string; name: string } | null {
    const angleMatch = angleEmail.exec(line)
    if (angleMatch) {
      const email = angleMatch[1].toLowerCase()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        const name = line.replace(/<[^>]+>/, '').trim()
        return { email, name }
      }
    }
    // Fallback: bare email with no angle brackets
    const bareMatch = bareEmail.exec(line)
    if (bareMatch) {
      const email = bareMatch[1].toLowerCase()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        // Name is everything before the bare email, trimmed
        const name = line.slice(0, bareMatch.index).trim() || email
        return { email, name }
      }
    }
    return null
  }

  // --- Strategy 1: look for a forwarding marker, then find From: after it ---
  const markerRe = /^(?:-{3,}\s*Forwarded message\s*-{3,}|Begin forwarded message:|>{0,3}\s*-{3,}\s*Forwarded by .+)/im
  const markerMatch = markerRe.exec(rawBody)
  if (markerMatch) {
    const after = rawBody.slice(markerMatch.index + markerMatch[0].length)
    const fromLine = /^From:\s+(.{1,200})$/im.exec(after)
    if (fromLine) {
      const result = extractEmailFromLine(fromLine[1])
      if (result) return result
    }
  }

  // --- Strategy 2: Outlook block — From: immediately followed by Sent: ---
  // Uses \r?\n to handle both CRLF (Outlook) and LF line endings.
  // The Sent: requirement distinguishes a forwarding header from a lone
  // "From: John" attribution line at the bottom of a reply thread.
  const outlookRe = /^From:\s+(.{1,200})\r?\nSent:\s+/im
  const outlookMatch = outlookRe.exec(rawBody)
  if (outlookMatch) {
    const result = extractEmailFromLine(outlookMatch[1])
    if (result) return result
  }

  // --- Strategy 3: Apple Mail / newer Outlook — From: immediately followed by Date: ---
  // Apple Mail and some Outlook versions use "Date:" instead of "Sent:".
  const appleMailRe = /^From:\s+(.{1,200})\r?\nDate:\s+/im
  const appleMailMatch = appleMailRe.exec(rawBody)
  if (appleMailMatch) {
    const result = extractEmailFromLine(appleMailMatch[1])
    if (result) return result
  }

  return null
}
