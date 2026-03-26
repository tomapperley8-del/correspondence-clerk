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
