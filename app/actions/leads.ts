'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
  revalidatePath('/briefing')
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
  revalidatePath('/briefing')
  return { error: null }
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
    .select('id, created_at, routine, kind, outcome, business_id, recipient, subject, reason, snooze_until, sent_at, replied_at, business:businesses!routine_drafts_business_id_fkey(id, name)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  const { data, error } = businessId ? await query.eq('business_id', businessId) : await query

  if (error) return { error: error.message }

  const drafts: RoutineDraft[] = (data ?? []).map(row => {
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
      business: biz,
    }
  })

  return { data: drafts }
}
