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

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { formatCorrespondence } from '@/lib/ai/formatter'
import { isThreadSplitResponse } from '@/lib/ai/types'
import { isPersonalDomain, stripQuotedContent } from '@/lib/inbound/utils'

export const maxDuration = 30

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
  if (!secret) return true // not configured → allow all (dev mode)
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

  // Auto-submitted header
  const autoSubmitted = headers.get('auto-submitted')
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') {
    return 'auto-submitted'
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
function buildRawForAI(payload: ForwardEmailPayload, strippedBody: string, direction: 'received' | 'sent'): string {
  const fromName = payload.from?.value?.[0]?.name ?? ''
  const fromEmail = payload.from?.value?.[0]?.address ?? ''
  const date = payload.date ?? new Date().toISOString()
  const subject = payload.subject ?? ''

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
// Service-role correspondence insert (no user session in webhook context)
// ---------------------------------------------------------------------------
async function insertCorrespondenceServiceRole(
  supabase: ReturnType<typeof createServiceRoleClient>,
  opts: {
    orgId: string
    userId: string
    businessId: string
    contactId: string | null
    rawText: string
    formattedText: string | null
    subject: string
    entryDate: string
    formattingStatus: string
    fromEmail: string
    direction: 'received' | 'sent'
  }
): Promise<void> {
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
    if (existing) return // already stored
  }

  await supabase.from('correspondence').insert({
    organization_id: opts.orgId,
    business_id: opts.businessId,
    contact_id: opts.contactId,
    user_id: opts.userId,
    raw_text_original: opts.rawText,
    formatted_text_original: opts.formattedText,
    formatted_text_current: opts.formattedText,
    entry_date: opts.entryDate,
    subject: opts.subject,
    type: 'Email',
    direction: opts.direction,
    action_needed: 'none',
    formatting_status: opts.formattingStatus,
    content_hash: contentHash || null,
    ai_metadata: {
      source: opts.direction === 'sent' ? 'webhook_bcc' : 'webhook_inbound',
      from_email: opts.fromEmail,
    },
  })

  await supabase
    .from('businesses')
    .update({ last_contacted_at: opts.entryDate })
    .eq('id', opts.businessId)
}

// ---------------------------------------------------------------------------
// Match a business from a list of email addresses (used for sent/BCC path)
// Returns { businessId, contactId } for the first recognisable domain, or null.
// ---------------------------------------------------------------------------
async function matchBusinessFromRecipients(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  recipientEmails: string[]
): Promise<{ businessId: string; contactId: string | null; matchedEmail: string } | null> {
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
        .contains('emails', [email])
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
      log('[inbound-email] auto_filed_sent', { businessId: match.businessId, matchedEmail: match.matchedEmail })
      const rawForAI = buildRawForAI(payload, strippedBody, 'sent')
      const formatResult = await formatCorrespondence(rawForAI, false)

      let formattedText: string | null = null
      let entryDate = payload.date ?? new Date().toISOString()
      let subject = payload.subject || '(No subject)'
      let formattingStatus = 'unformatted'

      if (formatResult.success && !isThreadSplitResponse(formatResult.data)) {
        const ai = formatResult.data
        formattedText = ai.formatted_text
        entryDate = ai.entry_date_guess || entryDate
        subject = ai.subject_guess || subject
        formattingStatus = 'formatted'
      }

      log('[inbound-email] formatting_done', { formattingStatus, direction: 'sent' })

      await insertCorrespondenceServiceRole(supabase, {
        orgId, userId,
        businessId: match.businessId,
        contactId: match.contactId,
        rawText: rawForAI,
        formattedText,
        subject,
        entryDate,
        formattingStatus,
        fromEmail,
        direction: 'sent',
      })

      return NextResponse.json({}, { status: 200 })
    }

    log('[inbound-email] queued_sent', { recipientDomains: recipientEmails.map(e => e.split('@')[1] ?? '') })
    // No domain match → queue for manual triage
    await supabase.from('inbound_queue').insert({
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

    return NextResponse.json({}, { status: 200 })
  }

  // -------------------------------------------------------------------------
  // RECEIVED path (forwarded email)
  // -------------------------------------------------------------------------
  const domain = fromEmail.split('@')[1] ?? ''
  let autoFiledBusinessId: string | null = null

  if (domain && !isPersonalDomain(domain)) {
    const { data: mapping } = await supabase
      .from('domain_mappings')
      .select('business_id')
      .eq('org_id', orgId)
      .eq('domain', domain)
      .maybeSingle()

    autoFiledBusinessId = mapping?.business_id ?? null
  }

  if (autoFiledBusinessId) {
    log('[inbound-email] auto_filed_received', { businessId: autoFiledBusinessId, domain })
    let contactId: string | null = null
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('business_id', autoFiledBusinessId)
      .contains('emails', [fromEmail])
      .limit(1)
      .maybeSingle()
    contactId = contact?.id ?? null

    const rawForAI = buildRawForAI(payload, strippedBody, 'received')
    const formatResult = await formatCorrespondence(rawForAI, false)

    let formattedText: string | null = null
    let entryDate = payload.date ?? new Date().toISOString()
    let subject = payload.subject || '(No subject)'
    let formattingStatus = 'unformatted'

    if (formatResult.success && !isThreadSplitResponse(formatResult.data)) {
      const ai = formatResult.data
      formattedText = ai.formatted_text
      entryDate = ai.entry_date_guess || entryDate
      subject = ai.subject_guess || subject
      formattingStatus = 'formatted'
    }

    log('[inbound-email] formatting_done', { formattingStatus, direction: 'received' })

    await insertCorrespondenceServiceRole(supabase, {
      orgId, userId,
      businessId: autoFiledBusinessId,
      contactId,
      rawText: rawForAI,
      formattedText,
      subject,
      entryDate,
      formattingStatus,
      fromEmail,
      direction: 'received',
    })

    return NextResponse.json({}, { status: 200 })
  }

  log('[inbound-email] queued_received', { domain: domain || '(personal/unknown)' })
  // No domain match → add to inbound_queue for manual triage
  await supabase.from('inbound_queue').insert({
    org_id: orgId,
    from_email: fromEmail,
    from_name: fromName || null,
    subject: payload.subject ?? null,
    body_preview: bodyPreview || null,
    body_text: strippedBody || null,
    to_emails: null,
    direction: 'received',
    raw_payload: JSON.parse(rawBody),
    status: 'pending',
  })

  return NextResponse.json({}, { status: 200 })
}
