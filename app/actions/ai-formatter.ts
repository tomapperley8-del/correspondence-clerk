'use server'

import { formatCorrespondence } from '@/lib/ai/formatter'
import { AIFormatterResponse, isThreadSplitResponse } from '@/lib/ai/types'
import { createClient } from '@/lib/supabase/server'
import type { ContactMatchResult } from '@/lib/contact-matching'

/**
 * Format correspondence text using AI
 * Per CLAUDE.md: Fail gracefully, never block saving
 */
export async function formatCorrespondenceText(
  rawText: string,
  shouldSplit: boolean = false
) {
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
    contact_id: string
    raw_text_original: string
    entry_date?: string
    type?: 'Email' | 'Call' | 'Meeting'
    direction?: 'received' | 'sent'
    action_needed?:
      | 'none'
      | 'prospect'
      | 'follow_up'
      | 'waiting_on_them'
      | 'invoice'
      | 'renewal'
    due_at?: string
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

  // Handle thread split vs single entry
  if (isThreadSplitResponse(aiResponse)) {
    // Multiple entries - compute unique hash for each split email based on its formatted content
    const entries = await Promise.all(
      aiResponse.entries.map(async (entry, index) => {
        // Use matched contact if available, otherwise use default contact
        const contactId = contactMatches && contactMatches[index]?.contactId
          ? contactMatches[index].contactId
          : formData.contact_id

        // Hash the formatted text of THIS specific email, not the full raw thread
        const { data: entryHash } = await supabase.rpc('compute_content_hash', {
          raw_text: entry.formatted_text,
        })

        return {
          business_id: formData.business_id,
          contact_id: contactId,
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

    return { data, count: data.length }
  } else {
    // Single entry - compute hash from raw text
    const { data: contentHash } = await supabase.rpc('compute_content_hash', {
      raw_text: formData.raw_text_original,
    })

    const { data, error } = await supabase
      .from('correspondence')
      .insert({
        business_id: formData.business_id,
        contact_id: formData.contact_id,
        user_id: user.id,
        raw_text_original: formData.raw_text_original,
        formatted_text_original: aiResponse.formatted_text,
        formatted_text_current: aiResponse.formatted_text,
        entry_date:
          aiResponse.entry_date_guess || formData.entry_date || new Date().toISOString(),
        subject: aiResponse.subject_guess,
        type: aiResponse.entry_type_guess,
        direction: aiResponse.direction_guess || formData.direction || null,
        action_needed: formData.action_needed || 'none',
        due_at: formData.due_at || null,
        formatting_status: 'formatted',
        content_hash: contentHash || null,
        ai_metadata: {
          warnings: aiResponse.warnings,
          split_from_thread: false,
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

    return { data }
  }
}

/**
 * Create unformatted correspondence (AI failed or bypassed)
 * Per CLAUDE.md: AI outage never blocks saving
 */
export async function createUnformattedCorrespondence(formData: {
  business_id: string
  contact_id: string
  raw_text_original: string
  entry_date?: string
  subject?: string
  type?: 'Email' | 'Call' | 'Meeting'
  direction?: 'received' | 'sent'
  action_needed?:
    | 'none'
    | 'prospect'
    | 'follow_up'
    | 'waiting_on_them'
    | 'invoice'
    | 'renewal'
  due_at?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Compute content hash for duplicate detection
  const { data: contentHash } = await supabase.rpc('compute_content_hash', {
    raw_text: formData.raw_text_original,
  })

  const { data, error } = await supabase
    .from('correspondence')
    .insert({
      business_id: formData.business_id,
      contact_id: formData.contact_id,
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
      ai_metadata: { saved_without_formatting: true },
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

  return { data }
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
