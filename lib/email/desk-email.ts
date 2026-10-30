/**
 * The morning desk email, built straight from the database. No AI.
 *
 * Replaces step 8 of the old daily desk routine, which had a Claude session
 * compose this same email from the same views every morning. The routine now
 * does only the work that needs judgement (mail sweep, intent, hand-written
 * tasks); everything here is a read of v_morning_desk and friends.
 *
 * Stage 11a: the work list (overdue, money owed, renewals, waiting on you,
 * to-dos, Club Card pages) comes from the same loader and rules as the Today
 * page (lib/today-source.ts, lib/today.ts), so the two always agree. Only the
 * sections Today doesn't hold (editorial, new businesses, story leads) still
 * come from v_morning_desk.
 */

import { ageWords, REASON_LABEL, overdueItems, type TodayItem, type TodayReason } from '@/lib/today'
import type { SystemMiss } from '@/lib/today-source'
import type { MentionRow } from '@/lib/newsletter/due'

export interface DeskLine {
  section: number
  heading: string
  sort: number
  line: string
  is_priority: boolean
}

export interface DeskBrief {
  receivables_total: number | null
  businesses_owing: number | null
  awaiting_reply: number | null
}

export interface DeskHealth {
  receivables_total: number | null
  quickbooks_hours_old: number | null
  mail_swept_at: string | null
  mail_seen_24h: number | null
  mail_backfilled_24h: number | null
  engine_ran_at: string | null
  engine_last_opened: number | null
  engine_last_closed: number | null
  news_leads_new: number | null
  quickbooks_unlinked: number | null
}

export interface ClosedItem {
  title: string
  summary: string
  hand_written: boolean
}

export interface DraftItem {
  kind: string
  business: string
  recipient: string | null
  reason: string | null
  /** How many times this draft has been lifted back to the top of Outlook Drafts. */
  bumps?: number
}

export interface CareGap {
  severity: number
  gap: string
  detail: string
}

export interface DeskEmailInput {
  now: Date
  lines: DeskLine[]
  brief: DeskBrief | null
  health: DeskHealth | null
  closed: ClosedItem[]
  /** Stage 18: jobs and routines that missed (system_alarm()); the email opens with them. */
  system?: SystemMiss[]
  pipeline: Record<string, unknown> | null
  drafts?: DraftItem[]
  skippedCount?: number
  /** Anything that ought to be chased but is on no list. */
  gaps?: CareGap[]
  /** Today's items (lib/today-source.ts) and the London date they were judged on. */
  today: { date: string; items: TodayItem[] }
  /** Stage 18: the tabs' own lists, read from the same sources as the tabs. */
  tabs?: DeskTabs
}

export interface OutreachNextLine { name: string; bucket: string; days_quiet: number | null; draft_ready: boolean }

export interface DeskTabs {
  /** v_outreach_next, Work on next order, the action buckets only (Outreach tab). */
  workOnNext: OutreachNextLine[]
  workOnNextCounts: Record<string, number>
  /** Due a mention before the coming Wednesday (lib/newsletter/due.ts, Newsletter tab). */
  dueMention: { wednesday: string; rows: MentionRow[] }
  /** Club Card members whose offer looks out of date (v_club_card_members 'offer_old', Club Card tab). */
  offersToCheck: { name: string; offer: string | null }[]
  /** Things to fix on Data health (v_data_health_counts, the same count as its links). */
  dataHealth: number
}

/** Outreach buckets in Work on next order, as the Outreach tab names them. */
export const WORK_ON_NEXT_BUCKETS: { bucket: string; label: string }[] = [
  { bucket: 'reply', label: 'Reply' },
  { bucket: 'chase', label: 'Chase' },
  { bucket: 'follow_up', label: 'Follow up once' },
  { bucket: 'close', label: 'Close?' },
  { bucket: 'new', label: 'New' },
]

