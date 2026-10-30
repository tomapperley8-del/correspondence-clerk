'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { isHiddenEngineTask } from '@/lib/today'
import { deleteTodayTask, undoDeleteTodayTask } from '@/app/actions/today'
import { CALENDAR_KINDS, NEWSLETTER_CATEGORY, nextWednesday, type CalendarKind } from '@/lib/calendar'

// Work calendar and newsletter list (UI overhaul Stage 12). Everything here is
// a row in `tasks` (or a marker read from contracts and QuickBooks), so what
// the calendar adds or moves shows on Today, the business page, the desk email
// and the routines with nothing to sync. Moving an engine task's date goes
// through the tasks_write_back_to_source trigger, which records it as a snooze
// that sticks (Stage 1); nothing here bypasses it.

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export type CalendarItem = {
  key: string
  /** task = a row in tasks (can be moved); renewal and invoice are markers. */
  kind: 'task' | 'renewal' | 'invoice'
  date: string
  time: string | null
  title: string
  category: string | null
  business_id: string | null
  business_name: string | null
  done: boolean
  /** Written by the task engine (check-ins, stats, editorial), not by hand. */
  engine: boolean
  /** An engine "promote my event" task: on the newsletter list, can be taken off it. */
  editorial: boolean
  task_id: string | null
}

export type NewsletterItem = {
  key: string
  kind: 'task' | 'commitment' | 'editorial'
  title: string
  date: string | null
  business_id: string | null
  business_name: string | null
  /** Task id for task and editorial items, the email's id for commitments. */
  ref_id: string
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
const isTime = (t: string) => /^\d{2}:\d{2}$/.test(t)

async function context(): Promise<{ supabase: SupabaseServer; orgId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }
  return { supabase, orgId }
}

/** Category ids by name, inactive ones included (Deadline is switched off in Settings). */
async function categoryIds(supabase: SupabaseServer, orgId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('task_categories').select('id, name').eq('organization_id', orgId)
  return new Map((data ?? []).map((c) => [c.name.toLowerCase(), c.id as string]))
}

async function getToday(supabase: SupabaseServer): Promise<string> {
  const { data } = await supabase.rpc('cc_today')
  return typeof data === 'string' ? data : new Date().toISOString().slice(0, 10)
}

function refresh(businessId?: string | null) {
  revalidatePath('/today')
  revalidatePath('/newsletter')
  if (businessId) revalidatePath(`/businesses/${businessId}`)
}

