/**
 * Postmark inbound email webhook
 *
 * Postmark POSTs parsed email JSON to this endpoint when an email arrives at
 * {token}@in.correspondenceclerk.com
 *
 * ALWAYS returns 200 — any other status causes Postmark to retry.
 *
 * Flow:
 *  1. Verify Postmark signature
 *  2. Extract token → look up user
 *  3. Rate limit check (per org)
 *  4. Spam/junk filter
 *  5. Strip quoted content
 *  6. Detect direction: received (forwarded) vs sent (BCCed)
 *  7. Domain match → auto-file OR save to inbound_queue
 *
 * Direction detection:
 *  - Forwarded (received): user's token address appears in the To/Cc headers
 *  - BCCed (sent): token only appears in OriginalRecipient — To shows real recipients
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { formatCorrespondence } from '@/lib/ai/formatter'
import { isThreadSplitResponse } from '@/lib/ai/types'
import { isPersonalDomain, stripQuotedContent } from '@/lib/inbound/utils'

export const maxDuration = 30

type PostmarkHeader = { Name: string; Value: string }
type PostmarkEmailAddress = { Email: string; Name: string; MailboxHash?: string }

type PostmarkPayload = {
  From: string
  FromName: string
  FromFull: { Email: string; Name: string }
  To: string
  ToFull: PostmarkEmailAddress[]
  Cc: string
  CcFull: PostmarkEmailAddress[]
  Bcc: string
  BccFull: PostmarkEmailAddress[]
  OriginalRecipient: string
  Subject: string
  TextBody: string
  HtmlBody: string
  StrippedTextReply: string
  Date: string
  Headers: PostmarkHeader[]
  MessageID: string
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------
function verifyPostmarkSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.POSTMARK_WEBHOOK_TOKEN
  if (!secret) return true // not configured → allow all (dev mode)
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Token extraction — checks OriginalRecipient, To, Cc, Bcc in order
// ---------------------------------------------------------------------------
function extractToken(payload: PostmarkPayload): string | null {
  const candidates = [
    payload.OriginalRecipient ?? '',
    payload.To ?? '',
    payload.Cc ?? '',
    payload.Bcc ?? '',
  ]
  for (const field of candidates) {
    const match = field.match(/([a-z0-9-]+)@in\.correspondenceclerk\.com/i)
    if (match) return match[1].toLowerCase()
  }
  return null
}

// ---------------------------------------------------------------------------
// Direction detection
// BCCed (sent): token is in OriginalRecipient but NOT in To/Cc headers.
// Forwarded (received): token appears in To or Cc headers.
// ---------------------------------------------------------------------------
function detectDirection(payload: PostmarkPayload, token: string): 'received' | 'sent' {
  const pattern = new RegExp(`${token}@in\\.correspondenceclerk\\.com`, 'i')
  const inTo = pattern.test(payload.To ?? '')
  const inCc = pattern.test(payload.Cc ?? '')
  return inTo || inCc ? 'received' : 'sent'
}

// ---------------------------------------------------------------------------
// Extract recipient emails from To + Cc, excluding our own inbound address
// ---------------------------------------------------------------------------
function extractRecipientEmails(payload: PostmarkPayload): string[] {
  const all: PostmarkEmailAddress[] = [
    ...(payload.ToFull ?? []),
    ...(payload.CcFull ?? []),
  ]
  return all
    .map(r => r.Email?.toLowerCase() ?? '')
    .filter(e => e && !e.includes('@in.correspondenceclerk.com'))
}

// ---------------------------------------------------------------------------
// Spam / junk filter
// Returns a discard reason string if the email should be silently dropped.
// ---------------------------------------------------------------------------
function shouldDiscard(payload: PostmarkPayload, headers: Map<string, string>): string | null {
  const from = (payload.FromFull?.Email ?? payload.From ?? '').toLowerCase()
  const subject = (payload.Subject ?? '').toLowerCase()
  const body = (payload.StrippedTextReply || payload.TextBody || '').replace(/\s+/g, ' ').trim()

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

  // Promotional subject keywords
  if (/\b(unsubscribe|newsletter|marketing|promotion|promotional)\b/i.test(subject)) {
    return 'promotional subject'
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
function buildRawForAI(payload: PostmarkPayload, strippedBody: string, direction: 'received' | 'sent'): string {
  const fromName = payload.FromFull?.Name ?? payload.FromName ?? ''
  const fromEmail = payload.FromFull?.Email ?? payload.From ?? ''

  if (direction === 'sent') {
    // For sent emails, show recipients in the header block
    const toLine = payload.To ? `To: ${payload.To}` : ''
    const ccLine = payload.Cc ? `Cc: ${payload.Cc}` : ''
    return [
      `From: ${fromName} <${fromEmail}>`,
      toLine,
      ccLine,
      `Date: ${payload.Date}`,
      `Subject: ${payload.Subject ?? ''}`,
      '',
      strippedBody,
    ].filter(Boolean).join('\n')
  }

  return [
    `From: ${fromName} <${fromEmail}>`,
    `Date: ${payload.Date}`,
    `Subject: ${payload.Subject ?? ''}`,
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

    // Check domain_mappings first (fastest)
    const { data: mapping } = await supabase
      .from('domain_mappings')
      .select('business_id')
      .eq('org_id', orgId)
      .eq('domain', domain)
      .maybeSingle()

    if (mapping?.business_id) {
      // Find matching contact by exact email
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
// Structured logger — all events share the [inbound-email] prefix for easy
// grepping in Vercel logs. Each entry includes a timestamp so individual
// hops are traceable without relying on log-line ordering.
// ---------------------------------------------------------------------------
function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }))
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  // 1. Verify signature
  const sig = request.headers.get('x-postmark-signature') ?? ''
  if (!verifyPostmarkSignature(rawBody, sig)) {
    log('[inbound-email] sig_mismatch')
    return NextResponse.json({}, { status: 200 })
  }

  // 2. Parse payload
  let payload: PostmarkPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    log('[inbound-email] parse_error')
    return NextResponse.json({}, { status: 200 })
  }

  // 3. Extract token and look up user
  const token = extractToken(payload)
  log('[inbound-email] received', {
    from: payload.FromFull?.Email ?? payload.From ?? '',
    subject: payload.Subject ?? '',
    originalRecipient: payload.OriginalRecipient ?? '',
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

  // 5. Parse headers into map
  const headers = new Map<string, string>(
    (payload.Headers ?? []).map((h: PostmarkHeader) => [h.Name.toLowerCase(), h.Value])
  )

  // 6. Spam filter (applies to both directions)
  const discardReason = shouldDiscard(payload, headers)
  if (discardReason) {
    log('[inbound-email] discarded', { reason: discardReason, from: payload.FromFull?.Email ?? payload.From ?? '' })
    await supabase.from('inbound_queue').insert({
      org_id: orgId,
      from_email: (payload.FromFull?.Email ?? payload.From ?? '').toLowerCase(),
      from_name: payload.FromFull?.Name ?? payload.FromName ?? null,
      subject: payload.Subject ?? null,
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
  let direction = detectDirection(payload, token)
  const fromEmail = (payload.FromFull?.Email ?? payload.From ?? '').toLowerCase()

  // Override: if detected as 'received' but From is in the user's own email addresses
  // (auth email always counts, plus any extras they've registered), treat as 'sent'
  const ownEmails: string[] = [
    authEmail,
    ...(profile.own_email_addresses ?? []).map((e: string) => e.toLowerCase()),
  ].filter(Boolean)
  if (direction === 'received' && ownEmails.includes(fromEmail)) {
    direction = 'sent'
  }

  log('[inbound-email] direction_detected', { direction, fromEmail })

  // 8. Extract body and recipients
  const strippedBody = stripQuotedContent(payload.StrippedTextReply || payload.TextBody || '')
  const bodyPreview = strippedBody.slice(0, 500)

  // All To+Cc recipients (excluding our own inbound address)
  const toEmails: { name: string; email: string }[] = [
    ...(payload.ToFull ?? []),
    ...(payload.CcFull ?? []),
  ]
    .filter(r => r.Email && !r.Email.toLowerCase().includes('@in.correspondenceclerk.com'))
    .map(r => ({ name: r.Name ?? '', email: r.Email.toLowerCase() }))

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
      let entryDate = payload.Date ?? new Date().toISOString()
      let subject = payload.Subject || '(No subject)'
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
      from_name: payload.FromFull?.Name ?? payload.FromName ?? null,
      subject: payload.Subject ?? null,
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
  // RECEIVED path (forwarded email) — existing logic
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
    let entryDate = payload.Date ?? new Date().toISOString()
    let subject = payload.Subject || '(No subject)'
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
    from_name: payload.FromFull?.Name ?? payload.FromName ?? null,
    subject: payload.Subject ?? null,
    body_preview: bodyPreview || null,
    body_text: strippedBody || null,
    to_emails: null,
    direction: 'received',
    raw_payload: JSON.parse(rawBody),
    status: 'pending',
  })

  return NextResponse.json({}, { status: 200 })
}
