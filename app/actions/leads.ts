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

  const { data, error } = await supabase
    .from('prospect_leads')
    .select('*, matched_business:businesses!prospect_leads_matched_business_id_fkey(id, name)')
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

// ---- Recent AI drafts (created by the Delegate to Claude button) ----

export type RecentDraft = {
  id: string
  business_id: string
  subject: string | null
  formatted_text_current: string | null
  created_at: string
  edited_at: string | null
  draft_status: 'draft' | 'sent'
  task_title: string | null
  business: { id: string; name: string } | null
}

export async function getRecentDrafts(limit = 10): Promise<{ data?: RecentDraft[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('correspondence')
    .select('id, business_id, subject, formatted_text_current, created_at, edited_at, ai_metadata, business:businesses!correspondence_business_id_fkey(id, name)')
    .eq('ai_metadata->>source', 'delegate_draft')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }

  const drafts: RecentDraft[] = (data ?? []).map(row => {
    const meta = (row.ai_metadata ?? {}) as { draft_status?: string; task_title?: string }
    const bizRaw = row.business as unknown
    const biz = Array.isArray(bizRaw) ? (bizRaw[0] as { id: string; name: string } | undefined) ?? null : (bizRaw as { id: string; name: string } | null)
    return {
      id: row.id,
      business_id: row.business_id,
      subject: row.subject,
      formatted_text_current: row.formatted_text_current,
      created_at: row.created_at,
      edited_at: row.edited_at,
      draft_status: meta.draft_status === 'sent' ? 'sent' : 'draft',
      task_title: meta.task_title ?? null,
      business: biz,
    }
  })

  return { data: drafts }
}

export async function markDraftSent(id: string): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: entry } = await supabase
    .from('correspondence')
    .select('ai_metadata')
    .eq('id', id)
    .single()

  if (!entry) return { error: 'Draft not found' }

  const meta = { ...((entry.ai_metadata ?? {}) as Record<string, unknown>), draft_status: 'sent' }
  const { error } = await supabase
    .from('correspondence')
    .update({ ai_metadata: meta })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/briefing')
  return { error: null }
}
