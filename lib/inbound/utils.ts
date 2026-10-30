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
  // UK consumer ISP domains. These are broadband/mail providers, not business
  // identities, and several share a name with a real business (virgin.net vs
  // Virgin Active, sky.com vs Sky). Without this, one manual filing teaches a
  // domain_mapping that then misfiles every future email from that provider.
  'virgin.net', 'virginmedia.com', 'btinternet.com', 'btconnect.com',
  'sky.com', 'talktalk.net', 'tiscali.co.uk', 'blueyonder.co.uk',
  'ntlworld.com', 'gmx.net', 'gmx.com', 'zen.co.uk', 'plus.net',
  'btopenworld.com', 'ymail.com', 'aol.co.uk', 'gmx.co.uk',
  // Shared mail for members of an institution, not a business identity
  'cantab.net', 'nhs.net',
  // Transactional/notification services — emails from these should never be
  // mapped to a business as they're shared infrastructure, not a sender identity
  'notification.intuit.com', 'intuit.com', 'quickbooks.com',
  'mailchimp.com', 'mandrillapp.com', 'sendgrid.net', 'amazonses.com',
  'bounce.gmail.com', 'noreply.github.com',
])

// Free mail providers that have a domain per country (yahoo.fr, hotmail.it, ...)
const PERSONAL_FAMILIES = /^(yahoo|hotmail|outlook|live|gmx|aol)\.[a-z.]{2,6}$/

export function isPersonalDomain(domain: string): boolean {
  const d = domain.toLowerCase()
  return PERSONAL_DOMAINS.has(d) || PERSONAL_FAMILIES.test(d)
}

// Senders that are services, not businesses Tom deals with. Matched on the
// registrable domain, so any subdomain (news.paypal.com) is covered too.
const NOTIFICATION_DOMAINS = new Set([
  'paypal.com', 'dropbox.com', 'zoom.us', 'hmrc.gov.uk', 'mailchimpapp.com',
  'mynewsdesk.com', 'microsoft.com', 'google.com', 'apple.com', 'amazon.co.uk',
  'amazon.com', 'linkedin.com', 'facebookmail.com', 'eventbrite.com',
  'stripe.com', 'gocardless.com', 'xero.com', 'docusign.net',
])

// Bulk-mail platforms that send from a numbered domain (createsend7.com)
const NOTIFICATION_FAMILIES = /^createsend\d*\.com$/

/**
 * The part of a domain someone registers: thegoodwineshop.co.uk for
 * mail.thegoodwineshop.co.uk, paypal.com for news.paypal.com.
 */
export function registrableDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const last2 = parts.slice(-2).join('.')
  // co.uk, org.uk, com.au and friends need one more label
  const keep = /^(co|org|net|gov|ac|ltd|plc|me|com|nhs|sch|police)\.[a-z]{2}$/.test(last2) ? 3 : 2
  return parts.slice(-keep).join('.')
}

/**
 * Why an email from this domain must not create a new business, or null if it
 * may. Personal providers are handled separately by isPersonalDomain.
 *
 * Businesses Tom deals with write from their own domain (jane@shop.co.uk). A
 * sender on a subdomain (news.paypal.com, x18z3o47.outinchiangmai.com,
 * outlook.mail.microsoft) is a mailing system or spam in every case seen in the
 * 135 businesses auto-created between 21 Sep and 21 Oct 2026, so those are
 * refused too. Nothing is lost: a refused received email is kept in the inbox
 * queue as discarded, a refused BCC'd sent email waits in the inbox for filing
 * by hand, and a business already on file is still matched as before.
 */
export function newBusinessRefusal(domain: string): string | null {
  const d = domain.toLowerCase()
  const root = registrableDomain(d)
  if (NOTIFICATION_DOMAINS.has(root) || NOTIFICATION_FAMILIES.test(root)) return 'notification service'
  if (root !== d) return 'sent from a subdomain'
  return null
}

/**
 * Normalise a domain or business name into comparable tokens.
 * Strips TLDs, common suffixes (ltd, limited, inc, llc, the), punctuation,
 * and lowercases. Returns sorted unique tokens.
 */
const STOP_WORDS = new Set([
  'ltd', 'limited', 'inc', 'llc', 'plc', 'co', 'uk', 'com', 'org', 'net',
  'the', 'and', 'of', 'for', 'www',
])

