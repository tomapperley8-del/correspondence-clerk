// The one source for Today's list (Stage 11a). The Today page, the nav badge
// and the morning desk email all load their items here, so they always agree.
// Takes any Supabase client: the signed-in user's on the page, the service-role
// client in the desk email cron.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttentionRow } from '@/app/actions/attention'
import type { TodayItem } from '@/lib/today'

type ManualTask = {
  id: string
  title: string
  due_date: string | null
  business_id: string | null
  business: { name: string } | { name: string }[] | null
  task_category: { name: string } | { name: string }[] | null
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

/** The London date from the database (cc_today), the one clock. */
export async function getTodayDate(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.rpc('cc_today')
  return typeof data === 'string' ? data : new Date().toISOString().slice(0, 10)
}

export async function loadTodayCore(supabase: SupabaseClient, orgId: string) {
  const [today, rowsRes, tasksRes] = await Promise.all([
    getTodayDate(supabase),
    supabase.from('v_business_attention').select('*').eq('organization_id', orgId),
    supabase
      .from('tasks')
      .select('id, title, due_date, business_id, business:businesses!tasks_business_id_fkey(name), task_category:task_categories(name)')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .eq('source', 'manual')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])
  if (rowsRes.error) throw new Error(rowsRes.error.message)
  if (tasksRes.error) throw new Error(tasksRes.error.message)
  const rows = (rowsRes.data ?? []) as AttentionRow[]
  const tasks = (tasksRes.data ?? []) as ManualTask[]
  return { today, rows, tasks, items: buildTodayItems(rows, tasks) }
}

export function buildTodayItems(rows: AttentionRow[], tasks: ManualTask[]): TodayItem[] {
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
      for_newsletter: one(t.task_category)?.name === 'For Newsletter',
    })
  }
  return items
}

export type SystemMiss = { job_key: string; label: string; line: string }

/**
 * Scheduled jobs and routines that missed (Stage 18, system_alarm() in the database).
 * The desk email's "System" line and Today's banner both read this, so they agree.
 * Fails quiet: an alarm that can't be read never stops the page or the email.
 */
export async function loadSystemMisses(supabase: SupabaseClient): Promise<SystemMiss[]> {
  const { data, error } = await supabase.from('v_system_alarm').select('job_key, label, line').eq('missed', true)
  if (error) {
    console.error('[system-alarm] read error:', error.message)
    return []
  }
  return (data ?? []) as SystemMiss[]
}
