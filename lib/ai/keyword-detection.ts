/**
 * Tier 1 keyword detection for correspondence action flagging.
 *
 * Tier 1 = high-precision financial/obligation keywords that can be auto-applied
 * reliably with minimal false-positive risk. Used as a backstop against AI blind spots
 * (fast-path emails, Meeting/Call notes, low-confidence AI responses).
 *
 * Tier 2 keywords (general commitments, expressed interest, open requests) are NOT
 * handled here — they require human judgment and are surfaced via getOpenThreads()
 * in Phase 2, never auto-flagged.
 */

export type ActionType = 'invoice' | 'waiting_on_them' | 'follow_up' | 'renewal' | 'prospect'

export interface KeywordMatch {
  action_type: ActionType
  confidence: 'high'
  suggested_due_date: null
}

// Tier 1: financial terms — almost never used casually in business correspondence
const TIER1_FINANCIAL = [
  'invoice',
  'overdue',
  'outstanding',
  'unpaid',
  'bacs',
  'remittance',
  'pro forma',
  'not yet paid',
  'balance due',
  'payment due',
  'still owed',
]

// Tier 1: their explicit financial commitments (received direction only → waiting_on_them)
const TIER1_THEIR_FINANCIAL_COMMITMENT = [
  'will check with accounts',
  'will chase the payment',
  'will get the invoice paid',
  'will speak to accounts',
  'will sort the invoice',
]

// Payment resolution phrases — if these appear, the email is confirming payment was made.
// Suppress financial flag to avoid flagging a "payment received" email as an open invoice.
const PAYMENT_RESOLUTION = [
  'paid in full',
  'payment made',
  'payment sent',
  'payment processed',
  'bacs sent',
  'has been paid',
  'has been sent',
  'invoice settled',
  'settled in full',
  'all paid',
  'balance cleared',
  'remittance advice',
]

/**
 * Detects Tier 1 action signals from text.
 *
 * Rules:
 * - Sent email with financial keyword → waiting_on_them (Tom sent invoice, waiting for payment)
 * - Received/Note/Call/Meeting with financial keyword → invoice (outstanding payment owed)
 * - Received email with their explicit financial commitment → waiting_on_them
 * - Payment confirmation phrases suppress all financial flags (avoid false positives)
 *
 * @param text - Correspondence text (raw or formatted)
 * @param direction - 'sent', 'received', or null (Call/Meeting/Note have no direction)
 * @returns KeywordMatch if Tier 1 fires, null otherwise
 */
export function detectTier1Action(
  text: string,
  direction: 'sent' | 'received' | null
): KeywordMatch | null {
  const lower = text.toLowerCase()

  // Their explicit financial commitments (received only) → waiting_on_them
  if (direction === 'received') {
    for (const kw of TIER1_THEIR_FINANCIAL_COMMITMENT) {
      if (lower.includes(kw)) {
        return { action_type: 'waiting_on_them', confidence: 'high', suggested_due_date: null }
      }
    }
  }

  // Check for payment resolution first — suppresses financial flags on confirmations
  const isPaymentConfirmation = PAYMENT_RESOLUTION.some(p => lower.includes(p))
  if (!isPaymentConfirmation) {
    for (const kw of TIER1_FINANCIAL) {
      if (lower.includes(kw)) {
        if (direction === 'sent') {
          // Tom sent invoice or chased payment → waiting for their response
          return { action_type: 'waiting_on_them', confidence: 'high', suggested_due_date: null }
        } else {
          // Received email, or Meeting/Call/Note with financial language → invoice action
          return { action_type: 'invoice', confidence: 'high', suggested_due_date: null }
        }
      }
    }
  }

  return null
}
