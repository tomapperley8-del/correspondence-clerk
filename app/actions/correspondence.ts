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
