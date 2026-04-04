/**
 * Shared validation utilities.
 * Centralises email validation and contact field parsing
 * that was previously duplicated across API routes and server actions.
 */

/** Basic email format validation */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Validate an array of emails, returning valid and invalid lists */
export function validateEmails(emails: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []

  for (const email of emails) {
    const trimmed = email.trim()
    if (!trimmed) continue
    if (isValidEmail(trimmed)) {
      valid.push(trimmed)
    } else {
      invalid.push(trimmed)
    }
  }

  return { valid, invalid }
}

/** Parse JSONB array fields from Supabase (handles string, array, or missing) */
export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return [] }
  }
  return []
}

/** Parse contact JSONB fields (emails + phones) from a Supabase row */
export function parseContactArrayFields<T extends Record<string, unknown>>(contact: T): T & { emails: string[]; phones: string[] } {
  return {
    ...contact,
    emails: parseJsonArray(contact.emails),
    phones: parseJsonArray(contact.phones),
  }
}