/** Everything dated between `from` and `to` (inclusive): tasks, renewals ending and invoices due. */
export async function getCalendarItems(from: string, to: string): Promise<{ data?: CalendarItem[]; error?: string }> {
  if (!isDate(from) || !isDate(to)) return { error: 'Invalid dates' }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  const [tasksRes, contractsRes, linksRes, invoicesRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, due_date, due_time, status, source, signal_key, business_id, business:businesses!tasks_business_id_fkey(name), task_category:task_categories(name)')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .gte('due_date', from)
      .lte('due_date', to),
    supabase
      .from('contracts')
      .select('id, business_id, membership_type, contract_end, business:businesses(name)')
      .eq('organization_id', orgId)
      .eq('is_current', true)
      .in('membership_type', ['club_card', 'advertiser'])
      .gte('contract_end', from)
      .lte('contract_end', to),
    supabase.from('qbo_links').select('business_id, qbo_customer_id').eq('organization_id', orgId),
    supabase
      .from('qbo_invoices')
      .select('qbo_invoice_id, qbo_customer_id, doc_number, due_date, balance, private_memo')
      .eq('organization_id', orgId)
      .gt('balance', 0)
      .gte('due_date', from)
      .lte('due_date', to),
  ])
  if (tasksRes.error) return { error: tasksRes.error.message }

  const items: CalendarItem[] = []
  for (const t of tasksRes.data ?? []) {
    // Replies, renewals and invoices are worked out by v_business_attention;
    // their engine tasks stay hidden here as everywhere else (Stage 7).
    if (isHiddenEngineTask(t)) continue
    items.push({
      key: `task:${t.id}`, kind: 'task', date: t.due_date as string, time: (t.due_time as string | null) || null,
      title: t.title, category: one(t.task_category as { name: string } | { name: string }[] | null)?.name ?? null,
      business_id: t.business_id, business_name: one(t.business as { name: string } | { name: string }[] | null)?.name ?? null,
      done: false, engine: t.source !== 'manual', editorial: ((t.signal_key as string | null) ?? '').startsWith('editorial:'), task_id: t.id,
    })
  }
  for (const c of contractsRes.data ?? []) {
    const name = one(c.business as { name: string } | { name: string }[] | null)?.name ?? null
    items.push({
      key: `renewal:${c.id}`, kind: 'renewal', date: c.contract_end as string, time: null,
      title: `${name ?? 'A business'}: ${c.membership_type === 'club_card' ? 'Club Card' : 'advertising'} ends`,
      category: null, business_id: c.business_id, business_name: name, done: false, engine: false, editorial: false, task_id: null,
    })
  }
  const invoices = (invoicesRes.data ?? []).filter((i) => (i.private_memo ?? '') !== 'Voided')
  if (invoices.length > 0) {
    const customerToBusiness = new Map((linksRes.data ?? []).map((l) => [l.qbo_customer_id as string, l.business_id as string]))
    const ids = [...new Set(invoices.map((i) => customerToBusiness.get(i.qbo_customer_id as string)).filter((id): id is string => !!id))]
    const names = new Map<string, string>()
    if (ids.length > 0) {
      const { data } = await supabase.from('businesses').select('id, name').in('id', ids)
      for (const b of data ?? []) names.set(b.id, b.name)
    }
    for (const i of invoices) {
      const bid = customerToBusiness.get(i.qbo_customer_id as string) ?? null
      const name = bid ? names.get(bid) ?? null : null
      items.push({
        key: `invoice:${i.qbo_invoice_id ?? i.doc_number}`, kind: 'invoice', date: i.due_date as string, time: null,
        title: `${name ?? 'A customer'}: invoice ${i.doc_number ? `${i.doc_number} ` : ''}due`,
        category: null, business_id: bid, business_name: name, done: false, engine: false, editorial: false, task_id: null,
      })
    }
  }
  const order = { invoice: 0, renewal: 1, task: 2 }
  items.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title, 'en-GB'))
  return { data: items }
}

/** Add a to-do, call, meeting, event, deadline or newsletter item on a day. */
export async function addCalendarItem(input: {
  kind: CalendarKind
  title: string
  date: string
  time?: string | null
  business_id?: string | null
}): Promise<{ id?: string; error?: string }> {
  const kind = CALENDAR_KINDS.find((k) => k.value === input.kind)
  if (!kind) return { error: 'Unknown kind' }
  if (!input.title.trim()) return { error: 'Say what it is' }
  if (!isDate(input.date)) return { error: 'Invalid date' }
  if (input.time && !isTime(input.time)) return { error: 'Invalid time' }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  const categories = await categoryIds(supabase, orgId)
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title.trim(),
      due_date: input.date,
      due_time: input.time || null,
      category: 'work',
      type: kind.type,
      task_category_id: categories.get(kind.category.toLowerCase()) ?? null,
      business_id: input.business_id || null,
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  refresh(input.business_id)
  return { id: data.id }
}

/**
 * Move a task to another day (and optionally time). For engine tasks the
 * tasks_write_back_to_source trigger records a later date as a snooze that
 * the nightly refresh keeps.
 */
