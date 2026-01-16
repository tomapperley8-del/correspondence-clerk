'use server'

import { createClient } from '@/lib/supabase/server'

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
  ai_metadata: any
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
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
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
  formattedTextCurrent: string
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    .from('correspondence')
    .update({
      formatted_text_current: formattedTextCurrent,
      edited_at: new Date().toISOString(),
      edited_by: user.id,
    })
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
