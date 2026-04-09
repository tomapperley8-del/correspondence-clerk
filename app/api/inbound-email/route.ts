/**
 * Forward Email inbound webhook
 *
 * Forward Email POSTs parsed email JSON to this endpoint when an email arrives at
 * {token}@correspondenceclerk.com
 *
 * ALWAYS returns 200 — any other status causes Forward Email to retry.
 *
 * Flow:
 *  1. Verify HMAC-SHA256 signature (X-Webhook-Signature header)
 *  2. Extract token → look up user
 *  3. Rate limit check (per org)
 *  4. Spam/junk filter
 *  5. Strip quoted content
 *  6. Detect direction: received (forwarded) vs sent (BCCed)
 *  7. Domain match → auto-file OR save to inbound_queue
 *
 * Direction detection:
 *  - Forwarded (received): token address appears in mail.to/cc headers
 *  - BCCed (sent): token only in session.recipient — To shows real recipients
 */

import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { formatCorrespondence } from '@/lib/ai/formatter'
import { isThreadSplitResponse } from '@/lib/ai/types'
import { isPersonalDomain, stripQuotedContent, extractForwardedSender } from '@/lib/inbound/utils'

export const maxDuration = 60

type EmailAddress = { address: string; name: string }

// Forward Email sends a flat payload (fields from mailparser directly at top level)
type ForwardEmailPayload = {
  from: { value: EmailAddress[]; text: string }
  to: { value: EmailAddress[]; text: string }
  cc?: { value: EmailAddress[]; text: string }
  subject: string
  text?: string
  html?: string
  date?: string
  headers: Record<string, string | string[]>
  recipients?: string[]
  session: {
    recipient: string
    sender: string
  }
}

// ---------------------------------------------------------------------------
// Signature verification (HMAC-SHA256)
// ---------------------------------------------------------------------------
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.FORWARD_EMAIL_WEBHOOK_SECRET
  if (!secret) {
    console.warn('FORWARD_EMAIL_WEBHOOK_SECRET not set — skipping signature verification (dev mode)')
    return true
  }
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Token extraction — checks session.recipient first (most reliable), then To/Cc
// ---------------------------------------------------------------------------
function extractToken(payload: ForwardEmailPayload): string | null {
  const candidates = [
    payload.session?.recipient ?? '',
    ...(payload.recipients ?? []),
    payload.to?.text ?? '',
    payload.cc?.text ?? '',
  ]
  for (const field of candidates) {
    const match = field.match(/([a-z0-9-]+)@correspondenceclerk\.com/i)
    if (match) return match[1].toLowerCase()
  }
  return null
}

// ---------------------------------------------------------------------------
// Direction detection
// BCCed (sent): token is in session.recipient but NOT in mail.to/cc text.
// Forwarded (received): token appears in mail.to or mail.cc text.
// ---------------------------------------------------------------------------
function detectDirection(payload: ForwardEmailPayload, token: string): 'received' | 'sent' {
  const pattern = new RegExp(`${token}@correspondenceclerk\\.com`, 'i')
  const inTo = pattern.test(payload.to?.text ?? '')
  const inCc = pattern.test(payload.cc?.text ?? '')
  return inTo || inCc ? 'received' : 'sent'
}

// ---------------------------------------------------------------------------
// Extract recipient emails from To + Cc, excluding our own inbound address
// ---------------------------------------------------------------------------
function extractRecipientEmails(payload: ForwardEmailPayload): string[] {
  const all: EmailAddress[] = [
    ...(payload.to?.value ?? []),
    ...(payload.cc?.value ?? []),
  ]
  return all
    .map(r => r.address?.toLowerCase() ?? '')
    .filter(e => e && !e.includes('@correspondenceclerk.com'))
}

// ---------------------------------------------------------------------------
// Build a flat headers map for spam filter checks.
// Forward Email provides headers in both mail.headers and session.headers.
// ---------------------------------------------------------------------------
function buildHeadersMap(payload: ForwardEmailPayload): Map<string, string> {
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(payload.headers ?? {})) {
    map.set(k.toLowerCase(), Array.isArray(v) ? v[0] : v)
  }
  return map
}

