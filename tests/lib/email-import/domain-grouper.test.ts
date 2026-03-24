import { describe, it, expect } from 'vitest'
import {
  groupEmailsIntoBusinesses,
  parseEmailAddress,
  type ScanEmailMeta,
} from '@/lib/email-import/domain-grouper'
import type { ContactMatch } from '@/lib/email-import/contact-matcher'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeEmail(
  id: string,
  from: string,
  to: string,
  subject = 'Test',
  date = '2025-01-01T10:00:00Z'
): ScanEmailMeta {
  return {
    externalId: id,
    subject,
    from: parseEmailAddress(from),
    to: [parseEmailAddress(to)],
    date,
  }
}

// ─── parseEmailAddress ───────────────────────────────────────────────────────

describe('parseEmailAddress', () => {
  it('parses "Display Name <email>" format', () => {
    const result = parseEmailAddress('John Smith <john@acmecorp.com>')
    expect(result.email).toBe('john@acmecorp.com')
    expect(result.displayName).toBe('John Smith')
  })

  it('parses bare email address', () => {
    const result = parseEmailAddress('john@acmecorp.com')
    expect(result.email).toBe('john@acmecorp.com')
    expect(result.displayName).toBe('john@acmecorp.com')
  })

  it('strips surrounding quotes from display name', () => {
    const result = parseEmailAddress('"Jane Doe" <jane@example.com>')
    expect(result.displayName).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
  })

  it('lowercases bare email', () => {
    const result = parseEmailAddress('JOHN@ACME.COM')
    expect(result.email).toBe('john@acme.com')
  })
})

// ─── groupEmailsIntoBusinesses ───────────────────────────────────────────────

const NO_CONTACTS = new Map<string, ContactMatch>()
const NO_HASHES = new Set<string>()

describe('groupEmailsIntoBusinesses', () => {
  it('groups 3 emails from different contacts at same corporate domain into 1 business', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'alice@acmecorp.com', ME),
      makeEmail('e2', 'bob@acmecorp.com', ME),
      makeEmail('e3', 'carol@acmecorp.com', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, NO_CONTACTS, ownEmails, NO_HASHES, 'gmail', 1)

    expect(result.businesses).toHaveLength(1)
    const biz = result.businesses[0]
    expect(biz.domain).toBe('acmecorp.com')
    expect(biz.contacts).toHaveLength(3)
  })

  it('creates a personal business for a gmail.com sender using display name', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'John Smith <john.smith@gmail.com>', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, NO_CONTACTS, ownEmails, NO_HASHES, 'gmail', 1)

    expect(result.businesses).toHaveLength(1)
    const biz = result.businesses[0]
    expect(biz.domain).toBe('personal')
    expect(biz.name).toBe('John Smith')
  })

  it('excludes the own email address from contacts', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'alice@acmecorp.com', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, NO_CONTACTS, ownEmails, NO_HASHES, 'gmail', 1)

    const allContactEmails = result.businesses.flatMap((b) => b.contacts.map((c) => c.email))
    expect(allContactEmails).not.toContain(ME)
  })

  it('populates existingContactId and existingBusinessId when contact is in contactMap', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const contactMap = new Map<string, ContactMatch>([
      ['alice@acmecorp.com', { businessId: 'biz-uuid-123', contactId: 'contact-uuid-456' }],
    ])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'alice@acmecorp.com', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, contactMap, ownEmails, NO_HASHES, 'gmail', 1)

    const biz = result.businesses[0]
    expect(biz.existingBusinessId).toBe('biz-uuid-123')
    const contact = biz.contacts.find((c) => c.email === 'alice@acmecorp.com')!
    expect(contact.existingContactId).toBe('contact-uuid-456')
    expect(contact.existingBusinessId).toBe('biz-uuid-123')
  })

  it('groups multiple emails from the same sender into one contact with emailIds.length > 1', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'alice@acmecorp.com', ME),
      makeEmail('e2', 'alice@acmecorp.com', ME),
      makeEmail('e3', 'alice@acmecorp.com', ME),
      makeEmail('e4', 'alice@acmecorp.com', ME),
      makeEmail('e5', 'alice@acmecorp.com', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, NO_CONTACTS, ownEmails, NO_HASHES, 'gmail', 1)

    const biz = result.businesses[0]
    expect(biz.contacts).toHaveLength(1)
    expect(biz.contacts[0].emailIds).toHaveLength(5)
  })

  it('handles a mix of existing and new contacts in the same batch', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const contactMap = new Map<string, ContactMatch>([
      ['alice@acmecorp.com', { businessId: 'biz-uuid-123', contactId: 'contact-alice' }],
    ])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'alice@acmecorp.com', ME),  // existing
      makeEmail('e2', 'bob@acmecorp.com', ME),     // new
    ]

    const result = groupEmailsIntoBusinesses(emails, contactMap, ownEmails, NO_HASHES, 'gmail', 1)

    const biz = result.businesses[0]
    const alice = biz.contacts.find((c) => c.email === 'alice@acmecorp.com')!
    const bob = biz.contacts.find((c) => c.email === 'bob@acmecorp.com')!

    expect(alice.existingContactId).toBe('contact-alice')
    expect(bob.existingContactId).toBeNull()
  })

  it('returns correct totalScanned count', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'alice@acmecorp.com', ME),
      makeEmail('e2', 'bob@techstartup.io', ME),
      makeEmail('e3', 'carol@techstartup.io', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, NO_CONTACTS, ownEmails, NO_HASHES, 'gmail', 3)

    expect(result.totalScanned).toBe(3)
    expect(result.months).toBe(3)
    expect(result.provider).toBe('gmail')
  })

  it('creates separate personal businesses for two different gmail senders', () => {
    const ME = 'me@mycompany.com'
    const ownEmails = new Set([ME])

    const emails: ScanEmailMeta[] = [
      makeEmail('e1', 'John Smith <john@gmail.com>', ME),
      makeEmail('e2', 'Jane Doe <jane@gmail.com>', ME),
    ]

    const result = groupEmailsIntoBusinesses(emails, NO_CONTACTS, ownEmails, NO_HASHES, 'gmail', 1)

    expect(result.businesses).toHaveLength(2)
    const names = result.businesses.map((b) => b.name).sort()
    expect(names).toContain('Jane Doe')
    expect(names).toContain('John Smith')
  })
})
