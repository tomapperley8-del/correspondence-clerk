'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type Contract = {
  id: string
  business_id: string
  organization_id: string | null
  membership_type: string | null
  contract_start: string | null
  contract_end: string | null
  contract_amount: number | null
  contract_currency: string | null
  billing_frequency: 'monthly' | 'annual'
  deal_terms: string | null
  invoice_paid: boolean
  is_current: boolean
  created_at: string
  updated_at: string
}

export async function getContractsByBusiness(businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .order('is_current', { ascending: false })
    .order('contract_start', { ascending: false, nullsFirst: false })

  if (error) return { error: error.message }
  return { data: data as Contract[] }
}

export async function createContract(businessId: string, fields: {
  membership_type?: string | null
  contract_start?: string | null
  contract_end?: string | null
  contract_amount?: number | null
  contract_currency?: string
  billing_frequency?: 'monthly' | 'annual'
  deal_terms?: string | null
  invoice_paid?: boolean
  is_current?: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      business_id: businessId,
      organization_id: orgId,
      membership_type: fields.membership_type || null,
      contract_start: fields.contract_start || null,
      contract_end: fields.contract_end || null,
      contract_amount: fields.contract_amount ?? null,
      contract_currency: fields.contract_currency || 'GBP',
      billing_frequency: fields.billing_frequency || 'annual',
      deal_terms: fields.deal_terms || null,
      invoice_paid: fields.invoice_paid ?? false,
      is_current: fields.is_current ?? true,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { data: data as Contract }
}

export async function updateContract(contractId: string, businessId: string, fields: Partial<{
  membership_type: string | null
  contract_start: string | null
  contract_end: string | null
  contract_amount: number | null
  contract_currency: string
  billing_frequency: 'monthly' | 'annual'
  deal_terms: string | null
  invoice_paid: boolean
  is_current: boolean
}>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('contracts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', contractId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { data: data as Contract }
}

export async function deleteContract(contractId: string, businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', contractId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { success: true }
}