export async function moveCalendarItem(taskId: string, date: string, time?: string | null): Promise<{ error?: string }> {
  if (!isDate(date)) return { error: 'Invalid date' }
  if (time && !isTime(time)) return { error: 'Invalid time' }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx
  const update: Record<string, unknown> = { due_date: date }
  if (time !== undefined) update.due_time = time || null
  const { data, error } = await supabase
    .from('tasks')
    .update(update)
    .eq('id', taskId)
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .select('business_id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'That item is done or no longer exists' }
  refresh(data.business_id)
  return {}
}

/**
 * "For Wednesday's newsletter": open For Newsletter tasks, routine commitments
 * to include something in the newsletter, and "promote my event" editorial
 * emails. Ticking one off (markNewsletterUsed) takes it off the list.
 */
export async function getNewsletterList(): Promise<{ data?: { wednesday: string; items: NewsletterItem[] }; error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx
  const [today, categories] = await Promise.all([getToday(supabase), categoryIds(supabase, orgId)])
  const newsletterId = categories.get(NEWSLETTER_CATEGORY.toLowerCase())
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()

  const [tasksRes, editorialRes, commitmentsRes] = await Promise.all([
    // For Newsletter to-dos, and hand-written to-dos that say "newsletter" but were filed elsewhere
    supabase
      .from('tasks')
      .select('id, title, due_date, task_category_id, signal_meta, business_id, business:businesses!tasks_business_id_fkey(name)')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .or(`${newsletterId ? `task_category_id.eq.${newsletterId},` : ''}and(source.eq.manual,title.ilike.*newsletter*)`),
    supabase
      .from('tasks')
      .select('id, title, due_date, signal_meta, business_id, business:businesses!tasks_business_id_fkey(name)')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .like('signal_key', 'editorial:%')
      .or('title.ilike.%promote%,title.ilike.%newsletter%'),
    // Routine-tagged promises ("include X in Wednesday's newsletter") from the last 60 days, not yet done
    supabase
      .from('correspondence')
      .select('id, entry_date, intent_meta, business_id, business:businesses!correspondence_business_id_fkey(name)')
      .eq('organization_id', orgId)
      .eq('intent', 'commitment')
      .gte('entry_date', since)
      .ilike('intent_meta->>what', '%newsletter%')
      .or('intent_meta->>done.is.null,intent_meta->>done.neq.true'),
  ])
  if (tasksRes.error) return { error: tasksRes.error.message }

  const items: NewsletterItem[] = []
  for (const t of tasksRes.data ?? []) {
    // A to-do that says "newsletter" but was changed to another kind stays off the list.
    if (t.task_category_id !== newsletterId && (t.signal_meta as { not_newsletter?: boolean } | null)?.not_newsletter) continue
    items.push({
      key: `task:${t.id}`, kind: 'task', title: t.title, date: t.due_date, ref_id: t.id,
      business_id: t.business_id, business_name: one(t.business as { name: string } | { name: string }[] | null)?.name ?? null,
    })
  }
  for (const t of editorialRes.data ?? []) {
    items.push({
      key: `editorial:${t.id}`, kind: 'editorial', title: t.title.replace(/^Editorial:\s*/, ''),
      // Moved by Tom: the new date; otherwise the day it arrived.
      date: (((t.signal_meta as { snooze_until?: string } | null)?.snooze_until ? t.due_date : null) ?? (t.signal_meta as { received?: string } | null)?.received ?? t.due_date) || null, ref_id: t.id,
      business_id: t.business_id, business_name: one(t.business as { name: string } | { name: string }[] | null)?.name ?? null,
    })
  }
  for (const c of commitmentsRes.data ?? []) {
    const meta = (c.intent_meta ?? {}) as { what?: string; due?: string }
    items.push({
      key: `commitment:${c.id}`, kind: 'commitment', title: meta.what ?? 'Newsletter item', date: meta.due ?? (c.entry_date as string).slice(0, 10),
      ref_id: c.id, business_id: c.business_id,
      business_name: one(c.business as { name: string } | { name: string }[] | null)?.name ?? null,
    })
  }
  // Dated first, soonest first; undated last
  items.sort((a, b) => (!a.date !== !b.date ? (a.date ? -1 : 1) : (a.date ?? '').localeCompare(b.date ?? '')))
  return { data: { wednesday: nextWednesday(today), items } }
}

/** It has gone in the newsletter: tick it off at its source. */
export async function markNewsletterUsed(kind: NewsletterItem['kind'], refId: string): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  if (kind === 'task' || kind === 'editorial') {
    // For editorial tasks the write-back trigger also marks the email as dealt with.
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'done' })
      .eq('id', refId)
      .eq('organization_id', orgId)
      .select('business_id')
      .maybeSingle()
    if (error) return { error: error.message }
    refresh(data?.business_id)
    return {}
  }

  // Commitment: the same mark the write-back trigger leaves when its task is ticked.
  const { data: entry, error: readError } = await supabase
    .from('correspondence')
    .select('id, business_id, intent_meta')
    .eq('id', refId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!entry) return { error: 'Email not found' }
  const meta = { ...((entry.intent_meta ?? {}) as Record<string, unknown>), done: true, done_at: new Date().toISOString(), done_via: 'newsletter_list' }
  const { error } = await supabase.from('correspondence').update({ intent_meta: meta }).eq('id', refId).eq('organization_id', orgId)
  if (error) return { error: error.message }
  // Close any open engine task for the same promise, so the desk email agrees.
  await supabase
    .from('tasks')
    .update({ status: 'done' })
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .eq('signal_key', `commitment:${refId}`)
  refresh(entry.business_id)
  return {}
}

