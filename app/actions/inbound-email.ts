'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { formatCorrespondence } from '@/lib/ai/formatter'
import { isThreadSplitResponse } from '@/lib/ai/types'
import { revalidatePath } from 'next/cache'
import { isPersonalDomain, stripQuotedContent } from '@/lib/inbound/utils'

export { isPersonalDomain, stripQuotedContent }

export type InboundQueueItem = {
  id: string
  from_email: string
  from_name: string | null
  subject: string | null
  body_preview: string | null
  body_text: string | null
  direction: 'received' | 'sent'
  to_emails: { name: string; email: string }[] | null
  received_at: string
}

/**
 * Fetch pending items from inbound_queue for the current user's org
 */
export async function getInboundQueue(): Promise<{ data?: InboundQueueItem[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('inbound_queue')
    .select('id, from_email, from_name, subject, body_preview, body_text, direction, to_emails, received_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('received_at', { ascending: false })
    .limit(50)

  return error ? { error: error.message } : { data: data as InboundQueueItem[] }
}

/**
 * File an inbound queue item: format via AI, save as correspondence, learn domain mapping
 */
export async function fileInboundEmail(queueItemId: string, businessId: string, contactId?: string | null): Promise<{ data?: unknown; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  // Fetch the queue item (org_id guard prevents cross-org access)
  const { data: item } = await supabase
    .from('inbound_queue')
    .select('*')
    .eq('id', queueItemId)
    .eq('org_id', orgId)
    .single()

  if (!item) return { error: 'Item not found' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = item.raw_payload as Record<string, any>

  // Support both Forward Email payload format (payload.mail.*) and legacy Postmark format
  const fromEmail: string = (
    payload.mail?.from?.value?.[0]?.address ??
    payload.FromFull?.Email ??
    payload.From ?? ''
  ).toLowerCase()
  const fromName: string =
    payload.mail?.from?.value?.[0]?.name ??
    payload.FromFull?.Name ??
    payload.FromName ??
    fromEmail
  const emailDate: string =
    payload.mail?.date ?? payload.Date ?? new Date().toISOString()
  const subject: string = payload.mail?.subject ?? payload.Subject ?? ''
  const itemDirection: 'received' | 'sent' = item.direction ?? 'received'

  // Strip quoted content from body
  const rawBody = stripQuotedContent(
    payload.mail?.text || payload.StrippedTextReply || payload.TextBody || ''
  )

  // Build the synthetic email header format the AI formatter expects
  // For sent emails, include To/Cc so the AI has full context
  const toText = payload.mail?.to?.text ?? payload.To ?? ''
  const ccText = payload.mail?.cc?.text ?? payload.Cc ?? ''
  const toLine = toText ? `To: ${toText}` : ''
  const ccLine = ccText ? `Cc: ${ccText}` : ''
  const rawForAI = [
    `From: ${fromName} <${fromEmail}>`,
    ...(itemDirection === 'sent' ? [toLine, ccLine].filter(Boolean) : []),
    `Date: ${emailDate}`,
    `Subject: ${subject}`,
    '',
    rawBody,
  ].join('\n')

  // Resolve contact: use passed contactId, or fall back to email-based lookup
  // For received: match from sender email
  // For sent: match from first To/Cc recipient (if no contactId passed)
  let resolvedContactId: string | null = contactId ?? null
  if (!resolvedContactId) {
    const emailToMatch = itemDirection === 'sent'
      ? (payload.mail?.to?.value?.[0]?.address ?? payload.ToFull?.[0]?.Email ?? '').toLowerCase()
      : fromEmail
    if (emailToMatch) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('business_id', businessId)
        .contains('emails', [emailToMatch])
        .limit(1)
        .maybeSingle()
      resolvedContactId = contact?.id ?? null
    }
  }

  // Compute content hash for dedup
  const { data: contentHash } = await supabase.rpc('compute_content_hash', {
    raw_text: rawForAI,
  })

  // AI format (single entry, no thread split)
  const formatResult = await formatCorrespondence(rawForAI, false)

  let formattedText: string | null = null
  let entryDate = emailDate
  let entrySubject = subject || '(No subject)'
  let formattingStatus = 'unformatted'

  if (formatResult.success && !isThreadSplitResponse(formatResult.data)) {
    const ai = formatResult.data
    formattedText = ai.formatted_text
    entryDate = ai.entry_date_guess || emailDate
    entrySubject = ai.subject_guess || subject || '(No subject)'
    formattingStatus = 'formatted'
  }

  // Insert correspondence
  const { data: entry, error: insertError } = await supabase
    .from('correspondence')
    .insert({
      organization_id: orgId,
      business_id: businessId,
      contact_id: resolvedContactId,
      user_id: user.id,
      raw_text_original: rawForAI,
      formatted_text_original: formattedText,
      formatted_text_current: formattedText,
      entry_date: entryDate,
      subject: entrySubject,
      type: 'Email',
      direction: itemDirection,
      action_needed: 'none',
      formatting_status: formattingStatus,
      content_hash: contentHash || null,
      ai_metadata: {
        source: itemDirection === 'sent' ? 'bcc_capture' : 'inbound_email',
        queue_item_id: queueItemId,
        from_email: fromEmail,
      },
    })
    .select('id')
    .single()

  if (insertError) return { error: insertError.message }

  // Update business last_contacted_at
  await supabase
    .from('businesses')
    .update({ last_contacted_at: entryDate })
    .eq('id', businessId)

  // Learn domain mapping (skip personal domains)
  // For sent emails, learn from the recipient's domain (not the sender's own domain)
  const domainSource = itemDirection === 'sent'
    ? (payload.mail?.to?.value?.[0]?.address ?? payload.ToFull?.[0]?.Email ?? '').toLowerCase()
    : fromEmail
  const domain = domainSource.split('@')[1]?.toLowerCase()
  if (domain && !isPersonalDomain(domain)) {
    await supabase
      .from('domain_mappings')
      .upsert(
        { org_id: orgId, domain, business_id: businessId },
        { onConflict: 'org_id,domain' }
      )
  }

  // Mark queue item as filed
  await supabase
    .from('inbound_queue')
    .update({ status: 'filed' })
    .eq('id', queueItemId)

  revalidatePath('/inbox')
  revalidatePath(`/businesses/${businessId}`)

  return { data: entry }
}

/**
 * Discard an inbound queue item
 */
export async function discardInboundEmail(queueItemId: string): Promise<{ data?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { error } = await supabase
    .from('inbound_queue')
    .update({ status: 'discarded' })
    .eq('id', queueItemId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { data: true }
}

export type AutoFiledItem = {
  id: string
  subject: string | null
  direction: 'received' | 'sent'
  entry_date: string
  business_id: string
  business_name: string
}

export type DiscardedQueueItem = {
  id: string
  from_email: string
  from_name: string | null
  subject: string | null
  received_at: string
}

/**
 * Recent correspondence auto-filed by the webhook (domain match, no user action needed)
 */
export async function getAutoFiledRecent(): Promise<{ data?: AutoFiledItem[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('correspondence')
    .select('id, subject, direction, entry_date, business_id, businesses(name)')
    .eq('organization_id', orgId)
    .filter('ai_metadata->>source', 'in', '("webhook_inbound","webhook_bcc")')
    .order('entry_date', { ascending: false })
    .limit(20)

  if (error) return { error: error.message }

  const items: AutoFiledItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    subject: row.subject as string | null,
    direction: row.direction as 'received' | 'sent',
    entry_date: row.entry_date as string,
    business_id: row.business_id as string,
    business_name: (row.businesses as { name: string } | null)?.name ?? 'Unknown',
  }))

  return { data: items }
}

/**
 * Discarded items for the current org (spam-filtered by webhook)
 */
export async function getDiscardedQueue(): Promise<{ data?: DiscardedQueueItem[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('inbound_queue')
    .select('id, from_email, from_name, subject, received_at')
    .eq('org_id', orgId)
    .eq('status', 'discarded')
    .order('received_at', { ascending: false })
    .limit(30)

  return error ? { error: error.message } : { data: data as DiscardedQueueItem[] }
}

/**
 * Rescue a discarded item — move it back to pending so it appears in the inbox
 */
export async function rescueDiscardedEmail(queueItemId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data: item } = await supabase
    .from('inbound_queue')
    .select('raw_payload')
    .eq('id', queueItemId)
    .eq('org_id', orgId)
    .single()

  if (!item) return { error: 'Item not found' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = item.raw_payload as Record<string, any>
  const rawBody = stripQuotedContent(payload.mail?.text || payload.StrippedTextReply || payload.TextBody || '')
  const bodyPreview = rawBody.slice(0, 500) || null

  const { error } = await supabase
    .from('inbound_queue')
    .update({ status: 'pending', body_preview: bodyPreview, body_text: rawBody || null })
    .eq('id', queueItemId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return {}
}

/**
 * Get the current user's registered own email addresses
 */
export async function getOwnEmailAddresses(): Promise<{ data: string[] | null; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('own_email_addresses')
    .eq('id', user.id)
    .single()

  return { data: (profile?.own_email_addresses as string[] | null) ?? [] }
}

/**
 * Update the current user's registered own email addresses
 */
export async function updateOwnEmailAddresses(emails: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const normalised = emails.map(e => e.trim().toLowerCase()).filter(Boolean)

  const { error } = await supabase
    .from('user_profiles')
    .update({ own_email_addresses: normalised })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return {}
}

/**
 * Get the current user's inbound email token (lazy-generates if missing)
 */
export async function getInboundEmailToken(): Promise<{
  data?: { token: string; lastReceivedAt: string | null }
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('inbound_email_token, display_name, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  let token = profile.inbound_email_token as string | null

  // Lazy-generate for users who existed before this feature
  if (!token) {
    const nameSlug = ((profile.display_name as string | null) ?? user.email ?? 'user')
      .split(/[@\s]/)[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12)
    const rand = Math.random().toString(36).slice(2, 6)
    token = `${nameSlug || 'user'}-${rand}`

    await supabase
      .from('user_profiles')
      .update({ inbound_email_token: token })
      .eq('id', user.id)
  }

  // Last received time (most recent non-discarded queue item for this org)
  const orgId = profile.organization_id as string
  const { data: latest } = await supabase
    .from('inbound_queue')
    .select('received_at')
    .eq('org_id', orgId)
    .neq('status', 'discarded')
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    data: {
      token,
      lastReceivedAt: latest?.received_at ?? null,
    },
  }
}

