'use server'

import { formatCorrespondence } from '@/lib/ai/formatter'
import { AIFormatterResponse, isThreadSplitResponse } from '@/lib/ai/types'
import { createClient } from '@/lib/supabase/server'
import type { ContactMatchResult } from '@/lib/contact-matching'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { checkRateLimit, rateLimitError } from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'
import { checkAndResolveActions } from '@/lib/ai/action-resolution'
import { promoteOpenThreadsToActions } from '@/app/actions/correspondence'

/**
 * Format correspondence text using AI
 * Per CLAUDE.md: Fail gracefully, never block saving
 */
export async function formatCorrespondenceText(
  rawText: string,
  shouldSplit: boolean = false
) {
  // Rate limit: 20 requests per minute for AI formatting (expensive)
  const rateLimit = await checkRateLimit({ limit: 20, windowMs: 60000, endpoint: 'ai-formatter' })
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.resetIn)
  }

  // Validate user is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Call AI formatter
  const result = await formatCorrespondence(rawText, shouldSplit)

  if (!result.success) {
    return {
      error: result.error,
      shouldSaveUnformatted: true,
    }
  }

  return {
    data: result.data,
    quotedContent: result.quotedContent,
  }
}

/**
 * Create correspondence with AI formatting
 * Handles both single entries and thread splits
 * Optionally accepts contact matches to assign different contacts to different emails
 */
