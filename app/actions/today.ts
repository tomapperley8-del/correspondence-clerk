'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { loadTodayCore } from '@/lib/today-source'
import { overdueItems, type TodayItem } from '@/lib/today'
import { getBusinessGlance, type BusinessGlance } from '@/app/actions/business-glance'

// Today (UI overhaul Stage 7): the home page. Built on v_business_attention
// (Stage 4) plus hand-written to-dos. Engine tasks for replies, renewals and
// invoices are not shown: the view works those out itself.

export type QuietReminder = {
  id: string
  kind: 'checkin' | 'stats' | 'editorial'
  title: string
  due_date: string | null
  business_id: string | null
  business_name: string | null
}

export type TodayData = {
  today: string
  items: TodayItem[]
  snoozed: { business_id: string; business_name: string; until: string | null; reason: string }[]
  owed: number
  newLeads: number
  draftsReady: number
  /** Club Card pages waiting for Tom on the matching page. */
  clubCardToMatch: number
  quiet: QuietReminder[]
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

// Today's list is loaded in lib/today-source.ts, shared with the desk email (Stage 11a).
const loadCore = loadTodayCore

/** The nav badge: how many items are overdue (Stage 14a v2, no cap). Null when unavailable. */
export async function getOverdueCount(): Promise<number | null> {
  if (!isFeatureEnabled('attentionView')) return null
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return null
  try {
    const { today, items } = await loadCore(supabase, orgId)
    return overdueItems(items, today).length
  } catch {
    return null
  }
}

export async function getTodayData(): Promise<{ data?: TodayData; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  let core: Awaited<ReturnType<typeof loadCore>>
  try {
    core = await loadCore(supabase, orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load' }
  }
  const { today, rows, items } = core
  const draftsSince = new Date(Date.now() - 14 * 86_400_000).toISOString()

  const [leadsRes, draftsRes, quietRes, toMatchRes] = await Promise.all([
    supabase.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase
      .from('routine_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('outcome', 'drafted')
      .is('sent_at', null)
      .gte('created_at', draftsSince),
    supabase
      .from('tasks')
      .select('id, title, due_date, source, signal_key, business_id, business:businesses!tasks_business_id_fkey(name)')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .or('source.in.(club_card_checkin,advertiser_stats),signal_key.like.checkin:*,signal_key.like.stats:*,signal_key.like.editorial:*')
      .order('due_date', { ascending: true, nullsFirst: false }),
    // Club Card pages the nightly read couldn't match for sure (Stage 6b)
    supabase
      .from('club_card_pages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('gone_at', null)
      .in('match_status', ['unmatched', 'suggested']),
  ])

  const quiet: QuietReminder[] = (quietRes.data ?? []).map((t) => {
    const key = (t.signal_key as string | null) ?? ''
    const kind: QuietReminder['kind'] =
      key.startsWith('editorial:') ? 'editorial' : key.startsWith('stats:') || t.source === 'advertiser_stats' ? 'stats' : 'checkin'
    return {
      id: t.id, kind, title: t.title, due_date: t.due_date, business_id: t.business_id,
      business_name: one(t.business as { name: string } | { name: string }[] | null)?.name ?? null,
    }
  })

  return {
    data: {
      today,
      items,
      snoozed: rows
        .filter((r) => r.is_snoozed)
        .map((r) => ({ business_id: r.business_id, business_name: r.business_name, until: r.attention_snoozed_until, reason: r.reason })),
      owed: rows.filter((r) => !r.is_snoozed).reduce((sum, r) => sum + (r.amount_owed ?? 0), 0),
      newLeads: leadsRes.count ?? 0,
      draftsReady: draftsRes.count ?? 0,
      clubCardToMatch: toMatchRes.count ?? 0,
      quiet,
    },
  }
}

/** Business names for the quick add's business picker (the API returns at most 1,000 rows a request). */
export async function getBusinessNames(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return []
  const out: { id: string; name: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', orgId)
      .is('merged_into', null)
      .neq('status', 'Not a business')
      .order('name')
      .range(from, from + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** Mark a "Follow up" flag on an email as dealt with. */
export async function clearFollowUpFlag(correspondenceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { error } = await supabase
    .from('correspondence')
    .update({ action_needed: 'none' })
    .eq('id', correspondenceId)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/today')
  return { success: true }
}

/** Move a "Follow up" flag to another date (YYYY-MM-DD). */
export async function moveFollowUpFlag(correspondenceId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Invalid date' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { error } = await supabase
    .from('correspondence')
    .update({ due_at: `${date}T09:00:00Z` })
    .eq('id', correspondenceId)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/today')
  return { success: true }
}

// ---- Stage 14a v2: the detail panel, Delete with Undo, newsletter links ----

export type TodayDetail = {
  glance: BusinessGlance
  website: string | null
  contact: { id: string; name: string; role: string | null; emails: string[]; phones: string[]; manual: boolean } | null
  latestEmail: { id: string; subject: string | null; entry_date: string; direction: string | null } | null
}

/** Everything the detail panel shows for one business: the at-a-glance data, main contact and latest email. */
export async function getTodayDetail(businessId: string): Promise<{ data?: TodayDetail; error?: string }> {
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const [glanceRes, bizRes, emailRes] = await Promise.all([
    getBusinessGlance(businessId),
    supabase.from('v_businesses').select('website, main_contact_id, main_contact_is_manual').eq('id', businessId).eq('organization_id', orgId).maybeSingle(),
    supabase
      .from('correspondence')
      .select('id, subject, entry_date, direction')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .in('type', ['Email', 'Email Thread'])
      .order('entry_date', { ascending: false })
      .limit(1),
  ])
  if (glanceRes.error || !glanceRes.data) return { error: glanceRes.error ?? 'Could not load' }
  let contact: TodayDetail['contact'] = null
  const contactId = bizRes.data?.main_contact_id as string | null | undefined
  if (contactId) {
    const { data: c } = await supabase.from('contacts').select('id, name, role, emails, phones').eq('id', contactId).maybeSingle()
    if (c) {
      contact = {
        id: c.id, name: c.name, role: c.role,
        emails: Array.isArray(c.emails) ? (c.emails as string[]) : [],
        phones: Array.isArray(c.phones) ? (c.phones as string[]) : [],
        manual: !!bizRes.data?.main_contact_is_manual,
      }
    }
  }
  return {
    data: {
      glance: glanceRes.data,
      website: (bizRes.data?.website as string | null) ?? null,
      contact,
      latestEmail: (emailRes.data?.[0] as TodayDetail['latestEmail']) ?? null,
    },
  }
}

/**
 * Delete a hand-written to-do or newsletter item. The whole row is copied to
 * cc_phase0_backup first, so Undo (and anyone later) can put it back.
 * Tasks the engine made can't be deleted here: it would make them again.
 */
export async function deleteTodayTask(taskId: string): Promise<{ backupId?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { data: row, error: readError } = await supabase.from('tasks').select('*').eq('id', taskId).eq('organization_id', orgId).maybeSingle()
  if (readError) return { error: readError.message }
  if (!row) return { error: 'Already gone' }
  if (row.source !== 'manual') return { error: 'This one was made automatically and would come back. Use "It has gone in" or Done instead.' }
  const { data: backup, error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert({ table_name: 'tasks', row_id: taskId, before_row: row, reason: `today_delete ${user.id}` })
    .select('id')
    .single()
  if (backupError) return { error: `Not deleted: the backup failed (${backupError.message})` }
  const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/today')
  if (row.business_id) revalidatePath(`/businesses/${row.business_id}`)
  return { backupId: backup.id as number }
}

/** Undo a Delete: put the backed-up row back exactly as it was. */
export async function undoDeleteTodayTask(backupId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { data: backup, error: readError } = await supabase
    .from('cc_phase0_backup')
    .select('before_row')
    .eq('id', backupId)
    .eq('table_name', 'tasks')
    .maybeSingle()
  if (readError) return { error: readError.message }
  const row = backup?.before_row as Record<string, unknown> | undefined
  if (!row || row.organization_id !== orgId) return { error: 'Nothing to undo' }
  const { error } = await supabase.from('tasks').insert(row)
  if (error) return { error: error.message }
  revalidatePath('/today')
  if (row.business_id) revalidatePath(`/businesses/${row.business_id as string}`)
  return {}
}

/** Attach a to-do or newsletter item to a business (or detach it with null). */
export async function linkTaskToBusiness(taskId: string, businessId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { error } = await supabase.from('tasks').update({ business_id: businessId }).eq('id', taskId).eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/today')
  if (businessId) revalidatePath(`/businesses/${businessId}`)
  return {}
}