// ---------------------------------------------------------------------------
// Spam / junk filter
// Returns a discard reason string if the email should be silently dropped.
// ---------------------------------------------------------------------------
function shouldDiscard(payload: ForwardEmailPayload, headers: Map<string, string>): string | null {
  const from = (payload.from?.value?.[0]?.address ?? '').toLowerCase()
  const subject = (payload.subject ?? '').toLowerCase()
  const body = (payload.text ?? '').replace(/\s+/g, ' ').trim()

  // No-reply senders
  if (/^(no.?reply|noreply|do.?not.?reply|mailer.?daemon|postmaster|bounce)@/i.test(from)) {
    return 'no-reply sender'
  }

  // Mailing list headers — only discard when combined with a newsletter-y subject.
  // Many legitimate one-off emails (invoices, contact forms, advertising enquiries) are
  // sent via platforms that add these headers automatically; we only want to drop genuine
  // mass-mail where the subject also signals it's a newsletter/promo.
  if (headers.has('list-unsubscribe') || headers.has('list-id')) {
    const newsletterSubject = /\b(newsletter|unsubscribe|weekly digest|roundup|voucher|promo|discount|coupon|deals|offers|sale|subscribe)\b/i.test(subject)
    if (newsletterSubject) return 'mailing list header + newsletter subject'
  }

  // "Unsubscribe" in subject alone is a reliable standalone signal
  if (/\bunsubscribe\b/i.test(subject)) {
    return 'unsubscribe subject'
  }

  // Body too short to be useful
  if (body.length < 20) {
    return 'body too short'
  }

  return null
}

// ---------------------------------------------------------------------------
// Rate limiting (org-keyed, 200 emails/hour)
// ---------------------------------------------------------------------------
async function checkOrgRateLimit(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string
): Promise<boolean> {
  const windowMs = 60 * 60 * 1000 // 1 hour
  const limit = 200
  const now = Date.now()
  const windowStart = new Date(now - windowMs).toISOString()
  const expiresAt = new Date(now + windowMs).toISOString()

  const { data, error } = await supabase
    .from('rate_limits')
    .select('request_count, window_start')
    .eq('identifier', orgId)
    .eq('endpoint', 'inbound-email')
    .maybeSingle()

  if (error) return true // fail open

  if (!data || data.window_start < windowStart) {
    await supabase
      .from('rate_limits')
      .upsert(
        {
          identifier: orgId,
          endpoint: 'inbound-email',
          request_count: 1,
          window_start: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: 'identifier,endpoint' }
      )
    return true
  }

  if (data.request_count >= limit) return false

  await supabase
    .from('rate_limits')
    .update({ request_count: data.request_count + 1 })
    .eq('identifier', orgId)
    .eq('endpoint', 'inbound-email')

  return true
}

