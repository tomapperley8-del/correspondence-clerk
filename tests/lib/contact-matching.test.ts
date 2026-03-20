import { describe, it, expect } from 'vitest'
import {
  matchNameToContact,
  matchEntryToContact,
  matchEntriesToContacts,
} from '@/lib/contact-matching'

// Mock Contact type
interface MockContact {
  id: string
  name: string
  email?: string | null
  emails?: string[]
}

describe('Contact Matching', () => {
  const mockContacts: MockContact[] = [
    { id: '1', name: 'John Smith', email: 'john@example.com' },
    { id: '2', name: 'Jane Doe', email: 'jane@example.com' },
    { id: '3', name: 'Frederick Mitchell', email: 'freddie@example.com', emails: ['freddie@example.com', 'frederick@company.com'] },
    { id: '4', name: 'Benjamin Williams', email: 'ben@example.com' },
    { id: '5', name: 'Jonathan Fuller', email: 'jon@example.com' },
  ]

  describe('matchNameToContact', () => {
    it('should match exact name', () => {
      const result = matchNameToContact('John Smith', mockContacts as any)
      expect(result?.id).toBe('1')
    })

    it('should match first name only', () => {
      const result = matchNameToContact('John', mockContacts as any)
      expect(result?.id).toBe('1')
    })

    it('should match email address', () => {
      const result = matchNameToContact('jane@example.com', mockContacts as any)
      expect(result?.id).toBe('2')
    })

    it('should match nickname to full name (Freddie -> Frederick)', () => {
      const result = matchNameToContact('Freddie', mockContacts as any)
      expect(result?.id).toBe('3')
    })

    it('should match nickname to full name (Ben -> Benjamin)', () => {
      const result = matchNameToContact('Ben', mockContacts as any)
      expect(result?.id).toBe('4')
    })

    it('should match nickname to full name (Jon -> Jonathan)', () => {
      const result = matchNameToContact('Jon', mockContacts as any)
      expect(result?.id).toBe('5')
    })

    it('should return null for "me"', () => {
      const result = matchNameToContact('me', mockContacts as any)
      expect(result).toBeNull()
    })

    it('should return null for "I"', () => {
      const result = matchNameToContact('I', mockContacts as any)
      expect(result).toBeNull()
    })

    it('should return null for "Bridget" (the app user)', () => {
      const result = matchNameToContact('Bridget', mockContacts as any)
      expect(result).toBeNull()
    })

    it('should return null for null input', () => {
      const result = matchNameToContact(null, mockContacts as any)
      expect(result).toBeNull()
    })

    it('should return null for non-existent contact', () => {
      const result = matchNameToContact('Unknown Person', mockContacts as any)
      expect(result).toBeNull()
    })

    it('should be case insensitive', () => {
      const result = matchNameToContact('JOHN SMITH', mockContacts as any)
      expect(result?.id).toBe('1')
    })

    it('should handle partial name matches', () => {
      const result = matchNameToContact('Frederick', mockContacts as any)
      expect(result?.id).toBe('3')
    })
  })

  describe('matchEntryToContact', () => {
    it('should match sender for received emails', () => {
      const extractedNames = { sender: 'John Smith', recipient: 'me' }
      const result = matchEntryToContact(extractedNames, 'received', mockContacts as any)
      expect(result).toBe('1')
    })

    it('should match recipient for sent emails', () => {
      const extractedNames = { sender: 'me', recipient: 'Jane Doe' }
      const result = matchEntryToContact(extractedNames, 'sent', mockContacts as any)
      expect(result).toBe('2')
    })

    it('should return null when extractedNames is undefined', () => {
      const result = matchEntryToContact(undefined, 'sent', mockContacts as any)
      expect(result).toBeNull()
    })

    it('should handle null direction', () => {
      const extractedNames = { sender: 'John Smith', recipient: 'Jane Doe' }
      const result = matchEntryToContact(extractedNames, null, mockContacts as any)
      // With null direction, it defaults to matching recipient
      expect(result).toBe('2')
    })

    it('should not match when sender/recipient is "me"', () => {
      const extractedNames = { sender: 'me', recipient: null }
      const result = matchEntryToContact(extractedNames, 'received', mockContacts as any)
      expect(result).toBeNull()
    })
  })

  describe('matchEntriesToContacts', () => {
    it('should match multiple entries to contacts', () => {
      const entries = [
        { extracted_names: { sender: 'John Smith', recipient: 'me' }, direction_guess: 'received' as const },
        { extracted_names: { sender: 'me', recipient: 'Jane Doe' }, direction_guess: 'sent' as const },
        { extracted_names: { sender: 'Freddie', recipient: 'me' }, direction_guess: 'received' as const },
      ]

      const results = matchEntriesToContacts(entries, mockContacts as any)

      expect(results).toHaveLength(3)
      expect(results[0].contactId).toBe('1')
      expect(results[0].contactName).toBe('John Smith')
      expect(results[1].contactId).toBe('2')
      expect(results[2].contactId).toBe('3')
    })

    it('should return null contactId for unmatched entries', () => {
      const entries = [
        { extracted_names: { sender: 'Unknown Person', recipient: 'me' }, direction_guess: 'received' as const },
      ]

      const results = matchEntriesToContacts(entries, mockContacts as any)

      expect(results[0].contactId).toBeNull()
      expect(results[0].confidence).toBe('low')
    })

    it('should handle entries without extracted_names', () => {
      const entries = [
        { direction_guess: 'received' as const },
      ]

      const results = matchEntriesToContacts(entries, mockContacts as any)

      expect(results[0].contactId).toBeNull()
    })

    it('should handle empty entries array', () => {
      const results = matchEntriesToContacts([], mockContacts as any)
      expect(results).toHaveLength(0)
    })

    it('should include matchedFrom in results', () => {
      const entries = [
        { extracted_names: { sender: 'John Smith', recipient: 'me' }, direction_guess: 'received' as const },
      ]

      const results = matchEntriesToContacts(entries, mockContacts as any)

      expect(results[0].matchedFrom).toBe('John Smith')
    })
  })
})
