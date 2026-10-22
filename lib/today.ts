// Today page rules (UI overhaul Stage 7). Pure functions, shared by the page
// and the nav badge so both always show the same "Do now" number.
// The plan's section "New layout (Stage 7)" is the source of these rules.

export type TodayReason = 'money_owed' | 'renewal' | 'waiting_on_you' | 'todo'

export type TodayItem = {
  key: string
  reason: TodayReason
  business_id: string | null
  business_name: string | null
  detail: string
  /** The date the age is counted from: invoice due, contract end, oldest email, to-do due. */
  since: string | null
  /** For to-dos: a hand-written task, or a "Follow up" flag on an email. */
  todo_kind?: 'task' | 'flag'
  /** Task id, contract id, latest email id or flag email id, by reason. */
  ref_id: string | null
  other_reasons: TodayReason[]
}

export const DO_NOW_LIMIT = 8

export const REASON_LABEL: Record<TodayReason, string> = {
  money_owed: 'Money owed',
  renewal: 'Renewal',
  waiting_on_you: 'Waiting on you',
  todo: 'To-do',
}

const REASON_WEIGHT: Record<TodayReason, number> = { money_owed: 4, renewal: 3, waiting_on_you: 2, todo: 1 }

/** Whole days from `since` to `today` (both YYYY-MM-DD); negative when `since` is in the future. */
export function daysFrom(since: string | null, today: string): number | null {
  if (!since) return null
  const a = Date.UTC(+since.slice(0, 4), +since.slice(5, 7) - 1, +since.slice(8, 10))
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Do now: money more than 30 days overdue; a renewal that ended in the last
 * 30 days or ends within 7; an email waiting 7 days or more; a to-do past its date.
 */
export function isDoNow(item: TodayItem, today: string): boolean {
  const age = daysFrom(item.since, today)
  if (age === null) return false
  switch (item.reason) {
    case 'money_owed':
      return age > 30
    case 'renewal':
      return age >= -7 && age <= 30
    case 'waiting_on_you':
      return age >= 7
    case 'todo':
      return age >= 1
  }
}

/** Most pressing first: money, renewal, reply, to-do, then the oldest. */
export function pressingOrder(a: TodayItem, b: TodayItem, today: string): number {
  const age = (i: TodayItem) => daysFrom(i.since, today) ?? 0
  return REASON_WEIGHT[b.reason] - REASON_WEIGHT[a.reason] || age(b) - age(a) || (a.business_name ?? '').localeCompare(b.business_name ?? '', 'en-GB')
}

export function splitDoNow(items: TodayItem[], today: string): { doNow: TodayItem[]; rest: TodayItem[] } {
  const doNow = items.filter((i) => isDoNow(i, today)).sort((a, b) => pressingOrder(a, b, today)).slice(0, DO_NOW_LIMIT)
  const chosen = new Set(doNow.map((i) => i.key))
  return { doNow, rest: items.filter((i) => !chosen.has(i.key)) }
}

/** Plain words for how old an item is. */
export function ageWords(item: TodayItem, today: string): string {
  const age = daysFrom(item.since, today)
  if (age === null) return 'no date'
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
  switch (item.reason) {
    case 'money_owed':
      return age > 0 ? `${days(age)} overdue` : 'due today'
    case 'renewal':
      return age > 0 ? `ended ${days(age)} ago` : age === 0 ? 'ends today' : `ends in ${days(-age)}`
    case 'waiting_on_you':
      return age === 0 ? 'waiting since today' : `waiting ${days(age)}`
    case 'todo':
      return age > 0 ? `${days(age)} overdue` : age === 0 ? 'due today' : `due in ${days(-age)}`
  }
}

/**
 * Task-engine tasks the app no longer shows (Stage 7): replies, renewals and
 * invoices are worked out by v_business_attention instead. The engine keeps
 * running for the desk email and the routines. Hand-written to-dos, check-ins,
 * stats and editorial still show.
 */
export const HIDDEN_ENGINE_KINDS = [
  'reply', 'unanswered', 'renewal_due', 'renewal_lapsed', 'unrecorded_renewal',
  'invoice_overdue', 'invoice_due_soon', 'corr_flagged', 'auto_business', 'routine_missed', 'commitment',
]

export function isHiddenEngineTask(t: { source?: string | null; signal_key?: string | null }): boolean {
  if (t.source === 'contract_renewal') return true
  if (t.source !== 'signal') return false
  return HIDDEN_ENGINE_KINDS.includes((t.signal_key ?? '').split(':')[0])
}
