'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { guessCategory } from '@/lib/categories'

export type NewsLeadStatus = 'new' | 'reviewing' | 'writing' | 'published' | 'killed'
export type ProspectLeadStatus = 'new' | 'reviewing' | 'outreach_planned' | 'contacted' | 'converted' | 'rejected'
export type ProspectMatchType = 'new_business' | 'existing_no_deal' | 'existing_expired' | 'existing_dormant'

export type NewsLead = {
  id: string
  title: string
  source_name: string
  source_url: string | null
  snippet: string | null
  relevance_reason: string | null
  story_type: string | null
  published_at: string | null
  status: NewsLeadStatus
  found_at: string
  created_at: string
  updated_at: string
}

export type ProspectLead = {
  id: string
  business_name: string
  source_name: string
  source_url: string | null
  address: string | null
  business_category: string | null
  snippet: string | null
  matched_business_id: string | null
  match_type: ProspectMatchType
  opportunity_notes: string | null
  status: ProspectLeadStatus
  found_at: string
  created_at: string
  updated_at: string
  matched_business?: { id: string; name: string } | null
}

export async function getNewsLeads(): Promise<{ data?: NewsLead[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('news_leads')
    .select('*')
    .order('found_at', { ascending: false })
    .limit(300)

  if (error) return { error: error.message }
  return { data: data as NewsLead[] }
}

export async function getProspectLeads(): Promise<{ data?: ProspectLead[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Only the ones still worth a decision. Converted leads have become members
  // (the contracts trigger clears them off the outreach board too) and rejected
  // ones have no column on the board, so counting them only made the header lie.
  const { data, error } = await supabase
    .from('prospect_leads')
    .select('*, matched_business:businesses!prospect_leads_matched_business_id_fkey(id, name)')
    .in('status', ['new', 'reviewing', 'outreach_planned', 'contacted'])
    .order('found_at', { ascending: false })
    .limit(300)

  if (error) return { error: error.message }
  return { data: data as unknown as ProspectLead[] }
}

export async function updateNewsLeadStatus(
  id: string,
  status: NewsLeadStatus
): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('news_leads')
    .update({ status })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/today')
  return { error: null }
}

export async function updateProspectLeadStatus(
  id: string,
  status: ProspectLeadStatus
): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('prospect_leads')
    .update({ status })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/today')
  return { error: null }
}

/**
 * Delete a prospect lead (Stage 15). The whole row is copied to
 * cc_phase0_backup first, so Undo (and anyone later) can put it back.
 */
export async function deleteProspectLead(id: string): Promise<{ backupId?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: row, error: readError } = await supabase.from('prospect_leads').select('*').eq('id', id).maybeSingle()
  if (readError) return { error: readError.message }
  if (!row) return { error: 'Already gone' }
  const { data: backup, error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert({ table_name: 'prospect_leads', row_id: id, before_row: row, reason: `lead_delete ${user.id}` })
    .select('id')
    .single()
  if (backupError) return { error: `Not deleted: the backup failed (${backupError.message})` }
  const { error } = await supabase.from('prospect_leads').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/today')
  revalidatePath('/businesses')
  return { backupId: backup.id as number }
}

/** Undo a lead Delete: put the backed-up row back exactly as it was. */
export async function undoDeleteProspectLead(backupId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: backup, error: readError } = await supabase
    .from('cc_phase0_backup')
    .select('before_row')
    .eq('id', backupId)
    .eq('table_name', 'prospect_leads')
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!backup?.before_row) return { error: 'Nothing to undo' }
  const { error } = await supabase.from('prospect_leads').insert(backup.before_row)
  if (error) return { error: error.message }
  revalidatePath('/today')
  revalidatePath('/businesses')
  return {}
}

/**
 * Accept a prospect lead (Stage 11b, one pipeline): it becomes a business at the Outreach stage
 * "Identified", or is linked to the business that already has its name. From then on the lead
 * follows that business's Outreach stage (business_stage_mirrors_lead).
 */
