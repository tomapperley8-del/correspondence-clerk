'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { generateBusinessScheduledTasks } from '@/app/actions/tasks'
import { z } from 'zod'

const createBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200, 'Business name too long'),
  category: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  is_club_card: z.boolean().optional(),
  is_advertiser: z.boolean().optional(),
  membership_type: z.string().nullable().optional(),
  business_type: z.string().nullable().optional(),
})

const updateBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200).optional(),
  category: z.string().max(100).nullable().optional(),
  status: z.string().max(100).nullable().optional(),
  is_club_card: z.boolean().optional(),
  is_advertiser: z.boolean().optional(),
  membership_type: z.string().nullable().optional(),
  business_type: z.string().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  email: z.string().email('Invalid email format').max(254).or(z.literal('')).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  last_contacted_at: z.string().optional(),
  disposition: z.enum(['follow_up_later', 'not_interested']).nullable().optional(),
  follow_up_after: z.string().nullable().optional(),
  mute_replies: z.boolean().optional(),
})

export type Business = {
  id: string
  name: string
  normalized_name: string
  category: string | null
  status: string | null
  is_club_card: boolean
  is_advertiser: boolean
  membership_type: string | null
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
  business_type: string | null
  relationship_memory: string | null
  relationship_memory_updated_at: string | null
  outreach_stage: string | null
  outreach_identified_at: string | null
  outreach_contacted_at: string | null
  outreach_followed_up_at: string | null
  outreach_in_discussion_at: string | null
  outreach_won_at: string | null
  outreach_invoice_paid_at: string | null
  outreach_declined_at: string | null
  renewal_stage: string | null
  renewal_not_started_at: string | null
  renewal_contacted_at: string | null
  renewal_in_discussion_at: string | null
  renewal_agreed_at: string | null
  renewal_invoice_paid_at: string | null
  renewal_declined_at: string | null
  disposition: 'follow_up_later' | 'not_interested' | null
  follow_up_after: string | null
  mute_replies: boolean
  invoice_number: string | null
  mastersheet_source_ids: string[] | null
  organization_id: string
  created_at: string
  updated_at: string
}

// Subset of Business for dashboard list view (optimized query)
export type BusinessListItem = Pick<
  Business,
  'id' | 'name' | 'normalized_name' | 'category' | 'status' | 'is_club_card' | 'is_advertiser' | 'membership_type' | 'business_type' | 'last_contacted_at'
>