// ---- Newsletter items: delete, move and change kind (Tom, 28 Oct) ----
// Each kind keeps one source: a task's own row, or for a routine promise the
// email's intent_meta (`due`, `done`). Closing an engine task goes through the
// write-back trigger, which marks its email as dealt with, so nothing comes
// back on the nightly refresh. The email's text is never touched (Hard Rule 10).

/** What Undo needs to put a deleted newsletter item back. */
export type NewsletterUndo =
  | { kind: 'task'; backupId: number }
  | { kind: 'editorial'; taskId: string }
  | { kind: 'commitment'; backupId: number; taskIds: string[] }

type IntentMeta = Record<string, unknown>

/** Close the open engine task(s) for a promise first, so the trigger's own mark is overwritten by ours. */
async function closeCommitmentTasks(supabase: SupabaseServer, orgId: string, correspondenceId: string): Promise<string[]> {
  const { data } = await supabase
    .from('tasks')
    .update({ status: 'done' })
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .eq('signal_key', `commitment:${correspondenceId}`)
    .select('id')
  return (data ?? []).map((t) => t.id as string)
}

async function readCommitment(supabase: SupabaseServer, orgId: string, id: string) {
  const { data, error } = await supabase
    .from('correspondence')
    .select('id, business_id, entry_date, intent_meta')
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('intent', 'commitment')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Email not found' }
  return { entry: { ...data, intent_meta: (data.intent_meta ?? {}) as IntentMeta } }
}

/**
 * Delete from the newsletter list. A hand-written item is deleted (backed up);
 * a "promote my event" task is closed, which marks its email as dealt with; a
 * routine promise is marked done (done_via 'newsletter_deleted'), the email
 * itself kept as it is. All three can be undone.
 */
export async function deleteNewsletterItem(kind: NewsletterItem['kind'], refId: string): Promise<{ undo?: NewsletterUndo; error?: string }> {
  if (kind === 'task') {
    const result = await deleteTodayTask(refId)
    if (result.error || result.backupId === undefined) return { error: result.error ?? 'Not deleted' }
    return { undo: { kind: 'task', backupId: result.backupId } }
  }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  if (kind === 'editorial') {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'done' })
      .eq('id', refId)
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .like('signal_key', 'editorial:%')
      .select('business_id')
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'Already gone' }
    refresh(data.business_id)
    return { undo: { kind: 'editorial', taskId: refId } }
  }

  const read = await readCommitment(supabase, orgId, refId)
  if ('error' in read) return { error: read.error }
  const { data: full } = await supabase.from('correspondence').select('*').eq('id', refId).eq('organization_id', orgId).single()
  const { data: backup, error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert({ table_name: 'correspondence', row_id: refId, before_row: full, reason: 'newsletter_delete' })
    .select('id')
    .single()
  if (backupError) return { error: `Not deleted: the backup failed (${backupError.message})` }
  const taskIds = await closeCommitmentTasks(supabase, orgId, refId)
  const meta = { ...read.entry.intent_meta, done: true, done_at: new Date().toISOString(), done_via: 'newsletter_deleted' }
  const { error } = await supabase.from('correspondence').update({ intent_meta: meta }).eq('id', refId).eq('organization_id', orgId)
  if (error) return { error: error.message }
  refresh(read.entry.business_id)
  return { undo: { kind: 'commitment', backupId: backup.id as number, taskIds } }
}