export async function acceptProspectLead(
  id: string
): Promise<{ data?: { business_id: string; business_name: string; created: boolean }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data: lead, error: leadError } = await supabase.from('prospect_leads').select('*').eq('id', id).single()
  if (leadError || !lead) return { error: leadError?.message ?? 'Lead not found' }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  // The routine sometimes adds a description in brackets: "The Alchemy Tribe (health food café & gym)"
  const name = (lead.business_name as string).replace(/\s*\([^)]*\)\s*/g, ' ').trim() || (lead.business_name as string)

  let businessId = lead.matched_business_id as string | null
  let created = false
  if (!businessId) {
    const { data: same } = await supabase
      .from('v_businesses')
      .select('id')
      .eq('organization_id', orgId)
      .is('merged_into', null)
      .ilike('name', name)
      .limit(1)
    businessId = same?.[0]?.id ?? null
  }

  if (!businessId) {
    const found = [lead.found_at ? `found ${new Date(lead.found_at).toLocaleDateString('en-GB')}` : null, lead.source_name ? `on ${lead.source_name}` : null]
      .filter(Boolean).join(' ')
    const note = [`From a prospect lead${found ? ` ${found}` : ''}${lead.source_url ? ` (${lead.source_url})` : ''}: ${lead.business_name}`,
      lead.snippet, lead.opportunity_notes].filter((x) => x && String(x).trim()).join('\n')
    const { data: made, error: insertError } = await supabase
      .from('businesses')
      .insert({
        name,
        normalized_name: name.toLowerCase(),
        category: guessCategory(lead.business_category),
        status: 'Prospect',
        address: lead.address,
        notes: note,
        organization_id: orgId,
        outreach_stage: 'identified',
        outreach_identified_at: today,
      })
      .select('id')
      .single()
    if (insertError) {
      return { error: insertError.code === '23505' ? `A business called ${name} already exists` : insertError.message }
    }
    businessId = made.id as string
    created = true
  } else {
    // An existing business with no deal and no Outreach stage joins Outreach at Identified
    const { data: biz } = await supabase.from('v_businesses').select('outreach_stage, deal_state').eq('id', businessId).single()
    if (biz && !biz.outreach_stage && biz.deal_state === 'none') {
      const { error: stageError } = await supabase
        .from('businesses')
        .update({ outreach_stage: 'identified', outreach_identified_at: today })
        .eq('id', businessId)
        .eq('organization_id', orgId)
      if (stageError) return { error: stageError.message }
    }
  }

  const { data: biz } = await supabase.from('v_businesses').select('name, deal_state').eq('id', businessId).single()
  const matchType = created ? 'new_business'
    : biz?.deal_state === 'none' ? 'existing_no_deal'
    : biz?.deal_state === 'ended' ? 'existing_expired'
    : lead.match_type
  const { error: linkError } = await supabase
    .from('prospect_leads')
    .update({ matched_business_id: businessId, match_type: matchType, status: lead.status === 'new' ? 'reviewing' : lead.status })
    .eq('id', id)
  if (linkError) return { error: linkError.message }

  revalidatePath('/businesses')
  revalidatePath('/today')
  return { data: { business_id: businessId, business_name: (biz?.name as string) ?? name, created } }
}

// ---- Drafts written by the routines ----
//
// The member care and outreach routines write real drafts into Tom's Outlook and
// record every decision here, including the ones they deliberately held back.
// This is the same data the 07:00 desk email lists.

export type RoutineDraft = {
  id: string
  created_at: string
  routine: string
  kind: string
  outcome: 'drafted' | 'skipped'
  business_id: string | null
  recipient: string | null
  subject: string | null
  reason: string | null
  snooze_until: string | null
  /** Set when the sent email files itself back through the BCC address. */
  sent_at: string | null
  /** Set when they answer it. */
  replied_at: string | null
  /** How many times an unsent draft has been lifted back to the top of Outlook. */
  bump_count: number
  business: { id: string; name: string } | null
}

export async function getRoutineDraftsForBusiness(businessId: string): Promise<{ data?: RoutineDraft[]; error?: string }> {
  return getRoutineDrafts(365, 20, businessId)
}

export async function getRoutineDrafts(days = 14, limit = 40, businessId?: string): Promise<{ data?: RoutineDraft[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const query = supabase
    .from('routine_drafts')
    .select('id, created_at, routine, kind, outcome, business_id, recipient, subject, reason, snooze_until, sent_at, replied_at, bump_count, business:businesses!routine_drafts_business_id_fkey(id, name)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  const { data, error } = businessId ? await query.eq('business_id', businessId) : await query

  if (error) return { error: error.message }

  // Businesses Tom has told the routines to stop writing to are left out.
  const { data: letGoRows } = await supabase.from('care_exclusions').select('business_id').eq('kind', 'all')
  const letGo = new Set((letGoRows ?? []).map(r => r.business_id))

  const drafts: RoutineDraft[] = (data ?? []).filter(row => !letGo.has(row.business_id)).map(row => {
    const bizRaw = row.business as unknown
    const biz = Array.isArray(bizRaw)
      ? (bizRaw[0] as { id: string; name: string } | undefined) ?? null
      : (bizRaw as { id: string; name: string } | null)
    return {
      id: row.id,
      created_at: row.created_at,
      routine: row.routine,
      kind: row.kind,
      outcome: row.outcome === 'skipped' ? 'skipped' : 'drafted',
      business_id: row.business_id,
      recipient: row.recipient,
      subject: row.subject,
      reason: row.reason,
      snooze_until: row.snooze_until,
      sent_at: row.sent_at,
      replied_at: row.replied_at,
      bump_count: row.bump_count ?? 0,
      business: biz,
    }
  })

  return { data: drafts }
}
