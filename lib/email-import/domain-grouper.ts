import { isPersonalDomain } from './personal-domains'
import { ContactMatch } from './contact-matcher'

export interface ParsedEmailAddress {
  email: string
  displayName: string
}

export interface ScanEmailMeta {
  externalId: string
  subject: string
  from: ParsedEmailAddress
  to: ParsedEmailAddress[]
  date: string // ISO 8601
}

export interface ScanContact {
  id: string // "email:<address>"
  email: string
  name: string
  existingContactId: string | null
  existingBusinessId: string | null // set if contact matches existing but in a different business than proposed
  excluded: boolean
  emailIds: string[]
}

export interface ScanBusiness {
  id: string // "domain:<domain>" or "personal:<email>"
  domain: string // actual domain, or "personal" for personal addresses
  name: string // default display name
  existingBusinessId: string | null
  excluded: boolean
  contacts: ScanContact[]
}

export interface ScanResult {
  provider: 'gmail' | 'outlook'
  scannedAt: string
  months: number
  totalScanned: number
  alreadyImported: number
  businesses: ScanBusiness[]
}

/**
 * Extracts domain from an email address.
 */
function getDomain(email: string): string {
  const parts = email.toLowerCase().split('@')
  return parts.length === 2 ? parts[1] : ''
}

/**
 * Groups a list of scanned emails into the ScanResult structure.
 * - Groups senders and recipients by domain
 * - Matches against existing contacts via the contactMap
 * - Personal domains use sender display name as business name
 * - OWN_EMAILS is the set of email addresses belonging to the user (to exclude from contact discovery)
 */
export function groupEmailsIntoBusinesses(
  emails: ScanEmailMeta[],
  contactMap: Map<string, ContactMatch>,
  ownEmails: Set<string>,
  alreadyImportedHashes: Set<string>,
  provider: 'gmail' | 'outlook',
  months: number
): ScanResult {
  // Collect all unique external email addresses with their display names
  // external = not in ownEmails
  const addressBook = new Map<string, string>() // email -> best display name

  // External message IDs grouped by contact email
  const emailIdsByContact = new Map<string, string[]>()

  for (const email of emails) {
    const allParticipants: ParsedEmailAddress[] = [email.from, ...email.to]

    // Find external participants (not the user's own email)
    const externalParticipants = allParticipants.filter(
      (p) => !ownEmails.has(p.email.toLowerCase())
    )

    for (const participant of externalParticipants) {
      const normalised = participant.email.toLowerCase()

      // Track best display name (prefer one with a real name over just the email)
      const existing = addressBook.get(normalised)
      const displayName = participant.displayName || normalised
      if (!existing || (existing === normalised && displayName !== normalised)) {
        addressBook.set(normalised, displayName)
      }

      // Associate this email ID with this contact
      const ids = emailIdsByContact.get(normalised) ?? []
      if (!ids.includes(email.externalId)) {
        ids.push(email.externalId)
      }
      emailIdsByContact.set(normalised, ids)
    }
  }

  // Group email addresses by domain
  const domainGroups = new Map<string, string[]>() // domain -> [email addresses]

  for (const [email] of addressBook) {
    const domain = getDomain(email)
    if (!domain) continue

    // For personal domains, group individually (each sender = their own "business")
    const groupKey = isPersonalDomain(domain) ? `personal:${email}` : `domain:${domain}`
    const group = domainGroups.get(groupKey) ?? []
    group.push(email)
    domainGroups.set(groupKey, group)
  }

  // Build businesses
  const businesses: ScanBusiness[] = []

  for (const [groupKey, emailAddresses] of domainGroups) {
    const isPersonal = groupKey.startsWith('personal:')
    const identifier = isPersonal ? groupKey.slice('personal:'.length) : groupKey.slice('domain:'.length)

    // Determine default business name
    let businessName: string
    let domain: string

    if (isPersonal) {
      // Use display name from address book
      businessName = addressBook.get(identifier) || identifier
      domain = 'personal'
    } else {
      businessName = identifier // domain as-is
      domain = identifier
    }

    // Check if any of these contacts already exist → find an existing business
    let existingBusinessId: string | null = null
    for (const email of emailAddresses) {
      const match = contactMap.get(email)
      if (match) {
        existingBusinessId = match.businessId
        break
      }
    }

    // Build contacts
    const contacts: ScanContact[] = emailAddresses.map((email) => {
      const match = contactMap.get(email)
      return {
        id: `email:${email}`,
        email,
        name: addressBook.get(email) || email,
        existingContactId: match?.contactId ?? null,
        existingBusinessId: match?.businessId ?? null,
        excluded: false,
        emailIds: emailIdsByContact.get(email) ?? [],
      }
    })

    // Skip if all contacts have 0 emails
    if (contacts.every((c) => c.emailIds.length === 0)) continue

    businesses.push({
      id: groupKey,
      domain,
      name: businessName,
      existingBusinessId,
      excluded: false,
      contacts,
    })
  }

  // Sort: existing businesses first, then by email count descending
  businesses.sort((a, b) => {
    if (a.existingBusinessId && !b.existingBusinessId) return -1
    if (!a.existingBusinessId && b.existingBusinessId) return 1
    const aCount = a.contacts.reduce((s, c) => s + c.emailIds.length, 0)
    const bCount = b.contacts.reduce((s, c) => s + c.emailIds.length, 0)
    return bCount - aCount
  })

  return {
    provider,
    scannedAt: new Date().toISOString(),
    months,
    totalScanned: emails.length,
    alreadyImported: alreadyImportedHashes.size,
    businesses,
  }
}

/**
 * Parses a raw email address string like "John Smith <john@example.com>"
 * or just "john@example.com".
 */
export function parseEmailAddress(raw: string): ParsedEmailAddress {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/)
  if (match) {
    return {
      displayName: match[1].trim().replace(/^["']|["']$/g, ''),
      email: match[2].trim().toLowerCase(),
    }
  }
  return {
    displayName: raw.trim().toLowerCase(),
    email: raw.trim().toLowerCase(),
  }
}

/**
 * Strips HTML tags and decodes common HTML entities.
 * Used when plain text email body is not available.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}
