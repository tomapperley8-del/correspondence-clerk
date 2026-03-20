/**
 * Internal team members for Chiswick Calendar
 * Used for direction auto-detection (sent vs received)
 */

export const INTERNAL_SENDER_NAMES = ['Bridget', 'Tom', 'James', 'Dawn']
export const INTERNAL_EMAIL_DOMAINS = ['chiswickcalendar.co.uk']
export const INTERNAL_EMAIL_PREFIXES = ['info@']

/**
 * Check if a "from" string belongs to an internal sender
 */
export function isInternalSender(from: string): boolean {
  const lower = from.toLowerCase()
  if (INTERNAL_EMAIL_DOMAINS.some((d) => lower.includes(d))) return true
  if (INTERNAL_EMAIL_PREFIXES.some((p) => lower.includes(p))) return true
  if (INTERNAL_SENDER_NAMES.some((n) => lower.startsWith(n.toLowerCase()))) return true
  return false
}

/**
 * Detect which internal sender a "from" string refers to
 */
export function detectInternalSender(from: string): string | null {
  const lower = from.toLowerCase()
  if (lower.includes('chiswickcalendar.co.uk') || lower.includes('info@')) return 'info@'
  for (const name of INTERNAL_SENDER_NAMES) {
    if (lower.startsWith(name.toLowerCase())) return name
  }
  return null
}