export async function getBusinesses(): Promise<{ data?: BusinessListItem[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, normalized_name, category, status, is_club_card, is_advertiser, membership_type, business_type, last_contacted_at')
    .order('name', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: data as BusinessListItem[] }
}

export async function getBusinessById(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Select specific columns needed for detail page (avoids SELECT * overhead)
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, normalized_name, category, status, is_club_card, is_advertiser, membership_type, business_type, contract_start, contract_end, contract_currency, deal_terms, payment_structure, contract_amount, address, email, phone, notes, last_contacted_at, relationship_memory, relationship_memory_updated_at, outreach_stage, outreach_identified_at, outreach_contacted_at, outreach_followed_up_at, outreach_in_discussion_at, outreach_won_at, outreach_invoice_paid_at, outreach_declined_at, renewal_stage, renewal_not_started_at, renewal_contacted_at, renewal_in_discussion_at, renewal_agreed_at, renewal_invoice_paid_at, renewal_declined_at, disposition, follow_up_after, mute_replies, mastersheet_source_ids, organization_id, created_at, updated_at')
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
    business_type?: string | null
    address?: string | null
    email?: string | null
    phone?: string | null
    notes?: string | null
    last_contacted_at?: string
    disposition?: 'follow_up_later' | 'not_interested' | null
    follow_up_after?: string | null
    mute_replies?: boolean
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

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const updateData: Record<string, unknown> = {}

  if (formData.name !== undefined) {
    updateData.name = formData.name.trim()
    updateData.normalized_name = formData.name.toLowerCase().trim()
  }
  if (formData.category !== undefined) updateData.category = formData.category
  if (formData.status !== undefined) updateData.status = formData.status
  if (formData.business_type !== undefined) updateData.business_type = formData.business_type
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
  if (formData.disposition !== undefined) updateData.disposition = formData.disposition
  if (formData.follow_up_after !== undefined) updateData.follow_up_after = formData.follow_up_after
  if (formData.mute_replies !== undefined) updateData.mute_replies = formData.mute_replies

  const { data, error } = await supabase
    .from('businesses')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
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

/**
 * Mark a business's contract as recurring or one-off.
 * one_off → permanently suppresses it from the Renewals & Contracts Actions section.
 */
export async function setContractRenewalType(
  businessId: string,
  renewalType: 'recurring' | 'one_off' | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('businesses')
    .update({ contract_renewal_type: renewalType })
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/actions')
  return { success: true }
}

export type ContractBusiness = {
  id: string
  name: string
  is_club_card: boolean
  is_advertiser: boolean
  renewal_stage: string
  renewal_not_started_at: string | null
  renewal_contacted_at: string | null
  renewal_in_discussion_at: string | null
  renewal_agreed_at: string | null
  renewal_invoice_paid_at: string | null
  renewal_declined_at: string | null
  current_contract_end: string | null
  current_contract_start: string | null
  current_contract_amount: number | null
  current_contract_currency: string | null
  current_invoice_paid: boolean
  total_contract_count: number
}

export async function getContractBusinesses(): Promise<{ data?: ContractBusiness[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, is_club_card, is_advertiser, renewal_stage, renewal_not_started_at, renewal_contacted_at, renewal_in_discussion_at, renewal_agreed_at, renewal_invoice_paid_at, renewal_declined_at, contracts(id, contract_start, contract_end, contract_amount, contract_currency, invoice_paid, is_current)')
    .eq('organization_id', orgId)
    .or('is_club_card.eq.true,is_advertiser.eq.true')
    .order('name', { ascending: true })

  if (error) return { error: error.message }

  const mapped: ContractBusiness[] = (data ?? []).map((b: Record<string, unknown>) => {
    const contracts = (b.contracts as { id: string; contract_start: string | null; contract_end: string | null; contract_amount: number | null; contract_currency: string | null; invoice_paid: boolean; is_current: boolean }[]) || []
    const currentContracts = contracts.filter(c => c.is_current)
    const current = currentContracts.length > 0
      ? currentContracts.reduce((earliest, c) => {
          if (!earliest.contract_end) return c
          if (!c.contract_end) return earliest
          return c.contract_end < earliest.contract_end ? c : earliest
        })
      : contracts[0] || null
    return {
      id: b.id as string,
      name: b.name as string,
      is_club_card: b.is_club_card as boolean,
      is_advertiser: b.is_advertiser as boolean,
      renewal_stage: (b.renewal_stage as string) || 'not_started',
      renewal_not_started_at: b.renewal_not_started_at as string | null,
      renewal_contacted_at: b.renewal_contacted_at as string | null,
      renewal_in_discussion_at: b.renewal_in_discussion_at as string | null,
      renewal_agreed_at: b.renewal_agreed_at as string | null,
      renewal_invoice_paid_at: b.renewal_invoice_paid_at as string | null,
      renewal_declined_at: b.renewal_declined_at as string | null,
      current_contract_end: current?.contract_end ?? null,
      current_contract_start: current?.contract_start ?? null,
      current_contract_amount: current?.contract_amount ?? null,
      current_contract_currency: current?.contract_currency ?? null,
      current_invoice_paid: current?.invoice_paid ?? false,
      total_contract_count: contracts.length,
    }
  })

  mapped.sort((a, b) => {
    if (!a.current_contract_end && !b.current_contract_end) return a.name.localeCompare(b.name)
    if (!a.current_contract_end) return 1
    if (!b.current_contract_end) return -1
    return a.current_contract_end.localeCompare(b.current_contract_end)
  })

  return { data: mapped }
}

export async function updateBusinessRenewalStage(
  businessId: string,
  stage: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const today = new Date().toISOString().slice(0, 10)
  const isRenewed = stage === 'renewed'
  const update: Record<string, unknown> = { renewal_stage: isRenewed ? 'not_started' : stage }
  const dateFields: Record<string, string> = {
    not_started: 'renewal_not_started_at',
    contacted: 'renewal_contacted_at',
    in_discussion: 'renewal_in_discussion_at',
    agreed: 'renewal_agreed_at',
    invoice_paid: 'renewal_invoice_paid_at',
  }
  if (isRenewed) {
    update.renewal_not_started_at = today
    update.renewal_contacted_at = null
    update.renewal_in_discussion_at = null
    update.renewal_agreed_at = null
    update.renewal_invoice_paid_at = null
  } else if (dateFields[stage]) {
    update[dateFields[stage]] = today
  }
  if (stage === 'not_renewing') {
    update.renewal_declined_at = new Date().toISOString()
  } else if (stage !== 'not_renewing') {
    update.renewal_declined_at = null
  }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath(`/businesses/${businessId}`)
  return {}
}

export async function addBusinessToContracts(
  businessId: string,
  type: 'club_card' | 'advertiser'
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const update = type === 'club_card'
    ? { is_club_card: true }
    : { is_advertiser: true }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath('/dashboard')
  return {}
}

export type OutreachBusiness = {
  id: string
  name: string
  is_club_card: boolean
  is_advertiser: boolean
  outreach_stage: string
  outreach_identified_at: string | null
  outreach_contacted_at: string | null
  outreach_followed_up_at: string | null
  outreach_in_discussion_at: string | null
  outreach_won_at: string | null
  outreach_invoice_paid_at: string | null
  outreach_declined_at: string | null
}

export async function getOutreachBusinesses(): Promise<{ data?: OutreachBusiness[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, is_club_card, is_advertiser, outreach_stage, outreach_identified_at, outreach_contacted_at, outreach_followed_up_at, outreach_in_discussion_at, outreach_won_at, outreach_invoice_paid_at, outreach_declined_at')
    .eq('organization_id', orgId)
    .not('outreach_stage', 'is', null)
    .order('name', { ascending: true })

  if (error) return { error: error.message }

  return { data: (data ?? []) as OutreachBusiness[] }
}

export async function updateOutreachStage(
  businessId: string,
  stage: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const today = new Date().toISOString().slice(0, 10)
  const update: Record<string, unknown> = { outreach_stage: stage }
  const dateFields: Record<string, string> = {
    identified: 'outreach_identified_at',
    contacted: 'outreach_contacted_at',
    followed_up: 'outreach_followed_up_at',
    in_discussion: 'outreach_in_discussion_at',
    won: 'outreach_won_at',
    invoice_paid: 'outreach_invoice_paid_at',
  }
  if (dateFields[stage]) {
    update[dateFields[stage]] = today
  }
  if (stage === 'not_interested') {
    update.outreach_declined_at = new Date().toISOString()
  } else {
    update.outreach_declined_at = null
  }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath(`/businesses/${businessId}`)
  return {}
}

export async function addBusinessToOutreach(
  businessId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('businesses')
    .update({ outreach_stage: 'identified', outreach_identified_at: new Date().toISOString().slice(0, 10) })
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath(`/businesses/${businessId}`)
  return {}
}

export async function promoteOutreachToContracts(
  businessId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: biz } = await supabase
    .from('businesses')
    .select('is_club_card, is_advertiser')
    .eq('id', businessId)
    .eq('organization_id', orgId)
    .single()

  const update: Record<string, unknown> = {
    outreach_stage: null,
    outreach_identified_at: null,
    outreach_contacted_at: null,
    outreach_followed_up_at: null,
    outreach_in_discussion_at: null,
    outreach_won_at: null,
    outreach_invoice_paid_at: null,
    outreach_declined_at: null,
    renewal_stage: 'not_started',
    renewal_not_started_at: new Date().toISOString().slice(0, 10),
  }

  if (!biz?.is_club_card && !biz?.is_advertiser) {
    update.is_club_card = true
  }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath('/dashboard')
  return {}
}

export async function removeBusinessFromOutreach(
  businessId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('businesses')
    .update({ outreach_stage: null, outreach_identified_at: null, outreach_contacted_at: null, outreach_followed_up_at: null, outreach_in_discussion_at: null, outreach_won_at: null, outreach_invoice_paid_at: null, outreach_declined_at: null })
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath(`/businesses/${businessId}`)
  return {}
}

export async function updateOutreachStageDate(
  businessId: string,
  field: string,
  date: string
): Promise<{ error?: string }> {
  const allowed = ['outreach_identified_at', 'outreach_contacted_at', 'outreach_followed_up_at', 'outreach_in_discussion_at', 'outreach_won_at', 'outreach_invoice_paid_at']
  if (!allowed.includes(field)) return { error: 'Invalid field' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('businesses')
    .update({ [field]: date })
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return {}
}

export async function updateRenewalStageDate(
  businessId: string,
  field: string,
  date: string
): Promise<{ error?: string }> {
  const allowed = ['renewal_not_started_at', 'renewal_contacted_at', 'renewal_in_discussion_at', 'renewal_agreed_at', 'renewal_invoice_paid_at']
  if (!allowed.includes(field)) return { error: 'Invalid field' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('businesses')
    .update({ [field]: date })
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return {}
}

export async function addBusinessToContractsFromDetail(
  businessId: string,
  type: 'club_card' | 'advertiser'
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const update = type === 'club_card'
    ? { is_club_card: true, renewal_stage: 'not_started', renewal_not_started_at: new Date().toISOString().slice(0, 10) }
    : { is_advertiser: true, renewal_stage: 'not_started', renewal_not_started_at: new Date().toISOString().slice(0, 10) }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }

  await generateBusinessScheduledTasks(businessId)

  revalidatePath('/todos')
  revalidatePath('/dashboard')
  revalidatePath(`/businesses/${businessId}`)
  return {}
}

export async function deleteBusiness(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const { error } = await supabase.from('businesses').delete().eq('id', id).eq('organization_id', organizationId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/search')
  return { success: true }
}