/** Undo deleteNewsletterItem: put the item back exactly as it was. */
export async function undoDeleteNewsletterItem(undo: NewsletterUndo): Promise<{ error?: string }> {
  if (undo.kind === 'task') {
    return undoDeleteTodayTask(undo.backupId)
  }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  if (undo.kind === 'editorial') {
    // Reopening runs the trigger the other way: the email is waiting again.
    const { error } = await supabase.from('tasks').update({ status: 'open' }).eq('id', undo.taskId).eq('organization_id', orgId).like('signal_key', 'editorial:%')
    if (error) return { error: error.message }
    refresh()
    return {}
  }

  const { data: backup } = await supabase
    .from('cc_phase0_backup')
    .select('row_id, before_row')
    .eq('id', undo.backupId)
    .eq('table_name', 'correspondence')
    .maybeSingle()
  const before = backup?.before_row as { organization_id?: string; intent_meta?: IntentMeta; business_id?: string } | undefined
  if (!backup || !before || before.organization_id !== orgId) return { error: 'Nothing to undo' }
  if (undo.taskIds.length > 0) {
    await supabase
      .from('tasks')
      .update({ status: 'open' })
      .in('id', undo.taskIds)
      .eq('organization_id', orgId)
      .eq('signal_key', `commitment:${backup.row_id}`)
  }
  // After the tasks: reopening strips `done`, then the saved meta goes back as it was.
  const { error } = await supabase.from('correspondence').update({ intent_meta: before.intent_meta ?? null }).eq('id', backup.row_id).eq('organization_id', orgId)
  if (error) return { error: error.message }
  refresh(before.business_id)
  return {}
}

/**
 * Move a newsletter item to another date. Tasks move their due date (an engine
 * task's later date sticks as a snooze); a routine promise moves its
 * intent_meta.due, and its open engine task follows.
 */
export async function moveNewsletterItem(kind: NewsletterItem['kind'], refId: string, date: string): Promise<{ error?: string }> {
  if (kind !== 'commitment') return moveCalendarItem(refId, date)
  if (!isDate(date)) return { error: 'Invalid date' }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx
  const read = await readCommitment(supabase, orgId, refId)
  if ('error' in read) return { error: read.error }
  const { error } = await supabase
    .from('correspondence')
    .update({ intent_meta: { ...read.entry.intent_meta, due: date } })
    .eq('id', refId)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  await supabase.from('tasks').update({ due_date: date }).eq('organization_id', orgId).eq('status', 'open').eq('signal_key', `commitment:${refId}`)
  refresh(read.entry.business_id)
  return {}
}

/**
 * Change a task to another kind (To-do, Call, Meeting, Event, Deadline or For
 * newsletter). A hand-written task changes its own category. A task the engine
 * made gets a hand-written one of the new kind, linked to it, and is closed
 * (its email marked as dealt with), so the engine doesn't make it again.
 */
export async function changeTaskKind(taskId: string, to: CalendarKind): Promise<{ id?: string; error?: string }> {
  const kind = CALENDAR_KINDS.find((k) => k.value === to)
  if (!kind) return { error: 'Unknown kind' }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx
  const { data: task, error: readError } = await supabase
    .from('tasks')
    .select('id, title, due_date, due_time, source, signal_key, signal_meta, business_id')
    .eq('id', taskId)
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!task) return { error: 'That item is done or no longer exists' }
  const categories = await categoryIds(supabase, orgId)
  const categoryId = categories.get(kind.category.toLowerCase()) ?? null
  const meta = (task.signal_meta ?? {}) as IntentMeta

  if (task.source === 'manual') {
    const rest = { ...meta }
    delete rest.not_newsletter
    const { error } = await supabase
      .from('tasks')
      .update({ task_category_id: categoryId, type: kind.type, signal_meta: to === 'newsletter' ? rest : { ...rest, not_newsletter: true } })
      .eq('id', taskId)
      .eq('organization_id', orgId)
    if (error) return { error: error.message }
    refresh(task.business_id)
    return { id: taskId }
  }

  const today = await getToday(supabase)
  const { data: made, error } = await supabase
    .from('tasks')
    .insert({
      title: task.title.replace(/^Editorial:\s*/, ''),
      due_date: task.due_date ?? today,
      due_time: task.due_time ?? null,
      category: 'work',
      type: kind.type,
      task_category_id: categoryId,
      business_id: task.business_id,
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
      signal_meta: { changed_from: task.signal_key, from_task: task.id, ...(to === 'newsletter' ? {} : { not_newsletter: true }) },
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId).eq('organization_id', orgId)
  refresh(task.business_id)
  return { id: made.id }
}

