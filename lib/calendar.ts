// Work calendar and newsletter list (UI overhaul Stage 12). Pure date helpers
// shared by the server actions and the Today calendar. Dates are YYYY-MM-DD,
// worked out in UTC so they never drift with the browser's timezone; "today"
// always comes from cc_today() (the London date).

import { addDays } from '@/lib/today'

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)))
  return (d.getUTCDay() + 6) % 7
}

/** The Monday of the week holding `date`. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

export function isWednesday(date: string): boolean {
  return weekdayIndex(date) === 2
}

/** The newsletter goes out every Wednesday: today if it is one, else the next. */
export function nextWednesday(today: string): string {
  return addDays(today, (2 - weekdayIndex(today) + 7) % 7)
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

export function addMonths(date: string, months: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1 + months, 1))
  return d.toISOString().slice(0, 10)
}

/** The Monday-to-Sunday days a month grid shows (whole weeks). */
export function monthGrid(date: string): string[] {
  const first = monthStart(date)
  const start = weekStart(first)
  const end = addDays(weekStart(addDays(addMonths(first, 1), -1)), 6)
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

/** The kinds you can add from the calendar, and the task category each one files under. */
export const CALENDAR_KINDS = [
  { value: 'todo', label: 'To-do', category: 'Task', type: 'task' },
  { value: 'call', label: 'Call', category: 'Call', type: 'call' },
  { value: 'meeting', label: 'Meeting', category: 'Meeting', type: 'event' },
  { value: 'event', label: 'Event', category: 'Event', type: 'event' },
  { value: 'deadline', label: 'Deadline', category: 'Deadline', type: 'task' },
  { value: 'newsletter', label: 'For newsletter', category: 'For Newsletter', type: 'task' },
] as const

export type CalendarKind = (typeof CALENDAR_KINDS)[number]['value']

export const NEWSLETTER_CATEGORY = 'For Newsletter'
