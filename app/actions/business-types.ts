'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type BusinessType = {
  id: string
  org_id: string
  label: string
  value: string
  sort_order: number
  is_active: boolean
  created_at: string
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export async function getBusinessTypes(): Promise<{ data?: BusinessType[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase
    .from('org_business_types')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })

  if (error) return { error: error.message }
  return { data: data as BusinessType[] }
}

export async function getActiveBusinessTypes(): Promise<{ data?: BusinessType[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase
    .from('org_business_types')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return { error: error.message }
  return { data: data as BusinessType[] }
}

export async function createBusinessType(
  label: string,
): Promise<{ data?: BusinessType; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const trimmed = label.trim()
  if (!trimmed) return { error: 'Label is required' }

  const value = slugify(trimmed)
  if (!value) return { error: 'Label must contain at least one letter or number' }

  const { data: existing } = await supabase
    .from('org_business_types')
    .select('sort_order')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 1

  const { data, error } = await supabase
    .from('org_business_types')
    .insert({ org_id: orgId, label: trimmed, value, sort_order: nextOrder, is_active: true })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'A business type with this value already exists' }
    return { error: error.message }
  }

  revalidatePath('/settings')
  return { data: data as BusinessType }
}

export async function updateBusinessTypeOrder(
  id: string,
  direction: 'up' | 'down',
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: types, error: fetchError } = await supabase
    .from('org_business_types')
    .select('id, sort_order')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })

  if (fetchError || !types) return { error: fetchError?.message || 'Failed to load types' }

  const idx = types.findIndex((t) => t.id === id)
  if (idx === -1) return { error: 'Type not found' }

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= types.length) return {}

  const current = types[idx]
  const swap = types[swapIdx]

  await supabase.from('org_business_types').update({ sort_order: swap.sort_order }).eq('id', current.id)
  await supabase.from('org_business_types').update({ sort_order: current.sort_order }).eq('id', swap.id)

  revalidatePath('/settings')
  return {}
}

export async function toggleBusinessTypeActive(
  id: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: current, error: fetchError } = await supabase
    .from('org_business_types')
    .select('is_active')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (fetchError || !current) return { error: fetchError?.message || 'Type not found' }

  const { error } = await supabase
    .from('org_business_types')
    .update({ is_active: !current.is_active })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  return {}
}

export async function deleteBusinessType(
  id: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: typeData, error: typeErr } = await supabase
    .from('org_business_types')
    .select('value')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (typeErr || !typeData) return { error: 'Type not found' }

  const { count, error: countErr } = await supabase
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('business_type', typeData.value)

  if (countErr) return { error: countErr.message }
  if (count && count > 0) {
    return { error: `Cannot delete — ${count} business${count === 1 ? '' : 'es'} use this type. Change them first.` }
  }

  const { error } = await supabase
    .from('org_business_types')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  return {}
}