const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00Z`))

/** Stage 18 sections from the tabs: Work on next, due a mention, offers to check. */
export function tabSections(tabs: DeskTabs, limit = 6): Section[] {
  const out: Section[] = []
  const label = new Map(WORK_ON_NEXT_BUCKETS.map((b) => [b.bucket, b.label]))
  if (tabs.workOnNext.length > 0) {
    const counts = WORK_ON_NEXT_BUCKETS.filter((b) => tabs.workOnNextCounts[b.bucket])
      .map((b) => `${tabs.workOnNextCounts[b.bucket]} ${b.label.toLowerCase().replace('?', '')}`)
    out.push({
      heading: `Work on next (${counts.join(', ')})`,
      items: tabs.workOnNext.slice(0, limit).map((r) =>
        `${label.get(r.bucket) ?? r.bucket}: ${r.name}${r.days_quiet !== null ? ` (quiet ${r.days_quiet} days)` : ''}${r.draft_ready ? ', draft ready' : ''}`),
    })
  }
  if (tabs.dueMention.rows.length > 0) {
    const rows = tabs.dueMention.rows
    const items = rows.slice(0, limit).map((r) =>
      `${r.name} (${r.deal === 'advertiser' ? 'advertiser' : 'Club Card'}): ${r.last_in ? `last in ${r.days} days ago` : 'not in since joining'}`)
    if (rows.length > limit) items.push(`and ${rows.length - limit} more on the Newsletter tab`)
    out.push({ heading: `Due a newsletter mention before ${dayMonth(tabs.dueMention.wednesday)} (${rows.length})`, items })
  }
  if (tabs.offersToCheck.length > 0) {
    out.push({
      heading: `Club Card offers to check (${tabs.offersToCheck.length})`,
      items: tabs.offersToCheck.map((o) => `${o.name}: offer looks out of date${o.offer ? ` ("${o.offer.slice(0, 80)}")` : ''}`),
    })
  }
  return out
}

// Today's groups, in Today's order and with its titles (app/today/_components/TodayClient.tsx).
const TODAY_GROUPS: { reason: TodayReason; title: string }[] = [
  { reason: 'money_owed', title: 'Money owed' },
  { reason: 'renewal', title: 'Renewals' },
  { reason: 'club_card_lapsed', title: 'Club Card ended, page still live' },
  { reason: 'waiting_on_you', title: 'Waiting on you' },
  { reason: 'todo', title: 'Your to-dos' },
  { reason: 'club_card', title: 'Club Card pages' },
]

const itemLine = (i: TodayItem, date: string) =>
  `${i.business_name ? `${i.business_name}: ` : ''}${i.detail} (${ageWords(i, date)})`

/**
 * Overdue, then the groups, as Today lists them (Stage 14a v2). Overdue is the
 * nav badge's rule with no cap, so it is never cut short; the groups hold the
 * rest and show `limit` lines each.
 */
export function todaySections(date: string, items: TodayItem[], limit = 15): Section[] {
  const overdue = overdueItems(items, date)
  const chosen = new Set(overdue.map((i) => i.key))
  const rest = items.filter((i) => !chosen.has(i.key))
  const out: Section[] = []
  if (overdue.length > 0) {
    out.push({
      heading: `Overdue (${overdue.length})`,
      items: overdue.map((i) => `${REASON_LABEL[i.reason]}. ${itemLine(i, date)}`),
    })
  }
  for (const g of TODAY_GROUPS) {
    const rows = rest.filter((i) => i.reason === g.reason)
    if (rows.length === 0) continue
    const lines = rows.slice(0, limit).map((i) => itemLine(i, date))
    if (rows.length > limit) lines.push(`and ${rows.length - limit} more in the app`)
    out.push({ heading: `${g.title} (${rows.length})`, items: lines })
  }
  return out
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (n: number | null | undefined) =>
  '£' + Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const hoursSince = (iso: string | null, now: Date) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : Infinity

export function deskSubject(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `Desk: ${get('weekday')} ${get('day')} ${get('month').slice(0, 3)}`
}

interface Section { heading: string; items: string[] }

function pick(lines: DeskLine[], section: number, limit: number, lead?: string): Section | null {
  const rows = lines
    .filter(l => l.section === section)
    .sort((a, b) => Number(b.is_priority) - Number(a.is_priority) || a.sort - b.sort)
  if (rows.length === 0) return null
  const items = rows.slice(0, limit).map(r => r.line)
  if (rows.length > limit) items.push(`and ${rows.length - limit} more in the app`)
  const heading = rows[0].heading
  return { heading: lead ? `${heading} (${lead.replace('{n}', String(rows.length))})` : heading, items }
}

export function buildDeskEmail(input: DeskEmailInput): { subject: string; html: string; text: string } {
  const { now, lines, brief, health, closed, system = [], pipeline, drafts = [], skippedCount = 0, gaps = [], today, tabs } = input

  const sections: Section[] = []
  const add = (s: Section | null) => { if (s) sections.push(s) }

  // Drafts the routines wrote since yesterday. First, because they are ready to send.
  if (drafts.length > 0) {
    const label: Record<string, string> = {
      renewal: 'Renewal', overdue: 'Payment chaser', checkin: 'Check-in', outreach: 'New business',
    }
    const items = drafts.map(d => {
      const waiting = (d.bumps ?? 0) > 0
        ? ` Still waiting from ${d.bumps === 1 ? 'yesterday' : `${d.bumps} days ago`}, moved back to the top.`
        : ''
      return `${label[d.kind] ?? d.kind}: ${d.business}${d.recipient ? ` (to ${d.recipient})` : ''}${d.reason ? `. ${d.reason}` : ''}${waiting}`
    })
    if (skippedCount > 0) items.push(`${skippedCount} more considered and held back, for reasons like a recent conversation`)
    sections.push({ heading: `Drafts waiting in your Outlook (${drafts.length})`, items })
  }

  // The work list, the same as Today. Replaces v_morning_desk sections 0-5
  // (your own list, you said you would, waiting on you, money, due today,
  // renewals), which were worked out separately and could disagree with Today.
  sections.push(...todaySections(today.date, today.items))
  if (tabs) sections.push(...tabSections(tabs))
  add(pick(lines, 6, 6, '{n} arrived'))   // Editorial arrivals
  add(pick(lines, 7, 10))                 // New businesses worth approaching
  add(pick(lines, 8, 8))                  // Story leads

  // The safety net: things no routine will pick up on its own.
  if (gaps.length > 0) {
    const byGap = new Map<string, string[]>()
    for (const g of gaps) {
      if (!byGap.has(g.gap)) byGap.set(g.gap, [])
      byGap.get(g.gap)!.push(g.detail)
    }
    sections.push({
      heading: `Nothing should be slipping (${gaps.length})`,
      items: [...byGap.entries()].map(([gap, details]) =>
        `${gap}: ${details.slice(0, 6).join('; ')}${details.length > 6 ? ` and ${details.length - 6} more` : ''}`),
    })
  }

  if (closed.length > 0) {
    sections.push({
      heading: 'Closed for you since yesterday',
      items: closed.map(c => `${c.title}${c.hand_written ? ' (your own)' : ''}: ${c.summary}`),
    })
  }

  // Opening line: Today's numbers
  const count = (r: TodayReason) => today.items.filter((i) => i.reason === r).length
  const overdueCount = overdueItems(today.items, today.date).length
  const opening = `${overdueCount} thing${overdueCount === 1 ? '' : 's'} overdue. ` +
    `${money(brief?.receivables_total)} is owed across ${brief?.businesses_owing ?? 0} businesses; ` +
    `${count('waiting_on_you')} waiting on a reply from you, ${count('renewal')} renewals and ${count('todo')} to-dos.` +
    (tabs && tabs.dataHealth > 0 ? ` Data health has ${tabs.dataHealth} thing${tabs.dataHealth === 1 ? '' : 's'} to fix.` : '')

  // Stage 18: the System line, first, and only when a job or routine missed
  const systemLine = system.length > 0
    ? `System: ${system.map((m) => m.line).join('; ')}. Lists that depend on it may be short until it runs.`
    : ''

  // Closing line: system health in plain words
  const health_bits: string[] = []
  if (health) {
    health_bits.push(`QuickBooks figures are ${Math.round(Number(health.quickbooks_hours_old ?? 0))} hours old`)
    health_bits.push(`${health.mail_seen_24h ?? 0} emails were swept in the last day and ${health.mail_backfilled_24h ?? 0} added to Correspondence Clerk`)
    health_bits.push(`the task engine opened ${health.engine_last_opened ?? 0} and closed ${health.engine_last_closed ?? 0}`)
  }
  const autoClosed = Number((pipeline as { auto_closed?: number } | null)?.auto_closed ?? 0)
  if (autoClosed > 0) health_bits.push(`${autoClosed} tasks were closed automatically this morning`)

  const warnings: string[] = []
  if (health) {
    if (Number(health.quickbooks_hours_old ?? 999) > 36) warnings.push('the QuickBooks figures are over 36 hours old')
    if (hoursSince(health.mail_swept_at, now) > 72) warnings.push('the mailboxes have not been swept for three days')
    if (hoursSince(health.engine_ran_at, now) > 48) warnings.push('the task engine has not run for two days')
    if (Number(health.quickbooks_unlinked ?? 0) > 0) warnings.push(`${health.quickbooks_unlinked} QuickBooks customer is not matched to a business`)
  }

  const footer = health_bits.length ? health_bits.join('; ') + '.' : ''
  const warn = warnings.length ? `Needs looking at: ${warnings.join('; ')}.` : ''

  const html = [
    systemLine ? `<p style="color:#9B1C1C"><strong>${esc(systemLine)}</strong></p>` : '',
    `<p>${esc(opening)}</p>`,
    ...sections.map(s =>
      `<p><strong>${esc(s.heading)}</strong></p><ul>${s.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`),
    footer ? `<p style="color:#555">${esc(footer)}</p>` : '',
    warn ? `<p style="color:#9a3412">${esc(warn)}</p>` : '',
    `<p style="color:#888;font-size:12px">Built from Correspondence Clerk at ${esc(now.toISOString().slice(0, 16).replace('T', ' '))} UTC. <a href="https://correspondenceclerk.com/today">Open the app</a></p>`,
  ].join('\n')

  const text = [
    ...(systemLine ? [systemLine, ''] : []),
    opening,
    ...sections.map(s => `\n${s.heading}\n${s.items.map(i => `- ${i}`).join('\n')}`),
    footer ? `\n${footer}` : '',
    warn ? `\n${warn}` : '',
  ].join('\n')

  return { subject: system.length > 0 ? `${deskSubject(now)} (system: something missed)` : deskSubject(now), html, text }
}
