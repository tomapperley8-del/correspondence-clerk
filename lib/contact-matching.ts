/**
 * Contact Matching Utilities
 * Matches extracted names from emails to existing contacts
 * Per CLAUDE.md: Manual edits only, never invent content
 */

import type { Contact } from '@/app/actions/contacts';

/**
 * Normalize a name for fuzzy matching
 * Removes punctuation, extra spaces, and converts to lowercase
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two names match (fuzzy matching)
 * Handles variations like "Jon Fuller" vs "Jon", "Freddie Mitchell" vs "Frederick"
 */
function namesMatch(extractedName: string, contactName: string): boolean {
  const normalized1 = normalizeName(extractedName);
  const normalized2 = normalizeName(contactName);

  // Exact match
  if (normalized1 === normalized2) {
    return true;
  }

  // First name match (for casual references like "Jon" matching "Jon Fuller")
  const parts1 = normalized1.split(' ');
  const parts2 = normalized2.split(' ');

  // Check if first names match
  if (parts1[0] === parts2[0]) {
    return true;
  }

  // Check for nickname variations (Freddie/Frederick, etc)
  const nicknameMap: Record<string, string[]> = {
    'frederick': ['freddie', 'fred'],
    'benjamin': ['ben', 'benny'],
    'william': ['will', 'bill'],
    'robert': ['rob', 'bob'],
    'richard': ['rick', 'dick'],
    'jonathan': ['jon', 'john'],
    'matthew': ['matt'],
    'christopher': ['chris'],
  };

  // Check both directions
  for (const [full, nicks] of Object.entries(nicknameMap)) {
    if (parts1[0] === full && nicks.includes(parts2[0])) return true;
    if (parts2[0] === full && nicks.includes(parts1[0])) return true;
  }

  // Check if one name is contained in the other (for full name matching)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }

  return false;
}

/**
 * Match an extracted name to a contact
 * Returns the best matching contact or null
 */
export function matchNameToContact(
  extractedName: string | null,
  contacts: Contact[]
): Contact | null {
  if (!extractedName) {
    return null;
  }

  // Special cases: "me", "I", "Bridget" - don't match to contacts (user's own emails)
  if (/^(me|i|bridget)$/i.test(extractedName.trim())) {
    return null;
  }

  // Try exact email match first (if extractedName looks like an email)
  if (extractedName.includes('@')) {
    const emailLower = extractedName.toLowerCase();
    for (const contact of contacts) {
      if (contact.email?.toLowerCase() === emailLower) {
        return contact;
      }
      // Check in emails array if present
      if (contact.emails && Array.isArray(contact.emails)) {
        if (contact.emails.some(e => e.toLowerCase() === emailLower)) {
          return contact;
        }
      }
    }
  }

  // Try name matching
  let bestMatch: Contact | null = null;
  let bestMatchScore = 0;

  for (const contact of contacts) {
    if (namesMatch(extractedName, contact.name)) {
      // Score based on how much of the name matches
      const score = normalizeName(extractedName).split(' ').length;
      if (score > bestMatchScore) {
        bestMatch = contact;
        bestMatchScore = score;
      }
    }
  }

  return bestMatch;
}

/**
 * Match sender/recipient names from a formatted entry to contacts
 * Returns the contact ID that best matches, or null if no match
 */
export function matchEntryToContact(
  extractedNames: { sender: string | null; recipient: string | null } | undefined,
  direction: 'sent' | 'received' | null | undefined,
  contacts: Contact[]
): string | null {
  if (!extractedNames) {
    return null;
  }

  // For received emails, match the sender
  // For sent emails, match the recipient
  const nameToMatch = direction === 'received' ? extractedNames.sender : extractedNames.recipient;

  const matchedContact = matchNameToContact(nameToMatch, contacts);
  return matchedContact?.id || null;
}

/**
 * Result of matching entries to contacts
 */
export interface ContactMatchResult {
  contactId: string | null;
  contactName: string | null;
  matchedFrom: string | null; // The extracted name that was matched
  confidence: 'high' | 'low';
}

/**
 * Match multiple entries to contacts
 * Returns an array of match results, one per entry
 */
export function matchEntriesToContacts(
  entries: Array<{
    extracted_names?: {
      sender: string | null;
      recipient: string | null;
    };
    direction_guess?: 'sent' | 'received' | null;
  }>,
  contacts: Contact[]
): ContactMatchResult[] {
  return entries.map(entry => {
    const contactId = matchEntryToContact(
      entry.extracted_names,
      entry.direction_guess,
      contacts
    );

    if (contactId) {
      const contact = contacts.find(c => c.id === contactId);
      const nameToMatch = entry.direction_guess === 'received'
        ? entry.extracted_names?.sender
        : entry.extracted_names?.recipient;

      return {
        contactId,
        contactName: contact?.name || null,
        matchedFrom: nameToMatch || null,
        confidence: 'high', // We can make this more sophisticated later
      };
    }

    return {
      contactId: null,
      contactName: null,
      matchedFrom: null,
      confidence: 'low',
    };
  });
}
