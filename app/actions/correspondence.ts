'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type Correspondence = {
  id: string
  business_id: string
  contact_id: string
  user_id: string
  raw_text_original: string
  formatted_text_original: string | null
  formatted_text_current: string | null
  entry_date: string | null
  subject: string | null
  type: 'Email' | 'Call' | 'Meeting' | null
  direction: 'received' | 'sent' | null
  action_needed:
    | 'none'
    | 'prospect'
    | 'follow_up'
    | 'waiting_on_them'
    | 'invoice'
    | 'renewal'
  due_at: string | null
  formatting_status: 'formatted' | 'unformatted' | 'failed'
  content_hash: string | null
  ai_metadata: any
  organization_id: string
  created_at: string
  updated_at: string
  edited_at: string | null
  edited_by: string | null
  contact: {
    name: string
    role: string | null
  }
}

export async function getCorrespondenceByBusiness(
  businessId: string,
  limit: number = 20,
  offset: number = 0
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error, count } = await supabase
    .from('correspondence')
    .select(
      `
      *,
      contact:contacts(name, role)
    `,
      { count: 'exact' }
    )
    .eq('business_id', businessId)
    .order('entry_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return { error: error.message }
  }

  return { data, count }
}

export async function createCorrespondence(formData: {
  business_id: string
  contact_id: string
  raw_text_original: string
  entry_date?: string
  subject?: string
  type?: 'Email' | 'Call' | 'Meeting'
  direction?: 'received' | 'sent'
  action_needed?: 'none' | 'prospect' | 'follow_up' | 'waiting_on_them' | 'invoice' | 'renewal'
  due_at?: string
  ai_metadata?: any
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

  const { data, error} = await supabase
    .from('correspondence')
    .insert({
      business_id: formData.business_id,
      contact_id: formData.contact_id,
      user_id: user.id,
      raw_text_original: formData.raw_text_original,
      entry_date: formData.entry_date || new Date().toISOString(),
      subject: formData.subject || null,
      type: formData.type || null,
      direction: formData.direction || null,
      action_needed: formData.action_needed || 'none',
      due_at: formData.due_at || null,
      ai_metadata: formData.ai_metadata || null,
      organization_id: organizationId,
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
 * Update formatted_text_current for manual corrections
 * Per CLAUDE.md: Edits are human corrections, never AI rewrites
 * Preserves raw_text_original and formatted_text_original
 */
export async function updateFormattedText(
  correspondenceId: string,
  formattedTextCurrent: string,
  entryDate?: string | null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const updateData: {
    formatted_text_current: string
    edited_at: string
    edited_by: string
    entry_date?: string | null
  } = {
    formatted_text_current: formattedTextCurrent,
    edited_at: new Date().toISOString(),
    edited_by: user.id,
  }

  // Only update entry_date if explicitly provided
  if (entryDate !== undefined) {
    updateData.entry_date = entryDate
  }

  const { data, error } = await supabase
    .from('correspondence')
    .update(updateData)
    .eq('id', correspondenceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

/**
 * Delete a correspondence entry
 */
export async function deleteCorrespondence(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get business_id before deleting
  const { data: entry } = await supabase
    .from('correspondence')
    .select('business_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('correspondence').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  if (entry) {
    // Note: We don't update last_contacted_at when deleting
    // That would require recalculating from remaining entries
  }

  return { success: true }
}

/**
 * Check if correspondence with same content already exists for this business
 * Returns existing entry if duplicate found
 *
 * Checks both:
 * - Raw text hash (catches pasting same email twice)
 * - Formatted text match (catches copying from page display)
 */
export async function checkForDuplicates(
  rawText: string,
  businessId: string
): Promise<{ isDuplicate: boolean; existingEntry?: Correspondence }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { isDuplicate: false }
  }

  // Compute hash of pasted text
  const { data: contentHash, error: hashError } = await supabase.rpc('compute_content_hash', {
    raw_text: rawText,
  })

  if (hashError || !contentHash) {
    // If hash computation fails, allow save (fail gracefully)
    return { isDuplicate: false }
  }

  // First check: Does content_hash match any existing entry?
  const { data: existing, error } = await supabase
    .from('correspondence')
    .select('*, contact:contacts(name, role)')
    .eq('content_hash', contentHash)
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    // If query fails, allow save (fail gracefully)
    return { isDuplicate: false }
  }

  if (existing) {
    return {
      isDuplicate: true,
      existingEntry: existing as Correspondence,
    }
  }

  // Second check: Get all entries for this business and check if pasted text
  // matches their formatted text (catches when user copies from page display)
  const { data: allEntries } = await supabase
    .from('correspondence')
    .select('*, contact:contacts(name, role)')
    .eq('business_id', businessId)

  if (allEntries && allEntries.length > 0) {
    const normalizedPasted = rawText.trim().toLowerCase()

    for (const entry of allEntries) {
      // Check formatted_text_current
      if (entry.formatted_text_current) {
        const normalizedFormatted = entry.formatted_text_current.trim().toLowerCase()
        if (normalizedPasted === normalizedFormatted) {
          return {
            isDuplicate: true,
            existingEntry: entry as Correspondence,
          }
        }
      }

      // Check formatted_text_original as fallback
      if (entry.formatted_text_original) {
        const normalizedOriginal = entry.formatted_text_original.trim().toLowerCase()
        if (normalizedPasted === normalizedOriginal) {
          return {
            isDuplicate: true,
            existingEntry: entry as Correspondence,
          }
        }
      }
    }
  }

  return { isDuplicate: false }
}
