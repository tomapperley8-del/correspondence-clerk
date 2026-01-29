'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'

const createBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200, 'Business name too long'),
  category: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  is_club_card: z.boolean().optional(),
  is_advertiser: z.boolean().optional(),
  membership_type: z.enum(['club_card', 'advertiser', 'former_club_card', 'former_advertiser']).nullable().optional(),
})

const updateBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200).optional(),
  category: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  is_club_card: z.boolean().optional(),
  is_advertiser: z.boolean().optional(),
  membership_type: z.enum(['club_card', 'advertiser', 'former_club_card', 'former_advertiser']).nullable().optional(),
  address: z.string().max(500).optional(),
  email: z.string().email('Invalid email format').max(254).or(z.literal('')).optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
  last_contacted_at: z.string().optional(),
})

export type Business = {
  id: string
  name: string
  normalized_name: string
  category: string | null
  status: string | null
  is_club_card: boolean
  is_advertiser: boolean
  membership_type: 'club_card' | 'advertiser' | 'former_club_card' | 'former_advertiser' | null
  contract_start: string | null
  contract_end: string | null
  contract_currency: string | null
  deal_terms: string | null
  payment_structure: string | null
  contract_amount: number | null
  address: string | null
  email: string | null
  phone: string | null
  notes: string | null
  last_contacted_at: string | null
  mastersheet_source_ids: string[] | null
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

  // Validate input
  const parsed = createBusinessSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
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
    category?: string | null
    status?: string | null
    is_club_card?: boolean
    is_advertiser?: boolean
    address?: string | null
    email?: string | null
    phone?: string | null
    notes?: string | null
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

  // Validate input
  const parsed = updateBusinessSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const updateData: Record<string, unknown> = {}

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
  if (formData.notes !== undefined) updateData.notes = formData.notes
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
  revalidatePath('/search')
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
  revalidatePath('/search')
  return { success: true }
}