// ---------------------------------------------------------------------------
// Build raw text for AI formatter
// ---------------------------------------------------------------------------
function buildRawForAI(
  payload: ForwardEmailPayload,
  strippedBody: string,
  direction: 'received' | 'sent',
  fromOverride?: { email: string; name: string }
): string {
  const fromName = fromOverride?.name ?? payload.from?.value?.[0]?.name ?? ''
  const fromEmail = fromOverride?.email ?? payload.from?.value?.[0]?.address ?? ''
  const date = payload.date ?? new Date().toISOString()
  // Strip "FW:" prefix added by Outlook when forwarding
  const rawSubject = payload.subject ?? ''
  const subject = fromOverride ? rawSubject.replace(/^Fw?:\s*/i, '') : rawSubject

  if (direction === 'sent') {
    const toLine = payload.to?.text ? `To: ${payload.to.text}` : ''
    const ccLine = payload.cc?.text ? `Cc: ${payload.cc.text}` : ''
    return [
      `From: ${fromName} <${fromEmail}>`,
      toLine,
      ccLine,
      `Date: ${date}`,
      `Subject: ${subject}`,
      '',
      strippedBody,
    ].filter(Boolean).join('\n')
  }

  return [
    `From: ${fromName} <${fromEmail}>`,
    `Date: ${date}`,
    `Subject: ${subject}`,
    '',
    strippedBody,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Dead letter: save failed email payload for later retry
// ---------------------------------------------------------------------------
async function saveDeadLetter(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  rawPayload: string,
  failureReason: string,
  failurePoint: string
): Promise<void> {
  try {
    await supabase.from('email_dead_letters').insert({
      org_id: orgId,
      raw_payload: JSON.parse(rawPayload),
      failure_reason: failureReason,
      failure_point: failurePoint,
    })
    log('[inbound-email] dead_lettered', { failurePoint, failureReason })
  } catch (err) {
    log('[inbound-email] dead_letter_save_failed', { error: String(err) })
  }
}

// ---------------------------------------------------------------------------
// Service-role correspondence insert (no user session in webhook context)
// Throws on DB error so caller can dead-letter the payload.
// ---------------------------------------------------------------------------
// Returns the new correspondence ID, or null if the email was a duplicate (dedup skipped).
// Throws on DB error so caller can dead-letter the payload.
async function insertCorrespondenceServiceRole(
  supabase: ReturnType<typeof createServiceRoleClient>,
  opts: {
    orgId: string
    userId: string
    businessId: string
    contactId: string | null
    rawText: string
    subject: string
    entryDate: string
    fromEmail: string
    direction: 'received' | 'sent'
  }
): Promise<string | null> {
  const { data: contentHash } = await supabase.rpc('compute_content_hash', {
    raw_text: opts.rawText,
  })

  // Dedup check
  if (contentHash) {
    const { data: existing } = await supabase
      .from('correspondence')
      .select('id')
      .eq('organization_id', opts.orgId)
      .eq('content_hash', contentHash)
      .limit(1)
      .maybeSingle()
    if (existing) return null // already stored
  }

  const { data: inserted, error: insertError } = await supabase
    .from('correspondence')
    .insert({
      organization_id: opts.orgId,
      business_id: opts.businessId,
      contact_id: opts.contactId,
      user_id: opts.userId,
      raw_text_original: opts.rawText,
      formatted_text_original: null,
      formatted_text_current: null,
      entry_date: opts.entryDate,
      subject: opts.subject,
      type: 'Email',
      direction: opts.direction,
      action_needed: 'none',
      due_at: null,
      formatting_status: 'unformatted',
      content_hash: contentHash || null,
      ai_metadata: {
        source: opts.direction === 'sent' ? 'webhook_bcc' : 'webhook_inbound',
        from_email: opts.fromEmail,
      },
    })
    .select('id')
    .single()

  if (insertError) throw new Error(insertError.message)

  await supabase
    .from('businesses')
    .update({ last_contacted_at: opts.entryDate })
    .eq('id', opts.businessId)

  return inserted.id
}

// Runs after the 200 response is sent. Calls the AI formatter and patches the
// correspondence row with formatted text, a refined date/subject, and any action.
// If the AI fails or times out, the row stays unformatted — never blocks delivery.
async function applyFormattingBackground(
  supabase: ReturnType<typeof createServiceRoleClient>,
  id: string,
  rawText: string,
  fallbackDate: string,
  direction: string
): Promise<void> {
  const formatResult = await formatCorrespondence(rawText, false)
  if (!formatResult.success || isThreadSplitResponse(formatResult.data)) return

  const ai = formatResult.data
  // Always use the email header date (fallbackDate) as the authoritative entry_date.
  // The AI's entry_date_guess can pick up dates from the email body content (e.g.
  // "since we last spoke in March") and set a completely wrong date. For webhook
  // emails the SMTP date header is definitive — don't let the AI override it.
  const entryDate = fallbackDate
  let actionNeeded = 'none'
  let dueAt: string | null = null

  if (ai.action_suggestion?.confidence === 'high' && ai.action_suggestion.action_type) {
    actionNeeded = ai.action_suggestion.action_type
    if (ai.action_suggestion.suggested_due_date) {
      dueAt = ai.action_suggestion.suggested_due_date
    } else {
      const d = new Date(entryDate)
      d.setDate(d.getDate() + 7)
      dueAt = d.toISOString().split('T')[0]
    }
  }

  const update: Record<string, unknown> = {
    formatted_text_original: ai.formatted_text,
    formatted_text_current: ai.formatted_text,
    entry_date: entryDate,
    formatting_status: 'formatted',
    action_needed: actionNeeded,
    due_at: dueAt,
  }
  if (ai.subject_guess) update.subject = ai.subject_guess

  await supabase.from('correspondence').update(update).eq('id', id)
  log('[inbound-email] bg_format_done', { direction, id })
}

// ---------------------------------------------------------------------------
// Match a business by exact email address — checks contacts.emails[] then
// businesses.email. Used for received path before domain matching, so even
// personal-domain senders (e.g. a contact's hotmail) auto-file correctly.
// ---------------------------------------------------------------------------
async function matchBusinessFromEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  email: string
): Promise<{ businessId: string; contactId: string | null } | null> {
  if (!email) return null

  // 1. Check contacts.emails[]
  const { data: contactMatches } = await supabase
    .from('contacts')
    .select('id, business_id')
    .filter('emails', 'cs', JSON.stringify([email]))
    .eq('is_active', true)
    .limit(5)

  if (contactMatches && contactMatches.length > 0) {
    const businessIds = [...new Set(contactMatches.map(c => c.business_id))]
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .in('id', businessIds)
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle()

    if (biz) {
      const contact = contactMatches.find(c => c.business_id === biz.id)!
      return { businessId: biz.id, contactId: contact.id }
    }
  }

  // 2. Check businesses.email field
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('email', email)
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle()

  if (biz) return { businessId: biz.id, contactId: null }

  return null
}

// ---------------------------------------------------------------------------
// Match a business from a list of email addresses (used for sent/BCC path)
// Returns { businessId, contactId } for the first match found, or null.
// Priority: exact email match (works for any domain) → domain mapping.
// ---------------------------------------------------------------------------
async function matchBusinessFromRecipients(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  recipientEmails: string[]
): Promise<{ businessId: string; contactId: string | null; matchedEmail: string } | null> {
  // 1. Exact email match against contacts.emails[] or businesses.email
  //    Handles personal-domain contacts (gmail, hotmail, etc.)
  for (const email of recipientEmails) {
    const match = await matchBusinessFromEmail(supabase, orgId, email)
    if (match) return { ...match, matchedEmail: email }
  }

  // 2. Domain mapping fallback (skips personal domains)
  for (const email of recipientEmails) {
    const domain = email.split('@')[1] ?? ''
    if (!domain || isPersonalDomain(domain)) continue

    const { data: mapping } = await supabase
      .from('domain_mappings')
      .select('business_id')
      .eq('org_id', orgId)
      .eq('domain', domain)
      .maybeSingle()

    if (mapping?.business_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('business_id', mapping.business_id)
        .filter('emails', 'cs', JSON.stringify([email]))
        .limit(1)
        .maybeSingle()

      return {
        businessId: mapping.business_id,
        contactId: contact?.id ?? null,
        matchedEmail: email,
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Match a contact by sender/recipient name when exact email lookup fails.
// Normalises names, requires at least one token ≥4 chars, and only assigns
// when exactly ONE contact matches (avoids ambiguous multi-contact businesses).
// If matched, saves the email to the contact's emails[] so future emails
// auto-match by address without needing another name lookup.
// ---------------------------------------------------------------------------
async function matchContactByNameAndLearn(
  supabase: ReturnType<typeof createServiceRoleClient>,
  businessId: string,
  displayName: string,
  email: string
): Promise<string | null> {
  if (!displayName || !businessId) return null

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, emails')
    .eq('business_id', businessId)
    .eq('is_active', true)

  if (!contacts || contacts.length === 0) return null

  const normalise = (s: string) => s.toLowerCase().trim()
  // Only use name tokens long enough to be meaningful (avoids matching "Al" → "Alice")
  const nameParts = normalise(displayName).split(/\s+/).filter(p => p.length >= 4)
  if (nameParts.length === 0) return null

  const matched = contacts.filter(c => {
    const cn = normalise(c.name ?? '')
    return nameParts.some(part => cn.includes(part))
  })

  // Only assign when exactly one contact matches to avoid wrong assignments
  if (matched.length !== 1) return null

  const contact = matched[0]

  // Save email so future messages auto-match by address
  const existing: string[] = contact.emails ?? []
  if (!existing.map((e: string) => e.toLowerCase()).includes(email.toLowerCase())) {
    await supabase
      .from('contacts')
      .update({ emails: [...existing, email.toLowerCase()] })
      .eq('id', contact.id)
    log('[inbound-email] contact_email_learned_by_name', { contactId: contact.id, email })
  }

  return contact.id
}

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------
function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }))
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Outer try-catch: ALWAYS return 200 — a 500 causes Forward Email to retry indefinitely
  try {
    return await handleInbound(request)
  } catch (err) {
    log('[inbound-email] unhandled_error', { error: String(err) })
    return NextResponse.json({}, { status: 200 })
  }
}

async function handleInbound(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  // 1. Verify signature
  const sig = request.headers.get('x-webhook-signature') ?? ''
  if (!verifySignature(rawBody, sig)) {
    log('[inbound-email] sig_mismatch')
    return NextResponse.json({}, { status: 200 })
  }

  // 2. Parse payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any
  try {
    raw = JSON.parse(rawBody)
  } catch {
    log('[inbound-email] parse_error')
    return NextResponse.json({}, { status: 200 })
  }

  const payload: ForwardEmailPayload = raw
  if (!payload.from && !payload.session) {
    log('[inbound-email] unexpected_payload', { keys: Object.keys(raw ?? {}).join(',') })
    return NextResponse.json({}, { status: 200 })
  }

  // 3. Extract token and look up user
  const token = extractToken(payload)
  log('[inbound-email] received', {
    from: payload.from?.value?.[0]?.address ?? '',
    subject: payload.subject ?? '',
    sessionRecipient: payload.session?.recipient ?? '',
    token: token ?? '(none)',
  })

  if (!token) {
    log('[inbound-email] no_token')
    return NextResponse.json({}, { status: 200 })
  }

  const supabase = createServiceRoleClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, organization_id, own_email_addresses')
    .eq('inbound_email_token', token)
    .maybeSingle()

  if (!profile) {
    log('[inbound-email] unknown_token', { token })
    return NextResponse.json({}, { status: 200 })
  }

  const orgId: string = profile.organization_id
  const userId: string = profile.id

  // Fetch the user's auth email so we can treat it as an own address
  const { data: authUserData } = await supabase.auth.admin.getUserById(userId)
  const authEmail = authUserData?.user?.email?.toLowerCase() ?? ''

  // 4. Rate limit
  const allowed = await checkOrgRateLimit(supabase, orgId)
  if (!allowed) {
    log('[inbound-email] rate_limited', { orgId })
    return NextResponse.json({}, { status: 200 })
  }

  // 5. Build headers map
  const headers = buildHeadersMap(payload)

  // 6. Spam filter (applies to both directions)
  const fromEmail = (payload.from?.value?.[0]?.address ?? '').toLowerCase()
  const fromName = payload.from?.value?.[0]?.name ?? ''

  // fromSelf bypass: own-address emails skip the spam filter entirely
  // (handles BCC'd sent emails that would otherwise look like newsletters)
  const ownEmails: string[] = [
    authEmail,
    ...(profile.own_email_addresses ?? []).map((e: string) => e.toLowerCase()),
  ].filter(Boolean)
  const fromSelf = ownEmails.includes(fromEmail)

  // For forwarded received emails (fromSelf=true), the outer SMTP From is the Outlook
  // forwarder's address. Extract the original sender buried in the forwarded body.
  // Must run on payload.text (raw body) BEFORE stripQuotedContent removes the block.
  // For BCC sent emails that are also fromSelf, extractForwardedSender returns null
  // (no forwarding block) → effectiveFromEmail stays as fromEmail. Safe.
  let effectiveFromEmail = fromEmail
  let effectiveFromName = fromName

  if (fromSelf) {
    const forwardedSender = extractForwardedSender(payload.text ?? '')
    if (forwardedSender) {
      effectiveFromEmail = forwardedSender.email
      effectiveFromName = forwardedSender.name
      log('[inbound-email] forwarded_sender_extracted', { original: fromEmail, extracted: effectiveFromEmail })
    }
  }

  // 6b. Blocked sender check
  if (!fromSelf) {
    const { data: blocked } = await supabase
      .from('blocked_senders')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', effectiveFromEmail)
      .maybeSingle()

    if (blocked) {
      log('[inbound-email] discarded', { reason: 'blocked sender', from: effectiveFromEmail })
      return NextResponse.json({}, { status: 200 })
    }
  }

  const discardReason = fromSelf ? null : shouldDiscard(payload, headers)
  if (discardReason) {
    log('[inbound-email] discarded', { reason: discardReason, from: fromEmail })
    await supabase.from('inbound_queue').insert({
      org_id: orgId,
      from_email: fromEmail,
      from_name: fromName || null,
      subject: payload.subject ?? null,
      body_preview: null,
      body_text: null,
      to_emails: null,
      direction: 'received',
      raw_payload: JSON.parse(rawBody),
      status: 'discarded',
    })
    return NextResponse.json({}, { status: 200 })
  }

  // 7. Detect direction
  // detectDirection checks if the token appears in mail.to/cc:
  //   - Forwarded received email: Outlook sets To = token address → 'received'
  //   - BCCed sent email: To shows real recipient, token only in session.recipient → 'sent'
  // Do NOT override based on fromSelf here — forwarded received emails also come
  // "from" the user's own address (Outlook is the forwarder), and overriding would
  // incorrectly mark them as sent.
  const direction = detectDirection(payload, token)

  log('[inbound-email] direction_detected', { direction, fromEmail })

  // 8. Extract body and recipients
  const strippedBody = stripQuotedContent(payload.text ?? '')
  const bodyPreview = strippedBody.slice(0, 500)

  // All To+Cc recipients (excluding our own inbound address)
  const toEmails: { name: string; email: string }[] = [
    ...(payload.to?.value ?? []),
    ...(payload.cc?.value ?? []),
  ]
    .filter(r => r.address && !r.address.toLowerCase().includes('@correspondenceclerk.com'))
    .map(r => ({ name: r.name ?? '', email: r.address.toLowerCase() }))

  // -------------------------------------------------------------------------
  // SENT path (BCCed email)
  // -------------------------------------------------------------------------
  if (direction === 'sent') {
    const recipientEmails = extractRecipientEmails(payload)

    const match = await matchBusinessFromRecipients(supabase, orgId, recipientEmails)

    if (match) {
      // If email-based matching didn't find a contact, try name-based fallback
      // using the recipient's display name from the To/Cc headers.
      let resolvedContactId = match.contactId
      if (!resolvedContactId) {
        const toEntry = [...(payload.to?.value ?? []), ...(payload.cc?.value ?? [])]
          .find(r => r.address?.toLowerCase() === match.matchedEmail)
        if (toEntry?.name) {
          resolvedContactId = await matchContactByNameAndLearn(
            supabase, match.businessId, toEntry.name, match.matchedEmail
          )
        }
      }

      const rawForAI = buildRawForAI(payload, strippedBody, 'sent')
      const entryDate = payload.date ?? new Date().toISOString()

      let insertedId: string | null = null
      try {
        insertedId = await insertCorrespondenceServiceRole(supabase, {
          orgId, userId,
          businessId: match.businessId,
          contactId: resolvedContactId,
          rawText: rawForAI,
          subject: payload.subject || '(No subject)',
          entryDate,
          fromEmail,
          direction: 'sent',
        })
      } catch (err) {
        log('[inbound-email] auto_filed_sent_insert_failed', { error: String(err) })
        await saveDeadLetter(supabase, orgId, rawBody, String(err), 'auto_file_sent')
        return NextResponse.json({}, { status: 200 })
      }

      if (insertedId) {
        after(async () => {
          try {
            await applyFormattingBackground(supabase, insertedId, rawForAI, entryDate, 'sent')
          } catch (err) {
            log('[inbound-email] bg_format_failed', { error: String(err), id: insertedId })
          }
        })
      }

      log('[inbound-email] auto_filed_sent', { businessId: match.businessId, matchedEmail: match.matchedEmail })
      return NextResponse.json({}, { status: 200 })
    }

    log('[inbound-email] queued_sent', { recipientDomains: recipientEmails.map(e => e.split('@')[1] ?? '') })
    // No domain match → queue for manual triage
    const { error: queueSentError } = await supabase.from('inbound_queue').insert({
      org_id: orgId,
      from_email: fromEmail,
      from_name: fromName || null,
      subject: payload.subject ?? null,
      body_preview: bodyPreview || null,
      body_text: strippedBody || null,
      to_emails: toEmails.length > 0 ? toEmails : null,
      direction: 'sent',
      raw_payload: JSON.parse(rawBody),
      status: 'pending',
    })
    if (queueSentError) {
      log('[inbound-email] queue_sent_insert_failed', { error: queueSentError.message })
      await saveDeadLetter(supabase, orgId, rawBody, queueSentError.message, 'queue_sent')
    }

    return NextResponse.json({}, { status: 200 })
  }

  // -------------------------------------------------------------------------
  // RECEIVED path (forwarded email)
  // -------------------------------------------------------------------------
  // Use effectiveFromEmail (original sender if forwarded, otherwise the outer From).
  // Skip auto-filing only if the effective sender is still one of our own addresses
  // (i.e. extraction failed and we fell back to the forwarder's address).
  const effectiveDomain = effectiveFromEmail.split('@')[1] ?? ''
  let autoFiledBusinessId: string | null = null
  let autoFiledContactId: string | null = null

  if (!ownEmails.includes(effectiveFromEmail)) {
    // 1. Try exact email match (contacts.emails[] or businesses.email)
    //    Works for any sender, including personal-domain contacts.
    const emailMatch = await matchBusinessFromEmail(supabase, orgId, effectiveFromEmail)
    if (emailMatch) {
      autoFiledBusinessId = emailMatch.businessId
      autoFiledContactId = emailMatch.contactId
      log('[inbound-email] auto_filed_received_email_match', { businessId: autoFiledBusinessId, email: effectiveFromEmail })
    }

    // 2. Fall back to domain mapping (for business senders not yet in contacts)
    if (!autoFiledBusinessId && effectiveDomain && !isPersonalDomain(effectiveDomain)) {
      const { data: mapping } = await supabase
        .from('domain_mappings')
        .select('business_id')
        .eq('org_id', orgId)
        .eq('domain', effectiveDomain)
        .maybeSingle()

      autoFiledBusinessId = mapping?.business_id ?? null
    }
  }

  if (autoFiledBusinessId) {
    log('[inbound-email] auto_filed_received', { businessId: autoFiledBusinessId, domain: effectiveDomain })
    // Use email-match contact if available; otherwise try to match by email, then by name
    let contactId: string | null = autoFiledContactId
    if (!contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('business_id', autoFiledBusinessId)
        .filter('emails', 'cs', JSON.stringify([effectiveFromEmail]))
        .limit(1)
        .maybeSingle()
      contactId = contact?.id ?? null
    }
    if (!contactId && effectiveFromName) {
      contactId = await matchContactByNameAndLearn(
        supabase, autoFiledBusinessId, effectiveFromName, effectiveFromEmail
      )
    }

    const rawForAI = buildRawForAI(
      payload,
      strippedBody,
      'received',
      effectiveFromEmail !== fromEmail ? { email: effectiveFromEmail, name: effectiveFromName } : undefined
    )
    const entryDate = payload.date ?? new Date().toISOString()

    let insertedId: string | null = null
    try {
      insertedId = await insertCorrespondenceServiceRole(supabase, {
        orgId, userId,
        businessId: autoFiledBusinessId,
        contactId,
        rawText: rawForAI,
        subject: payload.subject || '(No subject)',
        entryDate,
        fromEmail: effectiveFromEmail,
        direction: 'received',
      })
    } catch (err) {
      log('[inbound-email] auto_filed_received_insert_failed', { error: String(err) })
      await saveDeadLetter(supabase, orgId, rawBody, String(err), 'auto_file_received')
      return NextResponse.json({}, { status: 200 })
    }

    if (insertedId) {
      after(async () => {
        try {
          await applyFormattingBackground(supabase, insertedId, rawForAI, entryDate, 'received')
        } catch (err) {
          log('[inbound-email] bg_format_failed', { error: String(err), id: insertedId })
        }
      })
    }

    return NextResponse.json({}, { status: 200 })
  }

  log('[inbound-email] queued_received', { domain: effectiveDomain || '(personal/unknown)' })
  // No domain match → add to inbound_queue for manual triage
  const { error: queueReceivedError } = await supabase.from('inbound_queue').insert({
    org_id: orgId,
    from_email: effectiveFromEmail,   // original sender if extracted, otherwise forwarder
    from_name: effectiveFromName || null,
    subject: payload.subject ?? null,
    body_preview: bodyPreview || null,
    body_text: strippedBody || null,
    to_emails: null,
    direction: 'received',
    raw_payload: JSON.parse(rawBody),
    status: 'pending',
  })
  if (queueReceivedError) {
    log('[inbound-email] queue_received_insert_failed', { error: queueReceivedError.message })
    await saveDeadLetter(supabase, orgId, rawBody, queueReceivedError.message, 'queue_received')
  }

  return NextResponse.json({}, { status: 200 })
}
