'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { isFeatureEnabled } from '@/lib/feature-flags'
import type { AttentionRow } from '@/app/actions/attention'
import { addDays, splitDoNow, type TodayItem } from '@/lib/today'

// Today (UI overhaul Stage 7): the home page. Built on v_business_attention
// (Stage 4) plus hand-written to-dos. Engine tasks for replies, renewals and
// invoices are not shown: the view works those out itself.

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export type WeekEvent = {
  date: string
  kind: 'renewal' | 'todo' | 'invoice'
  label: string
  business_id: string | null
}

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
  week: WeekEvent[]
  owed: number
  newLeads: number
  draftsReady: number
  /** Club Card pages waiting for Tom on the matching page. */
  clubCardToMatch: number
  quiet: QuietReminder[]
}

type ManualTask = {
  id: string
  title: string
  due_date: string | null
  business_id: string | null
  business: { name: string } | { name: string }[] | null
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

async function getToday(supabase: SupabaseServer): Promise<string> {
  const { data } = await supabase.rpc('cc_today')
  return typeof data === 'string' ? data : new Date().toISOString().slice(0, 10)
}

async function loadCore(supabase: SupabaseServer, orgId: string) {
  const [today, rowsRes, tasksRes] = await Promise.all([
    getToday(supabase),
    supabase.from('v_business_attention').select('*').eq('organization_id', orgId),
    supabase
      .from('tasks')
      .select('id, title, due_date, business_id, business:businesses!tasks_business_id_fkey(name)')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .eq('source', 'manual')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])
  if (rowsRes.error) throw new Error(rowsRes.error.message)
  if (tasksRes.error) throw new Error(tasksRes.error.message)
  const rows = (rowsRes.data ?? []) as AttentionRow[]
  const tasks = (tasksRes.data ?? []) as ManualTask[]
  return { today, rows, tasks, items: buildItems(rows, tasks) }
}

function buildItems(rows: AttentionRow[], tasks: ManualTask[]): TodayItem[] {
  const items: TodayItem[] = []
  const taskIds = new Set(tasks.map((t) => t.id))
  for (const r of rows) {
    if (r.is_snoozed) continue
    const others = r.reasons.filter((x) => x !== r.reason)
    if (r.reason !== 'todo') {
      items.push({
        key: `${r.reason}:${r.business_id}`, reason: r.reason, business_id: r.business_id, business_name: r.business_name,
        detail: r.detail, since: r.since, ref_id: r.ref_id, other_reasons: others,
      })
    } else if (r.ref_id && !taskIds.has(r.ref_id)) {
      // The view's to-do here is a "Follow up" flag on an email; hand-written
      // to-dos are listed one by one below instead.
      items.push({
        key: `flag:${r.ref_id}`, reason: 'todo', todo_kind: 'flag', business_id: r.business_id, business_name: r.business_name,
        detail: r.detail, since: r.since, ref_id: r.ref_id, other_reasons: others,
      })
    }
  }
  for (const t of tasks) {
    items.push({
      key: `task:${t.id}`, reason: 'todo', todo_kind: 'task', business_id: t.business_id, business_name: one(t.business)?.name ?? null,
      detail: t.title, since: t.due_date, ref_id: t.id, other_reasons: [],
    })
  }
  return items
}

/** The nav badge: how many lines are in Do now (at most 8). Null when unavailable. */
export async function getDoNowCount(): Promise<number | null> {
  if (!isFeatureEnabled('attentionView')) return null
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return null
  try {
    const { today, items } = await loadCore(supabase, orgId)
    return splitDoNow(items, today).doNow.length
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
  const { today, rows, tasks, items } = core
  const weekEnd = addDays(today, 6)
  const draftsSince = new Date(Date.now() - 14 * 86_400_000).toISOString()

  const [contractsRes, linksRes, invoicesRes, leadsRes, draftsRes, quietRes, toMatchRes] = await Promise.all([
    supabase
      .from('contracts')
      .select('business_id, membership_type, contract_end')
      .eq('organization_id', orgId)
      .eq('is_current', true)
      .in('membership_type', ['club_card', 'advertiser'])
      .gte('contract_end', today)
      .lte('contract_end', weekEnd),
    supabase.from('qbo_links').select('business_id, qbo_customer_id').eq('organization_id', orgId),
    supabase
      .from('qbo_invoices')
      .select('qbo_customer_id, doc_number, due_date, balance, private_memo')
      .eq('organization_id', orgId)
      .gt('balance', 0)
      .gte('due_date', today)
      .lte('due_date', weekEnd),
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

  // Business names for the week strip: the attention rows and to-dos carry most;
  // fetch the rest by id.
  const names = new Map<string, string>()
  for (const r of rows) names.set(r.business_id, r.business_name)
  for (const t of tasks) if (t.business_id && one(t.business)) names.set(t.business_id, one(t.business)!.name)
  const customerToBusiness = new Map((linksRes.data ?? []).map((l) => [l.qbo_customer_id as string, l.business_id as string]))
  const invoices = (invoicesRes.data ?? []).filter((i) => (i.private_memo ?? '') !== 'Voided')
  const wanted = [
    ...(contractsRes.data ?? []).map((c) => c.business_id as string),
    ...invoices.map((i) => customerToBusiness.get(i.qbo_customer_id as string)).filter((id): id is string => !!id),
  ].filter((id) => !names.has(id))
  if (wanted.length > 0) {
    const { data } = await supabase.from('businesses').select('id, name').in('id', [...new Set(wanted)])
    for (const b of data ?? []) names.set(b.id, b.name)
  }

  const week: WeekEvent[] = []
  for (const c of contractsRes.data ?? []) {
    week.push({
      date: c.contract_end as string, kind: 'renewal', business_id: c.business_id,
      label: `${names.get(c.business_id) ?? 'A business'}: ${c.membership_type === 'club_card' ? 'Club Card' : 'advertising'} ends`,
    })
  }
  for (const t of tasks) {
    if (t.due_date && t.due_date >= today && t.due_date <= weekEnd) {
      week.push({ date: t.due_date, kind: 'todo', business_id: t.business_id, label: t.title })
    }
  }
  for (const i of invoices) {
    const bid = customerToBusiness.get(i.qbo_customer_id as string) ?? null
    week.push({
      date: i.due_date as string, kind: 'invoice', business_id: bid,
      label: `${bid ? names.get(bid) ?? 'A business' : 'A customer'}: invoice ${i.doc_number ? `${i.doc_number} ` : ''}due`,
    })
  }
  week.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))

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
      week,
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