function normaliseForComparison(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .sort()
}

/**
 * Place words: too general to tie a domain to one business. Many local
 * organisations' domains contain them (chiswickchamberorchestra.org,
 * london-fire.gov.uk), so sharing one says nothing.
 */
export const PLACE_WORDS = new Set([
  'chiswick', 'london', 'w4', 'hammersmith', 'ealing', 'hounslow', 'brentford', 'kew',
  'acton', 'gunnersbury', 'turnham', 'grove', 'strand', 'richmond', 'fulham', 'putney',
  'west', 'east', 'north', 'south', 'uk', 'england', 'british',
])

const withoutPlaces = (s: string) =>
  [...PLACE_WORDS].sort((a, b) => b.length - a.length).reduce((x, p) => x.split(p).join(''), s)

/**
 * Score how well a domain name matches a business name.
 * Returns a value between 0 and 1. A score >= 0.6 is a good match.
 *
 * A match must rest on more than a place word. Until 30 Oct 2026 "chiswick"
 * alone made chiswickchamberorchestra.org and chiswickcalendar.co.uk score 0.9
 * for "B&Q CHISWICK", and "london" gave S&V LONDON eleven unrelated domains.
 */
export function domainBusinessNameScore(domain: string, businessName: string): number {
  // The company part: "stripe" for email.stripe.com, not "email", which once
  // matched a business called "Mail" and filed Stripe's mail there.
  const domainBase = registrableDomain(domain).split('.')[0] ?? ''
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const domainLetters = letters(domainBase)
  // The whole name, letters only: svlondon.com is S&V LONDON, bqchiswick.co.uk is B&Q CHISWICK
  if (domainLetters.length >= 2 && domainLetters === letters(businessName)) return 1

  const domainTokens = normaliseForComparison(domainBase)
  const bizTokens = normaliseForComparison(businessName)
  if (domainTokens.length === 0 || bizTokens.length === 0) return 0

  // In the name's own order, so "smithplumbing" is found in "Smith Plumbing"
  const inOrder = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
  const domainJoined = domainTokens.join('')
  const bizJoined = inOrder(businessName).join('')
  // What's left of the name without place words: "" for B&Q CHISWICK, "pier trust" for Chiswick Pier Trust
  const bizOwn = inOrder(businessName).filter(t => !PLACE_WORDS.has(t)).join('')
  if (bizOwn.length >= 4 && domainJoined.includes(bizOwn)) return 0.9
  // A short domain inside the name (tabard.org.uk, "Theatre at the Tabard") needs a word of its own
  if (withoutPlaces(domainJoined).length >= 4 && bizJoined.includes(domainJoined)) return 0.9

  // Token overlap, place words left out on both sides
  const domainOwn = domainTokens.filter(t => !PLACE_WORDS.has(t))
  const bizOwnTokens = bizTokens.filter(t => !PLACE_WORDS.has(t))
  if (domainOwn.length === 0 || bizOwnTokens.length === 0) return 0
  const matched = domainOwn.filter(t => bizOwnTokens.some(b => b === t || (Math.min(b.length, t.length) >= 4 && (b.includes(t) || t.includes(b)))))
  return matched.length / Math.max(domainTokens.length, bizTokens.length)
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
    // A login on gmail.com doesn't make every Gmail sender us
    if (d && !isPersonalDomain(d)) domains.add(d)
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
 * Every sender named in a forwarded or quoted chain, in the order they appear
 * (Stage 18). Looks at "From:" header lines, "On ..., Name <email> wrote:"
 * attributions and contact-form "Email:" fields. Outlook's
 * "info@x.co.uk<mailto:info@x.co.uk>" doubling is read as one address.
 */
export function chainSenders(rawBody: string): { email: string; name: string }[] {
  const out: { at: number; email: string; name: string }[] = []
  const addr = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/
  const push = (at: number, line: string, nameHint?: string) => {
    const m = addr.exec(line)
    if (!m) return
    const email = m[1].toLowerCase().replace(/\.+$/, '')
    const before = line.slice(0, m.index).replace(/[<"'\[(]+\s*$/, '').trim()
    out.push({ at, email, name: (nameHint ?? before) || email.split('@')[0] })
  }
  for (const m of rawBody.matchAll(/^>*\s*\*?From:\*?\s+(.{1,200})$/gim)) push(m.index ?? 0, m[1])
  // "On Mon, 26 Oct 2026 at 15:39, Name <email> wrote:" (may wrap onto two lines)
  for (const m of rawBody.matchAll(/^>*\s*On\s[^\n]{0,120}?(?:\n[^\n]{0,120}?)?\bwrote:/gim)) {
    const text = m[0].replace(/\s+/g, ' ')
    const e = addr.exec(text)
    if (!e) continue
    // The name sits between the date and the address: after the last comma, and after any time
    const name = text.slice(0, e.index).split(',').at(-1)!
      .replace(/^.*\d{1,2}:\d{2}(?:\s*[ap]m)?/i, '').replace(/[<"'\s]+$/, '').trim()
    push(m.index ?? 0, text.slice(e.index), name || undefined)
  }
  for (const m of rawBody.matchAll(/^\s*(?:E[-\s]?Mail|Email|Sender\s+Email)\s*:\s*([^\s]+@[^\s]+)\s*$/gim)) {
    const name = /^\s*Name\s*:\s*(.{1,100})$/im.exec(rawBody.slice(Math.max(0, (m.index ?? 0) - 600), (m.index ?? 0) + 600))
    push(m.index ?? 0, m[1], name?.[1]?.trim())
  }
  return out.sort((a, b) => a.at - b.at).map(({ email, name }) => ({ email, name }))
}

/**
 * The original sender of an email a team member (or Tom) forwarded: the first
 * sender in the chain who is not one of us. `isUs` says whether an address is
 * Tom's own or a team member's. Returns null when the chain names nobody else.
 */
export function originalSenderOfForward(
  rawBody: string,
  isUs: (email: string) => boolean,
): { email: string; name: string } | null {
  return chainSenders(rawBody).find((s) => !isUs(s.email)) ?? null
}

/** A forward, judged from the subject or a forwarding marker in the body. */
export function looksForwarded(subject: string, rawBody: string): boolean {
  return /^\s*(?:(?:re|aw)\s*:\s*)*(?:fw|fwd)\s*:/i.test(subject) ||
    /^(?:-{3,}\s*Forwarded message\s*-{3,}|Begin forwarded message:|_{10,}\s*$)/im.test(rawBody)
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

/**
 * Readable body text from a stored raw email, with no AI involved.
 *
 * The raw text we keep looks like this:
 *
 *   From: Someone <someone@example.com>
 *   Date: 2026-09-17T09:02:55.000Z
 *   Subject: Whatever
 *
 *   ________________________________
 *
 *   the actual message
 *
 *   From: Tom | The Chiswick Calendar <tom@...>
 *   Sent: 16 September 2026 11:08
 *   ... the quoted chain ...
 *
 * Before 17 Sep 2026 the body was only ever written by the AI formatter, so
 * with AI switched off 626 entries were saved with nothing readable in them at
 * all. This takes the header block off the top, cuts the quoted chain off the
 * bottom, and tidies Outlook's <mailto:> and <http> link noise.
 *
 * Since Stage 15 (Oct 2026) it also cuts at "Sent from my iPhone" and at legal
 * disclaimers and mailing-list footers, drops picture placeholders, tracking
 * links and "view in browser" lines, and unwraps Outlook safe links. The SQL
 * twin plain_email_body() follows the same rules. Originals are never changed.
 */
export function plainEmailBody(rawText: string | null | undefined): string {
  if (!rawText) return ''
  let body = rawText.replace(/\r\n/g, '\n')

  // Drop the header block: either up to the underscore rule Outlook inserts,
  // or the leading From/Date/Subject lines when there is no rule.
  const rule = body.match(/\n_{10,}\n/)
  if (rule && rule.index !== undefined && rule.index < 600) {
    body = body.slice(rule.index + rule[0].length)
  } else {
    body = body.replace(/^(?:(?:From|To|Cc|Date|Sent|Subject|Reply-To):[^\n]*\n)+/i, '')
  }

  // Cut at the earliest of: the quoted reply, the phone sign-off (everything
  // after "Sent from my iPhone" is the quoted chain), or a legal or mailing-list
  // footer. Footers only count after the first 200 characters, so a short
  // message that opens with "This email..." is never emptied.
  let cut = -1
  const earliest = (p: RegExp, from: number) => {
    const m = p.exec(body.slice(from))
    if (m && (cut < 0 || from + m.index < cut)) cut = from + m.index
  }
  for (const p of QUOTE_CUTS) earliest(p, 0)
  for (const p of FOOTER_CUTS) earliest(p, Math.min(200, body.length))
  if (cut >= 0) body = body.slice(0, cut)

  // Pictures ([https://...logo.png], [cid:image001.png@...], [image: Logo]) are
  // logos and spacers, except in a message that is nothing but pictures, where
  // a plain marker says something was sent.
  const tidied = tidyBody(body, '')
  return tidied || tidyBody(body, '[picture]')
}

function tidyBody(body: string, picture: string): string {
  return body
    .replace(SAFELINK, (_m, url: string) => safeDecode(url))
    .replace(/<(?:mailto|tel|sms):[^>]*>/gi, '')
    .replace(/<https?:\/\/[^>]*>/gi, '')
    .replace(/\[(?:https?:\/\/|cid:|image)[^\]\n]*\]/gi, picture)
    // Bare mailing-list click counters
    .replace(TRACKING_URL, '')
    .replace(/^.*(?:view (?:this (?:e-?mail|message|newsletter) )?(?:in|on) (?:your|a) (?:web )?browser|having trouble (?:reading|viewing) this).*$/gim, '')
    // Invisible spacer characters marketing emails pad their preview text with
    .replace(/[​-‍⁠﻿͏­]/g, '')
    .replace(/^(?:_{10,}|[*=~]{10,})$/gm, '')
    .replace(/[ \t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000)
}

// The start of a quoted reply or forwarded chain.
const QUOTE_CUTS = [
  /\n_{10,}\s*\n+\s*From:/,
  /\nFrom:[^\n]*\n\s*(?:Sent|Date):/i,
  /\n-{3,}\s*Original Message\s*-{3,}/i,
  /\n-{3,}\s*Forwarded message\s*-{3,}/i,
  /\nOn .{5,120}\bwrote:/,
  /\n-- \n/,
  /\n[ \t]*(?:Sent from my (?:iPhone|iPad|Samsung|Galaxy|Android|BlackBerry|mobile|phone)|Sent from Outlook for (?:iOS|Android)|Get Outlook for (?:iOS|Android))\b/i,
]

// The first line of a legal disclaimer or mailing-list footer. Everything from
// there down is boilerplate (the rest of the disclaimer, unsubscribe links).
const FOOTER_CUTS = [
  /\n[ \t]*(?:Disclaimer\b|DISCLAIMER|CONFIDENTIALITY\b|Confidentiality (?:notice|note)\b)/,
  /\n[ \t]*(?:This|The) (?:e-?mail|message|communication)(?: and any (?:files|attachments)[^\n]{0,40})? (?:is|are|may be) (?:strictly )?(?:confidential|private|intended|legally privileged)/i,
  /\n[ \t]*The (?:information|contents?) (?:contained )?in (?:this|the) (?:e-?mail|message|communication)/i,
  /\n[ \t]*This (?:e-?mail|message) (?:has been|was) (?:scanned|sent to)/i,
  /\n[ \t]*If you (?:are not the intended recipient|have received this (?:e-?mail|message) in error)/i,
  /\n[ \t]*Please consider the environment before printing/i,
  /\n[ \t]*(?:Want to change how you receive these emails|Unsubscribe from this list|You are receiving this (?:e-?mail|newsletter) because|To unsubscribe\b)/i,
]

// Outlook safe links wrap the real address in ?url=...; keep the real one.
const SAFELINK = /https?:\/\/[a-z0-9.-]*safelinks\.protection\.outlook\.com\/\S*?[?&]url=([^&\s>]+)[^\s>]*/gi

const TRACKING_URL = /https?:\/\/(?:[a-z0-9-]+\.)*(?:list-manage\.com|mailchi\.mp|awstrack\.me|sendgrid\.net|hubspotlinks\.com|mjt\.lu|createsend\d*\.com|klclick\d*\.com)\/\S*/gi

function safeDecode(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}