export async function createFormattedCorrespondence(
  formData: {
    business_id: string
    contact_id?: string
    cc_contact_ids?: string[]
    bcc_contact_ids?: string[]
    raw_text_original: string
    entry_date?: string
    type?: 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note'
    direction?: 'received' | 'sent'
    action_needed?:
      | 'none'
      | 'prospect'
      | 'follow_up'
      | 'waiting_on_them'
      | 'invoice'
      | 'renewal'
    due_at?: string
    email_source?: Record<string, unknown>
    thread_participants?: string
    internal_sender?: string
    quoted_content?: string
  },
  aiResponse: AIFormatterResponse,
  contactMatches?: ContactMatchResult[]
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get user's organization
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Handle thread split vs single entry
  if (isThreadSplitResponse(aiResponse)) {
    // Multiple entries - compute unique hash for each split email based on its formatted content
    const entries = await Promise.all(
      aiResponse.entries.map(async (entry, index) => {
        // Use matched contact if available, otherwise use default contact
        const contactId = contactMatches && contactMatches[index]?.contactId
          ? contactMatches[index].contactId
          : (formData.contact_id || null)

        // Hash the formatted text of THIS specific email, not the full raw thread
        const { data: entryHash } = await supabase.rpc('compute_content_hash', {
          raw_text: entry.formatted_text,
        })

        return {
          business_id: formData.business_id,
          contact_id: contactId,
          cc_contact_ids: formData.cc_contact_ids || [],
          bcc_contact_ids: formData.bcc_contact_ids || [],
          user_id: user.id,
          raw_text_original: formData.raw_text_original,
          formatted_text_original: entry.formatted_text,
          formatted_text_current: entry.formatted_text,
          entry_date: entry.entry_date_guess || formData.entry_date || new Date().toISOString(),
          subject: entry.subject_guess,
          type: entry.entry_type_guess,
          direction: entry.direction_guess || formData.direction || null,
          action_needed: formData.action_needed || 'none',
          due_at: formData.due_at || null,
          formatting_status: 'formatted',
          content_hash: entryHash || null,
          organization_id: organizationId,
          ai_metadata: {
            warnings: entry.warnings,
            split_from_thread: true,
            thread_position: index + 1,
            thread_total: aiResponse.entries.length,
            matched_contact: contactMatches && contactMatches[index]
              ? {
                  matched: true,
                  matched_from: contactMatches[index].matchedFrom,
                  confidence: contactMatches[index].confidence,
                }
              : { matched: false },
            ...(formData.email_source && { email_source: formData.email_source }),
            ...(formData.quoted_content && { quoted_content: formData.quoted_content }),
          },
        }
      })
    )

    const { data, error } = await supabase
      .from('correspondence')
      .insert(entries)
      .select()

    if (error) {
      return { error: error.message }
    }

    // Update business last_contacted_at with the latest entry date
    const latestDate =
      entries.reduce((latest, entry) => {
        const entryDate = new Date(entry.entry_date)
        return entryDate > latest ? entryDate : latest
      }, new Date(0))

    await supabase
      .from('businesses')
      .update({ last_contacted_at: latestDate.toISOString() })
      .eq('id', formData.business_id)

    revalidatePath(`/businesses/${formData.business_id}`)
    revalidatePath('/dashboard')
    revalidatePath('/search')

    const [actionsResolved, threadsPromoted] = await Promise.all([
      checkAndResolveActions(organizationId, formData.business_id, formData.raw_text_original, null)
        .catch(err => { console.error('Action resolution failed:', err); return 0 }),
      promoteOpenThreadsToActions(organizationId, formData.business_id)
        .catch(err => { console.error('promoteOpenThreadsToActions failed:', err); return 0 }),
    ])

    return { data, count: data.length, actionsResolved, threadsPromoted }
  } else {
    // Single entry - compute hash from raw text
    const { data: contentHash } = await supabase.rpc('compute_content_hash', {
      raw_text: formData.raw_text_original,
    })

    const { data, error } = await supabase
      .from('correspondence')
      .insert({
        business_id: formData.business_id,
        contact_id: formData.contact_id || null,
        cc_contact_ids: formData.cc_contact_ids || [],
        bcc_contact_ids: formData.bcc_contact_ids || [],
        user_id: user.id,
        raw_text_original: formData.raw_text_original,
        formatted_text_original: aiResponse.formatted_text,
        formatted_text_current: aiResponse.formatted_text,
        entry_date:
          aiResponse.entry_date_guess || formData.entry_date || new Date().toISOString(),
        subject: aiResponse.subject_guess,
        type: formData.type || aiResponse.entry_type_guess,
        direction: aiResponse.direction_guess || formData.direction || null,
        action_needed: formData.action_needed || 'none',
        due_at: formData.due_at || null,
        formatting_status: 'formatted',
        content_hash: contentHash || null,
        organization_id: organizationId,
        thread_participants: formData.thread_participants || null,
        internal_sender: formData.internal_sender || null,
        ai_metadata: {
          warnings: aiResponse.warnings,
          split_from_thread: false,
          ...(formData.email_source && { email_source: formData.email_source }),
          ...(formData.quoted_content && { quoted_content: formData.quoted_content }),
        },
      })
      .select()
      .single()

    if (error) {
      return { error: error.message }
    }

    // Update business last_contacted_at
    await supabase
      .from('businesses')
      .update({
        last_contacted_at:
          aiResponse.entry_date_guess || formData.entry_date || new Date().toISOString(),
      })
      .eq('id', formData.business_id)

    revalidatePath(`/businesses/${formData.business_id}`)
    revalidatePath('/dashboard')
    revalidatePath('/search')

    const [actionsResolved, threadsPromoted] = await Promise.all([
      checkAndResolveActions(organizationId, formData.business_id, formData.raw_text_original, aiResponse.subject_guess ?? null)
        .catch(err => { console.error('Action resolution failed:', err); return 0 }),
      promoteOpenThreadsToActions(organizationId, formData.business_id)
        .catch(err => { console.error('promoteOpenThreadsToActions failed:', err); return 0 }),
    ])

    return { data, actionsResolved, threadsPromoted }
  }
}

/**
 * Create unformatted correspondence (AI failed or bypassed)
 * Per CLAUDE.md: AI outage never blocks saving
 */