/** "Change to…" on the newsletter list: a routine promise becomes a hand-written task of that kind, linked to its email. */
export async function changeNewsletterKind(kind: NewsletterItem['kind'], refId: string, to: CalendarKind): Promise<{ id?: string; error?: string }> {
  if (kind !== 'commitment') return changeTaskKind(refId, to)
  const found = CALENDAR_KINDS.find((k) => k.value === to)
  if (!found || to === 'newsletter') return { error: 'Choose another kind' }
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx
  const read = await readCommitment(supabase, orgId, refId)
  if ('error' in read) return { error: read.error }
  const { entry } = read
  const [today, categories] = await Promise.all([getToday(supabase), categoryIds(supabase, orgId)])
  const due = typeof entry.intent_meta.due === 'string' && isDate(entry.intent_meta.due) ? entry.intent_meta.due : today
  const { data: made, error } = await supabase
    .from('tasks')
    .insert({
      title: typeof entry.intent_meta.what === 'string' && entry.intent_meta.what.trim() ? entry.intent_meta.what : 'Newsletter item',
      due_date: due,
      category: 'work',
      type: found.type,
      task_category_id: categories.get(found.category.toLowerCase()) ?? null,
      business_id: entry.business_id,
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
      signal_meta: { changed_from: `commitment:${refId}`, correspondence_id: refId, not_newsletter: true },
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await closeCommitmentTasks(supabase, orgId, refId)
  const meta = { ...entry.intent_meta, done: true, done_at: new Date().toISOString(), done_via: 'changed_to_task', task_id: made.id }
  await supabase.from('correspondence').update({ intent_meta: meta }).eq('id', refId).eq('organization_id', orgId)
  refresh(entry.business_id)
  return { id: made.id }
}

/**
 * The "For newsletter" button on an email, a business or a to-do: adds a For
 * Newsletter task for the coming Wednesday, linked to the business and to its
 * source (signal_meta.newsletter_source / newsletter_ref). The title is the
 * email's subject, the business's name or the to-do's own words, as written.
 */
export async function addForNewsletter(from: 'correspondence' | 'business' | 'task', id: string): Promise<{ id?: string; already?: boolean; wednesday?: string; error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  let title: string | null = null
  let businessId: string | null = null
  if (from === 'correspondence') {
    const { data } = await supabase
      .from('correspondence')
      .select('subject, entry_date, business_id, business:businesses!correspondence_business_id_fkey(name)')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (!data) return { error: 'Email not found' }
    const name = one(data.business as { name: string } | { name: string }[] | null)?.name ?? 'a business'
    title = data.subject?.trim() || `Email from ${name}, ${new Date(data.entry_date as string).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`
    businessId = data.business_id
  } else if (from === 'business') {
    const { data } = await supabase.from('businesses').select('id, name').eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (!data) return { error: 'Business not found' }
    title = data.name
    businessId = data.id
  } else {
    const { data } = await supabase.from('tasks').select('title, business_id').eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (!data) return { error: 'To-do not found' }
    title = data.title
    businessId = data.business_id
  }

  const [today, categories] = await Promise.all([getToday(supabase), categoryIds(supabase, orgId)])
  const categoryId = categories.get(NEWSLETTER_CATEGORY.toLowerCase())
  if (!categoryId) return { error: 'The For Newsletter category is missing in Settings' }
  const wednesday = nextWednesday(today)

  // Pressing it twice doesn't add the same thing twice.
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .eq('task_category_id', categoryId)
    .eq('signal_meta->>newsletter_ref', id)
    .limit(1)
  if (existing && existing.length > 0) return { id: existing[0].id, already: true, wednesday }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      due_date: wednesday,
      category: 'work',
      type: 'task',
      task_category_id: categoryId,
      business_id: businessId,
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
      signal_meta: { newsletter_source: from, newsletter_ref: id },
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  refresh(businessId)
  return { id: data.id, wednesday }
}
