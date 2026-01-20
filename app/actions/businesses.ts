'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type Business = {
  id: string
  name: string
  normalized_name: string
  category: string | null
  status: string | null
  is_club_card: boolean
  is_advertiser: boolean
  contract_start: string | null
  contract_end: string | null
  deal_terms: string | null
  payment_structure: string | null
  contract_amount: number | null
  address: string | null
  email: string | null
  phone: string | null
  last_contacted_at: string | null
  mastersheet_source_ids: any
  organization_id: string
  created_at: string
  updated_at: string
}

export async function getBusinesses() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getBusinessById(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function createBusiness(formData: {
  name: string
  category?: string
  status?: string
  is_club_card?: boolean
  is_advertiser?: boolean
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

  // Normalize name for uniqueness check
  const normalized_name = formData.name.toLowerCase().trim()

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      name: formData.name.trim(),
      normalized_name,
      category: formData.category || null,
      status: formData.status || null,
      is_club_card: formData.is_club_card || false,
      is_advertiser: formData.is_advertiser || false,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Unique violation
      return { error: 'A business with this name already exists' }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { data }
}

export async function updateBusiness(
  id: string,
  formData: {
    name?: string
    category?: string
    status?: string
    is_club_card?: boolean
    is_advertiser?: boolean
    address?: string
    email?: string
    phone?: string
    last_contacted_at?: string
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const updateData: any = {}

  if (formData.name !== undefined) {
    updateData.name = formData.name.trim()
    updateData.normalized_name = formData.name.toLowerCase().trim()
  }
  if (formData.category !== undefined) updateData.category = formData.category
  if (formData.status !== undefined) updateData.status = formData.status
  if (formData.is_club_card !== undefined)
    updateData.is_club_card = formData.is_club_card
  if (formData.is_advertiser !== undefined)
    updateData.is_advertiser = formData.is_advertiser
  if (formData.address !== undefined) updateData.address = formData.address
  if (formData.email !== undefined) updateData.email = formData.email
  if (formData.phone !== undefined) updateData.phone = formData.phone
  if (formData.last_contacted_at !== undefined)
    updateData.last_contacted_at = formData.last_contacted_at

  const { data, error } = await supabase
    .from('businesses')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/businesses/${id}`)
  return { data }
}

export async function deleteBusiness(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase.from('businesses').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}
