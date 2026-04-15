/**
 * Keyword and pattern detection for correspondence action flagging.
 *
 * Three detection layers:
 *
 * Tier 1 (TIER1_FINANCIAL) — high-precision financial/obligation terms.
 *   Used at filing time (detectTier1Action) and in the structural promotion SQL
 *   function. False-positive risk is very low because these terms almost never
 *   appear in business correspondence without a financial obligation context.
 *
 * Tier 2 — commitment and interest signals.
 *   NOT auto-flagged at filing time; surfaced via getOpenThreads() and promoted
 *   by the promoteOpenThreadsToActions() SQL function after 7–14 day windows.
 *
 * Regex patterns (COMMITMENT_REGEX_PATTERNS, INTEREST_REGEX_PATTERNS) —
 *   PostgreSQL POSIX regex (for use with ~* operator) that catch conjugated
 *   and grammatical forms that keyword lists miss. Passed as parameters to the
 *   SQL function so this file remains the single source of truth.
 *
 * Payment resolution (PAYMENT_RESOLUTION) — suppresses financial flags on
 *   emails that confirm payment was made. Checked before flagging.
 */

export type ActionType = 'invoice' | 'waiting_on_them' | 'follow_up' | 'renewal' | 'prospect'

export interface KeywordMatch {
  action_type: ActionType
  confidence: 'high'
  suggested_due_date: null
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1: financial terms
// Used on SENT emails → waiting_on_them; on received/notes/calls/meetings → invoice
// These are high-precision: almost never used casually.
// ─────────────────────────────────────────────────────────────────────────────
export const TIER1_FINANCIAL = [
  // Core invoice language
  'invoice',
  'overdue',
  'outstanding',
  'unpaid',
  'remittance',
  'pro forma',
  // UK banking / payment terms
  'bacs',
  'iban',
  'sort code',
  'account number',
  'bank details',
  // Payment status descriptions
  'not yet paid',
  'not been paid',
  'balance due',
  'payment due',
  'still owed',
  'amount due',
  'outstanding amount',
  'outstanding balance',
  'total due',
  'total outstanding',
  'fees outstanding',
  'fees due',
  // Payment chasing language (sent direction → unmistakably Tom is waiting)
  'payment reminder',
  'gentle reminder',
  'kind reminder',
  'friendly reminder',
  'second reminder',
  'final reminder',
  'final notice',
  'chasing',
  'chased',
  // Invoice attachment phrases
  'invoice attached',
  'attached invoice',
  'please find invoice',
  'please find attached the invoice',
  'invoice enclosed',
  // Payment instruction phrases
  'please settle',
  'please arrange payment',
  'please process payment',
  'please transfer',
  'please pay',
  // Service/retainer billing
  'retainer',
  'retainer fee',
  'retainer invoice',
  'membership fee',
  'membership invoice',
  'subscription fee',
  'subscription invoice',
  'annual fee',
  'monthly fee',
  'annual invoice',
  // Deposit billing
  'deposit invoice',
  'deposit payment',
  // Multilingual (for orgs with non-English correspondence)
  'facture',     // French
  'rechnung',    // German
  'factura',     // Spanish / Italian
]

// Tier 1: their explicit financial commitments (received only → waiting_on_them)
const TIER1_THEIR_FINANCIAL_COMMITMENT = [
  'will check with accounts',
  'will chase the payment',
  'will get the invoice paid',
  'will speak to accounts',
  'will sort the invoice',
  'will get payment sorted',
  'will get it paid',
  'will arrange payment',
  'will process the invoice',
  'will raise a purchase order',
  'po being raised',
  'will get a po raised',
  // British colloquial payment commitments (received direction only)
  'sorting the invoice',
  'sorting the payment',
  'sorting invoice payment',
  'will get that sorted',
  'getting that sorted',
  'will sort the payment',
  'sorting it out',
]

// ─────────────────────────────────────────────────────────────────────────────
// Payment resolution
// If these appear in a received email, suppress any financial flag — the invoice
// has been settled. Checked before TIER1_FINANCIAL to avoid false positives.
// ─────────────────────────────────────────────────────────────────────────────
export const PAYMENT_RESOLUTION = [
  // Direct confirmation of payment
  'paid in full',
  'payment made',
  'payment sent',
  'payment processed',
  'payment received',
  'payment confirmed',
  'payment successful',
  'payment complete',
  'payment authorised',
  'payment approved',
  // "We have paid" forms
  'has been paid',
  'have paid',
  'i have paid',
  "i've paid",
  'we have paid',
  "we've paid",
  'paid the invoice',
  'invoice paid',
  'paid today',
  'paid this morning',
  'paid yesterday',
  'just paid',
  // Bank transfer confirmation
  'bacs sent',
  'bacs payment sent',
  'bacs transfer',
  'bank transfer sent',
  'bank transfer made',
  'transfer sent',
  'transfer made',
  'transfer complete',
  'funds transferred',
  'funds sent',
  'funds cleared',
  'faster payment sent',
  'chaps payment',
  // Settlement language
  'has been sent',
  'invoice settled',
  'settled in full',
  'all paid',
  'balance cleared',
  'account settled',
  'account cleared',
  'account now clear',
  'cleared the balance',
  'remittance advice',
  'remittance enclosed',
  'remittance attached',
  // Receipt / proof of payment
  'receipt attached',
  'proof of payment',
  'payment confirmation',
  'receipt enclosed',
  // Acknowledgement of payment
  'thank you for payment',
  'thank you for the payment',
  'thanks for paying',
  'thanks for the payment',
  'received your payment',
  'received payment',
  'we have received payment',
  'we have received your payment',
  // Cheque
  'cheque sent',
  'cheque in the post',
  'check in the mail',
  'cheque enclosed',
  // Direct debit / standing order
  'direct debit set up',
  'dd set up',
  'standing order set up',
  // Digital payment
  'stripe payment',
  'paypal sent',
  'paypal payment',
  // British colloquial payment confirmations
  'thanks for sorting',
  'thanks for sorting that',
  'thanks for sorting it',
  'thanks for sorting the invoice',
  'thanks for sorting the payment',
  'all sorted',
  'all been sorted',
  'sorted the invoice',
  'sorted the payment',
  'got it sorted',
  'getting it sorted',
  'put a payment through',
  'put payment through',
  'put the payment through',
  'payment gone through',
  'payment has gone through',
  'payment went through',
  'payment on its way',
  'money sent',
  'money transferred',
  'settled that',
  'all taken care of',
  'no longer outstanding',
  // Multilingual
  'paiement effectué',   // French
  'virement effectué',   // French
  'zahlung erfolgt',     // German
  'pago realizado',      // Spanish
]

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2: received commitment phrases
// They said they'd follow up, send something, check on something, or take
// an action. Tom needs to wait on them. NOT auto-flagged at filing time —
// requires 7+ days of no reply to confirm the commitment wasn't fulfilled.
// ─────────────────────────────────────────────────────────────────────────────
export const TIER2_RECEIVED_COMMITMENTS = [
  // ── Core "get back to you" forms ──
  'will get back to you',
  'will come back to you',
  "i'll come back",
  "i'll get back",
  "we'll be in touch",
  'will be in touch',
  "i'll be in touch",
  'coming back to you',
  'will revert',
  'will revert back',
  'i will revert',
  'we will revert',
  "i'll revert",

  // ── "Follow up" forms ──
  'will follow up',
  "i'll follow up",
  'will follow up on',
  "i'll follow up on this",
  'will follow up on this',

  // ── "Let me check / find out" forms ──
  'let me check',
  'let me find out',
  'let me look into',
  'let me look at',
  'let me have a look',
  'let me have a think',
  'let me ask',
  'let me ask around',
  'let me confirm',
  'let me get back to you',
  'let me come back to you',
  'let me see what i can',

  // ── "Will check / look into" forms ──
  'will check',
  'will check and',
  "i'll check",
  "i'll check with",
  "i'll check on",
  "i'll check on this",
  'will look into it',
  'will look into this',
  "i'll look into it",
  "i'll look into this",
  "i'll look at this",
  "i'll look at it",

  // ── "Will confirm / let you know" forms ──
  'will confirm',
  "i'll confirm",
  "we'll confirm",
  'will let you know',
  "i'll let you know",
  "we'll let you know",
  'will update you',
  "i'll update you",
  "we'll update you",
  'will keep you updated',
  "i'll keep you updated",
  "we'll keep you updated",
  'will keep you posted',
  "i'll keep you posted",

  // ── "Will send / forward" forms ──
  "i'll send",
  "i'll send over",
  "i'll send that over",
  "i'll send it over",
  "i'll send you",
  "we'll send over",
  "we'll send",
  "i'll forward",
  "i'll forward that",
  "i'll forward it",
  "we'll forward",
  "i'll pass this on",
  "i'll pass it on",
  'will pass this on',
  'passing this on',
  'will forward',

  // ── "Will speak to / ask" forms ──
  "i'll speak to",
  "i'll talk to",
  "i'll ask",
  "i'll ask the",
  "i'll ask our",
  'will speak to',
  'will talk to',
  'will ask',
  "i'll liaise with",
  'will liaise with',

  // ── "Sort it / handle it" forms ──
  "i'll sort it",
  "i'll sort this",
  "i'll sort that",
  "i'll sort it out",
  "i'll get that sorted",
  "i'll get it sorted",
  "i'll get this sorted",
  "we'll sort it",
  "we'll sort this",
  "we'll get that sorted",
  "i'll handle it",
  "i'll handle this",
  "we'll handle it",
  "i'll take care of it",
  "i'll take care of this",
  "we'll take care of it",
  "i'll see to it",
  "i'll see to this",

  // ── "Arrange / book" forms ──
  "i'll arrange",
  "i'll arrange for",
  "i'll arrange a",
  "we'll arrange",
  "i'll book",
  "i'll book that in",
  "we'll book",
  "i'll get a date",
  "i'll get a time",
  "i'll find a time",
  "i'll get a date in the diary",
  "i'll schedule",
  "we'll schedule",

  // ── "Chase it" forms ──
  "i'll chase",
  "i'll chase this",
  "i'll chase that",
  "i'll chase it up",
  "i'll chase this up",
  'chasing this',
  'chasing this for you',
  'chasing it up',
  'chasing it up for you',
  'will chase',
  'will chase this',

  // ── "Action it" forms ──
  "i'll action",
  "i'll action this",
  "i'll action it",
  'will action this',
  'will action it',
  'actioning this',
  'actioning it',
  'being actioned',

  // ── "On it" and informal commitment ──
  "i'm on it",
  "we're on it",
  'leave it with me',
  'leave this with me',
  "i'll get right on it",
  "i'll get on it",
  "i'll get right back to you",

  // ── Business jargon ──
  "i'll circle back",
  "we'll circle back",
  'circling back',
  "i'll loop back",
  "we'll loop back",
  'looping back',
  "i'll reach out",
  "we'll reach out",
  'will reach out',
  "i'll drop you",
  "i'll drop you a line",
  "i'll drop you an email",
  "i'll ping you",
  "i'll message you",

  // ── Investigation / escalation ──
  "i'll investigate",
  "we'll investigate",
  "i'll look further into",
  "i'll dig into",
  "i'll escalate",
  "we'll escalate",

  // ── Progress indicators ──
  "we're looking into it",
  "i'm looking into it",
  "we're looking into this",
  "i'm looking into this",
  'currently looking into',
  "we're working on it",
  "we're working on this",
  'working on it',
  'in progress',
  'under review',
  'being reviewed',
  'being looked into',
  'being checked',
  'being investigated',

  // ── Approval / pending ──
  'awaiting approval',
  'pending approval',
  'subject to approval',
  'awaiting sign off',
  'pending sign off',
  'awaiting sign-off',
  'pending sign-off',
  'awaiting confirmation',
  'pending confirmation',
  'awaiting authorisation',
  'pending authorisation',
  'awaiting response from',
  'waiting for approval',
  'waiting for sign off',
]

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2: inbound interest / enquiry signals
// Received emails where the sender is expressing interest in Tom's
// products/services or making an enquiry. Tom should respond.
// NOT auto-flagged; requires 7+ days of no reply.
// ─────────────────────────────────────────────────────────────────────────────
export const TIER2_INTEREST_SIGNALS = [
  // ── Direct interest expressions ──
  'interested in',
  "we're interested in",
  "i'm interested in",
  'we are interested in',
  'i am interested in',
  'keen to',
  'keen on',
  'would love to',
  'would like to',
  "we'd like to",
  "i'd like to",
  'we would like to',
  'i would like to',

  // ── Looking for / to ──
  'looking for',
  "we're looking for",
  "i'm looking for",
  "we're looking to",
  "i'm looking to",
  'we are looking to',
  'we are looking for',
  'i am looking to',

  // ── Enquiry openers ──
  'reaching out about',
  'reaching out to enquire',
  'reaching out to ask',
  'getting in touch about',
  'getting in touch to',
  'contacting you about',
  'contacting you to',
  'enquiring about',
  'inquiring about',
  'writing to enquire',
  'writing to ask',
  'i have an enquiry',
  'we have an enquiry',

  // ── Pricing / quote requests ──
  'what are your rates',
  'what are your prices',
  'what are your fees',
  'what is your pricing',
  'what would you charge',
  'what do you charge',
  'how much would',
  'how much does',
  'how much do you',
  'how much is',
  'what is the cost',
  'what are the costs',
  'what would it cost',
  'can you quote',
  'could you quote',
  'request a quote',
  'get a quote',
  'receive a quote',
  'quotation',
  'a quote for',

  // ── Availability / meeting requests ──
  'do you have availability',
  'are you available',
  'when are you available',
  'when are you next available',
  'do you have capacity',
  'can we arrange a meeting',
  'can we schedule a meeting',
  'can we set up a meeting',
  'can we book a meeting',
  'can we arrange a call',
  'can we have a call',
  'would you be available for a call',
  'like to book',
  'like to schedule',
  'like to arrange',
  'like to reserve',

  // ── Information requests ──
  'can you tell me',
  'could you tell me',
  'can you let me know',
  'could you let me know',
  'would you be able to',
  'are you able to',
  'do you offer',
  'more information',
  'more info',
  'more details',
  'further information',
  'further details',
  'tell me more',
  'tell us more',
  'find out more',
  'send me more',
  'send us more',

  // ── Proposal / partnership interest ──
  'send a proposal',
  'put together a proposal',
  'can you send your',
  'could you send your',
  'could you send over',
  'can you send over',
  'send over your',
  'can you provide',
  'could you provide',
  'can you share',
  'could you share',

  // ── Considering / exploring ──
  'considering',
  "we're considering",
  "i'm considering",
  'thinking about',
  "we're thinking about",
  "i'm thinking about",
  'exploring options',
  'exploring the possibility',
  'exploring whether',
  'looking into options',
  'investigating options',

  // ── Membership / sign-up ──
  'how do we sign up',
  'how do i sign up',
  'how do we join',
  'how do i join',
  'how do we get started',
  'how do i get started',
  'how do we proceed',
  'next steps',
  'membership enquiry',
  'membership query',
  'interested in membership',
  'interested in joining',
  'looking to join',
  'looking to sign up',
  'looking to advertise',
  'interested in advertising',
  'advertising opportunities',
  'sponsorship opportunities',
  'looking to sponsor',

  // ── Referred / discovered ──
  'been recommended',
  'recommended to us',
  'recommended to me',
  'referred to us',
  'referred to me',
  'heard about you',
  'heard about your',
  'came across your',
  'came across you',
  'found your website',
  'found you online',
  'saw your listing',
  'saw your advert',
  'saw your advertisement',
]

// ─────────────────────────────────────────────────────────────────────────────
// Regex patterns for commitment detection (Signal 2)
// PostgreSQL POSIX extended regex — used with the ~* operator (case-insensitive).
// These catch grammatical commitment forms that keyword lists miss:
//   - "I'll sort the contract details" (any noun after verb, not in keyword list)
//   - "I'm going to check with my manager" (going-to future)
//   - "This is being actioned by our team" (passive with qualifier)
//
// Each pattern uses \y for PostgreSQL word boundaries to prevent partial-word
// matches. Apostrophes (') are treated as literal characters in POSIX regex.
// ─────────────────────────────────────────────────────────────────────────────
export const COMMITMENT_REGEX_PATTERNS = [
  // "I'll / We'll / I will / We will + any follow-up verb"
  // Catches any action verb after a commitment modal — the most universal form
  "\\y(i'?ll|i will|we'?ll|we will)[[:space:]]+(sort|handle|look|check|get[[:space:]]+back|send|ask|chase|confirm|update|arrange|book|forward|pass|action|reach[[:space:]]+out|speak|talk|call|ring|email|ping|drop|investigate|escalate|follow[[:space:]]+up|circle[[:space:]]+back|loop[[:space:]]+back)",

  // "I'm going to / We're going to + verb" (going-to future form)
  "\\y(i'?m going to|we'?re going to)[[:space:]]+(get[[:space:]]+back|follow[[:space:]]+up|check|look[[:space:]]+into|sort|arrange|confirm|send|forward|update|investigate|speak|ask|chase)",

  // "Let me + verb" — polite commitment to check/investigate
  "\\ylet me[[:space:]]+(check|look|ask|find[[:space:]]+out|come[[:space:]]+back|get[[:space:]]+back|have[[:space:]]+a[[:space:]]+look|see|confirm|investigate)",

  // "Leave it/this/that with me" — definitive commitment
  "\\yleave (it|this|that) with me\\y",

  // "I'm / We're on it/this/that" — active handling
  "\\y(i'?m|we'?re) on (it|this|that)\\y",

  // Business jargon: circling/looping back
  "\\y(circling|looping) back\\y",

  // Passive commitment: "being actioned", "will be looked into", etc.
  "\\y(will be|being|is being)[[:space:]]+(actioned|looked into|sorted|handled|chased|followed[[:space:]]+up|processed|forwarded|reviewed|investigated|escalated)",

  // Awaiting / pending approval — they're in process, waiting for sign-off
  "\\y(awaiting|pending)[[:space:]]+(approval|sign.?off|confirmation|authorisation|authorization|sign[[:space:]]+off)",
]

// ─────────────────────────────────────────────────────────────────────────────
// Regex patterns for interest/enquiry detection (Signal 4)
// Catches polite request forms and interest expressions that specific keyword
// lists miss. Applied to RECEIVED emails only.
// ─────────────────────────────────────────────────────────────────────────────
export const INTEREST_REGEX_PATTERNS = [
  // Polite requests: "Could/Can/Would you + send/provide/etc"
  // The most universal form of an inbound enquiry/request
  "\\y(could|can|would) you[[:space:]]+(send|provide|share|give|tell|let us know|confirm|advise|quote|help|assist|arrange|set up|book)",

  // "Would you be able to + verb"
  "\\ywould you be able to[[:space:]]+(send|provide|help|assist|advise|quote|confirm|tell|let|arrange|book|share|accommodate)",

  // "Are you able to + verb"
  "\\yare you able to[[:space:]]+(help|assist|accommodate|provide|send|quote|advise|arrange|book|confirm)",

  // "We're / I'm looking to/for" — intent to engage
  "\\y(we'?re|i'?m)[[:space:]]+looking[[:space:]]+(to|for)",

  // "We'd / I'd like to + action verb"
  "\\y(we'?d|i'?d) like to[[:space:]]+(arrange|book|schedule|discuss|explore|find out|get|know|learn|meet|see|speak|talk|visit|sign up|join|advertise|sponsor)",

  // Pricing enquiry patterns
  "\\y(how much|what (are|is) your|what do you charge|what would you charge|what.?s the cost|what are the costs)",

  // Direct interest: "We are / We're / I am / I'm + interested/keen/considering"
  "\\y(we are|we'?re|i am|i'?m)[[:space:]]+(interested|keen|considering|thinking about|hoping to|wanting to)",

  // Classic enquiry openers — almost always means inbound contact
  "\\y(getting in touch|reaching out|contacting you)[[:space:]]+(to|about|regarding|re:)",
]

/**
 * Returns true if the text contains payment resolution language,
 * indicating an invoice or outstanding balance has been settled.
 * Used as a fast-path to resolve flagged invoice/waiting_on_them actions.
 */
export function detectPaymentResolution(text: string): boolean {
  const lower = text.toLowerCase()
  return PAYMENT_RESOLUTION.some(p => lower.includes(p))
}

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
