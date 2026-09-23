/**
 * The morning desk email, built straight from the database. No AI.
 *
 * Replaces step 8 of the old daily desk routine, which had a Claude session
 * compose this same email from the same views every morning. The routine now
 * does only the work that needs judgement (mail sweep, intent, hand-written
 * tasks); everything here is a read of v_morning_desk and friends.
 */

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
  missedRoutines: string[]
  pipeline: Record<string, unknown> | null
  drafts?: DraftItem[]
  skippedCount?: number
  /** Anything that ought to be chased but is on no list. */
  gaps?: CareGap[]
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
  const { now, lines, brief, health, closed, missedRoutines, pipeline, drafts = [], skippedCount = 0, gaps = [] } = input

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

  add(pick(lines, 0, 15))                 // Your own list
  add(pick(lines, 3, 10))                 // You said you would
  add(pick(lines, 1, 15))                 // Waiting on you
  add(pick(lines, 2, 15))                 // Money
  add(pick(lines, 4, 10))                 // Due today or overdue
  add(pick(lines, 5, 15))                 // Renewals in the next 30 days
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

  // Opening line
  const opening = `${money(brief?.receivables_total)} is owed across ${brief?.businesses_owing ?? 0} businesses, ` +
    `and ${brief?.awaiting_reply ?? 0} people are waiting on a reply from you.`

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
  for (const r of missedRoutines) warnings.push(`the ${r} routine did not finish`)

  const footer = health_bits.length ? health_bits.join('; ') + '.' : ''
  const warn = warnings.length ? `Needs looking at: ${warnings.join('; ')}.` : ''

  const html = [
    `<p>${esc(opening)}</p>`,
    ...sections.map(s =>
      `<p><strong>${esc(s.heading)}</strong></p><ul>${s.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`),
    footer ? `<p style="color:#555">${esc(footer)}</p>` : '',
    warn ? `<p style="color:#9a3412">${esc(warn)}</p>` : '',
    `<p style="color:#888;font-size:12px">Built from Correspondence Clerk at ${esc(now.toISOString().slice(0, 16).replace('T', ' '))} UTC. <a href="https://correspondenceclerk.com/todos">Open the app</a></p>`,
  ].join('\n')

  const text = [
    opening,
    ...sections.map(s => `\n${s.heading}\n${s.items.map(i => `- ${i}`).join('\n')}`),
    footer ? `\n${footer}` : '',
    warn ? `\n${warn}` : '',
  ].join('\n')

  return { subject: deskSubject(now), html, text }
}
