'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'

const createBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200, 'Business name too long'),
  category: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  business_type: z.string().nullable().optional(),
})

const updateBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200).optional(),
  category: z.string().max(100).nullable().optional(),
  status: z.string().max(100).nullable().optional(),
  business_type: z.string().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
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
  /** Stage 11b: the business's own website. */
  website?: string | null
  email: string | null
  phone: string | null
  notes: string | null
  last_contacted_at: string | null
  business_type: string | null
  /** Stage 11a (v_businesses): the main contact, chosen by hand or automatically. */
  main_contact_id?: string | null
  main_contact_is_manual?: boolean
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
  merged_into: string | null
  organization_id: string
  created_at: string
  updated_at: string
}

// Subset of Business for dashboard list view (optimized query)
export type BusinessListItem = Pick<
  Business,
  'id' | 'name' | 'normalized_name' | 'category' | 'status' | 'is_club_card' | 'is_advertiser' | 'membership_type' | 'business_type' | 'last_contacted_at'
>

// A record that turned out not to be a business (a mail service, spam, a person
// filed under their own name). Its correspondence and contacts are kept.
const NOT_A_BUSINESS = 'Not a business'

export async function getBusinesses(): Promise<{ data?: BusinessListItem[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    // Stage 11a: status, deal, last in touch from the truth layer (writes still go to businesses)
    .from('v_businesses')
    .select('id, name, normalized_name, category, status, is_club_card, is_advertiser, membership_type, business_type, last_contacted_at')
    // Records found not to be businesses in a review: kept for their emails, never listed
    .or(`status.is.null,status.neq."${NOT_A_BUSINESS}"`)
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
    // Stage 11a: status, deal, last in touch from the truth layer (writes still go to businesses)
    .from('v_businesses')
    .select('id, name, normalized_name, category, status, is_club_card, is_advertiser, membership_type, business_type, contract_start, contract_end, contract_currency, deal_terms, payment_structure, contract_amount, invoice_number, address, email, phone, notes, last_contacted_at, relationship_memory, relationship_memory_updated_at, outreach_stage, outreach_identified_at, outreach_contacted_at, outreach_followed_up_at, outreach_in_discussion_at, outreach_won_at, outreach_invoice_paid_at, outreach_declined_at, renewal_stage, renewal_not_started_at, renewal_contacted_at, renewal_in_discussion_at, renewal_agreed_at, renewal_invoice_paid_at, renewal_declined_at, disposition, follow_up_after, mute_replies, mastersheet_source_ids, merged_into, organization_id, created_at, updated_at, main_contact_id, main_contact_is_manual, website')
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
  /** Ticked on the Add Business form: recorded as a contract (Stage 11b) */
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

  for (const type of [formData.is_club_card && 'club_card', formData.is_advertiser && 'advertiser'] as const) {
    if (!type) continue
    const deal = await recordDeal(supabase, organizationId, data.id, type)
    if (deal.error) return { error: `Business added, but its ${type === 'club_card' ? 'Club Card' : 'advertising'} contract wasn't recorded: ${deal.error}` }
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
    business_type?: string | null
    address?: string | null
    website?: string | null
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
  if (formData.address !== undefined) updateData.address = formData.address
  if (formData.website !== undefined) updateData.website = formData.website?.trim() || null
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

  // Stage 11a: status is worked out from contracts. A status written here (an
  // Unreviewed business being reviewed) is put straight back through the rule.
  if (formData.status !== undefined) {
    const { error: refreshError } = await supabase.rpc('refresh_business_truth', { p_business_id: id })
    if (refreshError) console.error('refresh_business_truth:', refreshError.message)
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

  // Stage 11b: the deal comes from contracts (v_businesses), not the copies on businesses
  const { data, error } = await supabase
    .from('v_businesses')
    .select('id, name, is_club_card, is_advertiser, renewal_stage, renewal_not_started_at, renewal_contacted_at, renewal_in_discussion_at, renewal_agreed_at, renewal_invoice_paid_at, renewal_declined_at')
    .eq('organization_id', orgId)
    .or('is_club_card.eq.true,is_advertiser.eq.true')
    .order('name', { ascending: true })

  if (error) return { error: error.message }

  type Term = { id: string; business_id: string; contract_start: string | null; contract_end: string | null; contract_amount: number | null; contract_currency: string | null; invoice_paid: boolean; is_current: boolean }
  const ids = (data ?? []).map((b) => b.id as string)
  const terms: Term[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows, error: termsError } = await supabase
      .from('contracts')
      .select('id, business_id, contract_start, contract_end, contract_amount, contract_currency, invoice_paid, is_current')
      .in('business_id', ids.slice(i, i + 200))
    if (termsError) return { error: termsError.message }
    terms.push(...((rows ?? []) as Term[]))
  }

  const mapped: ContractBusiness[] = (data ?? []).map((b: Record<string, unknown>) => {
    const contracts = terms.filter((c) => c.business_id === b.id)
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
  revalidatePath('/today')
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

  const { error } = await recordDeal(supabase, orgId, businessId, type)
  if (error) return { error }
  revalidatePath('/today')
  revalidatePath('/dashboard')
  return {}
}

/**
 * Stage 11b: deals live only in contracts. Adding a business to Renewals, or marking an outreach
 * business won, records a current contract of that type starting today (unless one is already
 * current); its dates and amount are filled in on the business page. The contract trigger then
 * takes it off the outreach board, opens a renewal cycle and works out the status.
 */
async function recordDeal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  businessId: string,
  type: 'club_card' | 'advertiser' | null
): Promise<{ error?: string }> {
  const { data: current, error: readError } = await supabase
    .from('contracts')
    .select('membership_type')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .eq('is_current', true)
  if (readError) return { error: readError.message }
  if ((current ?? []).some((c) => type === null || c.membership_type === type)) return {}

  const { error } = await supabase.from('contracts').insert({
    business_id: businessId,
    organization_id: orgId,
    membership_type: type ?? 'club_card',
    contract_start: new Date().toISOString().slice(0, 10),
    contract_currency: 'GBP',
    billing_frequency: 'annual',
    is_current: true,
  })
  return error ? { error: error.message } : {}
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
    .from('v_businesses')
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
  revalidatePath('/today')
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
  revalidatePath('/today')
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

  // The deal first: a deal in force already counts, otherwise a Club Card is recorded, as the
  // tick used to be. Its insert trigger takes the business off Outreach, so the lead mirror
  // (business_stage_mirrors_lead) sees the deal and marks the lead converted.
  const deal = await recordDeal(supabase, orgId, businessId, null)
  if (deal.error) return { error: deal.error }

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

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }

  revalidatePath('/today')
  revalidatePath('/dashboard')
  return {}
}

const OUTREACH_FIELDS = [
  'outreach_stage', 'outreach_identified_at', 'outreach_contacted_at', 'outreach_followed_up_at',
  'outreach_in_discussion_at', 'outreach_won_at', 'outreach_invoice_paid_at', 'outreach_declined_at',
] as const

/**
 * Take a business off outreach. Its stage and stage dates are copied to
 * cc_phase0_backup first (Stage 15), so Undo puts them back.
 */
export async function removeBusinessFromOutreach(
  businessId: string
): Promise<{ backupId?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: before, error: readError } = await supabase
    .from('businesses')
    .select(['id', 'organization_id', ...OUTREACH_FIELDS].join(', '))
    .eq('id', businessId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!before) return { error: 'Business not found' }
  const { data: backup, error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert({ table_name: 'businesses', row_id: businessId, before_row: before, reason: `outreach_remove ${user.id}` })
    .select('id')
    .single()
  if (backupError) return { error: `Not removed: the backup failed (${backupError.message})` }

  const { error } = await supabase
    .from('businesses')
    .update(Object.fromEntries(OUTREACH_FIELDS.map((f) => [f, null])))
    .eq('id', businessId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/today')
  revalidatePath('/businesses')
  revalidatePath(`/businesses/${businessId}`)
  return { backupId: backup.id as number }
}

/** Undo "Remove from outreach": the stage and its dates back as they were. */
export async function undoRemoveFromOutreach(backupId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: backup, error: readError } = await supabase
    .from('cc_phase0_backup')
    .select('row_id, before_row')
    .eq('id', backupId)
    .eq('table_name', 'businesses')
    .maybeSingle()
  if (readError) return { error: readError.message }
  const before = backup?.before_row as Record<string, unknown> | undefined
  if (!backup || !before || before.organization_id !== orgId) return { error: 'Nothing to undo' }
  const businessId = backup.row_id as string
  const { error } = await supabase
    .from('businesses')
    .update(Object.fromEntries(OUTREACH_FIELDS.map((f) => [f, before[f] ?? null])))
    .eq('id', businessId)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/today')
  revalidatePath('/businesses')
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
  revalidatePath('/today')
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
  revalidatePath('/today')
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

  const { error } = await recordDeal(supabase, orgId, businessId, type)
  if (error) return { error }

  revalidatePath('/today')
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