export async function createUnformattedCorrespondence(formData: {
  business_id: string
  contact_id?: string
  cc_contact_ids?: string[]
  bcc_contact_ids?: string[]
  raw_text_original: string
  entry_date?: string
  subject?: string
  type?: 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note'
  direction?: 'received' | 'sent'
  action_needed?:
    | 'none'
    | 'prospect'
    | 'follow_up'
    | 'waiting_on_them'
    | 'invoice'
    | 'renewal'
  due_at?: string
  thread_participants?: string
  internal_sender?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get user's organization
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Compute content hash for duplicate detection
  const { data: contentHash } = await supabase.rpc('compute_content_hash', {
    raw_text: formData.raw_text_original,
  })

  const { data, error } = await supabase
    .from('correspondence')
    .insert({
      business_id: formData.business_id,
      contact_id: formData.contact_id || null,
      cc_contact_ids: formData.cc_contact_ids || [],
      bcc_contact_ids: formData.bcc_contact_ids || [],
      user_id: user.id,
      raw_text_original: formData.raw_text_original,
      formatted_text_original: null,
      formatted_text_current: null,
      entry_date: formData.entry_date || new Date().toISOString(),
      subject: formData.subject || null,
      type: formData.type || null,
      direction: formData.direction || null,
      action_needed: formData.action_needed || 'none',
      due_at: formData.due_at || null,
      formatting_status: 'unformatted',
      content_hash: contentHash || null,
      organization_id: organizationId,
      ai_metadata: { saved_without_formatting: true },
      thread_participants: formData.thread_participants || null,
      internal_sender: formData.internal_sender || null,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update business last_contacted_at
  await supabase
    .from('businesses')
    .update({
      last_contacted_at: formData.entry_date || new Date().toISOString(),
    })
    .eq('id', formData.business_id)

  revalidatePath(`/businesses/${formData.business_id}`)
  revalidatePath('/dashboard')
  revalidatePath('/search')

  const [actionsResolved, threadsPromoted] = await Promise.all([
    checkAndResolveActions(organizationId, formData.business_id, formData.raw_text_original, formData.subject ?? null)
      .catch(err => { console.error('Action resolution failed:', err); return 0 }),
    promoteOpenThreadsToActions(organizationId, formData.business_id)
      .catch(err => { console.error('promoteOpenThreadsToActions failed:', err); return 0 }),
  ])

  return { data, actionsResolved, threadsPromoted }
}

/**
 * Count unformatted correspondence entries for the current org
 */
export async function getUnformattedCount() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized' }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) return { error: 'No organization found' }

  const { count, error } = await supabase
    .from('correspondence')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('formatting_status', ['unformatted', 'failed'])

  if (error) return { error: error.message }

  return { data: count ?? 0 }
}

/**
 * Format all unformatted entries for the current org (up to 50 at a time)
 * Returns how many were successfully formatted
 */
export async function formatAllUnformatted() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized' }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) return { error: 'No organization found' }

  const { data: entries, error } = await supabase
    .from('correspondence')
    .select('id')
    .eq('organization_id', organizationId)
    .in('formatting_status', ['unformatted', 'failed'])
    .limit(50)

  if (error) return { error: error.message }
  if (!entries || entries.length === 0) return { data: { formatted: 0, total: 0 } }

  let formatted = 0
  for (const entry of entries) {
    const result = await retryFormatting(entry.id)
    if (!result.error) formatted++
  }

  return { data: { formatted, total: entries.length } }
}

/**
 * Retry formatting for an unformatted entry
 * Per CLAUDE.md: "Format later" option for entries saved without formatting
 */
export async function retryFormatting(correspondenceId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get the unformatted entry
  const { data: entry, error: fetchError } = await supabase
    .from('correspondence')
    .select('*')
    .eq('id', correspondenceId)
    .single()

  if (fetchError || !entry) {
    return { error: 'Entry not found' }
  }

  if (entry.formatting_status === 'formatted') {
    return { error: 'Entry is already formatted' }
  }

  // Try formatting
  const formatResult = await formatCorrespondence(entry.raw_text_original, false)

  if (!formatResult.success) {
    // Update status to 'failed'
    await supabase
      .from('correspondence')
      .update({
        formatting_status: 'failed',
        ai_metadata: {
          ...entry.ai_metadata,
          retry_attempted: new Date().toISOString(),
          retry_error: formatResult.error,
        },
      })
      .eq('id', correspondenceId)

    return {
      error: formatResult.error,
      shouldSaveUnformatted: false,
    }
  }

  // Handle single entry response (thread splitting not supported in retry)
  if (isThreadSplitResponse(formatResult.data)) {
    return { error: 'Thread splitting not supported in retry formatting' }
  }

  const aiData = formatResult.data

  // Update entry with formatted text
  const { data, error } = await supabase
    .from('correspondence')
    .update({
      formatted_text_original: aiData.formatted_text,
      formatted_text_current: aiData.formatted_text,
      subject: aiData.subject_guess,
      type: aiData.entry_type_guess,
      entry_date: aiData.entry_date_guess || entry.entry_date,
      formatting_status: 'formatted',
      ai_metadata: {
        ...entry.ai_metadata,
        warnings: aiData.warnings,
        retry_formatted: true,
        retry_attempted: new Date().toISOString(),
        ...(formatResult.quotedContent && { quoted_content: formatResult.quotedContent }),
      },
    })
    .eq('id', correspondenceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}
