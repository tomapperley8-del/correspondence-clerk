'use client'

// Outreach "Work on next" (UI overhaul Stage 16c2, regrouped in 16c3 layout A): the open
// pipeline in groups by what to do, in the order v_outreach_next gives (the outreach routine
// reads the same view). One group shows at a time, chosen from the tabs, so the page stays
// short. Every row says why it is there and has three ways off the list, each with Undo:
// Not now (hidden for a while, outreach_snoozes), Not interested (closed, with a backup) and
// Take off outreach (the pipeline's own removal).
// Stage 11c (layout C) adds a switch on the card: The pipeline, Win back, Fill a category.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn, formatDateGB } from '@/lib/utils'
import type { TableContact } from '@/app/actions/business-table'
import type { FitPoints, OutreachBucket, OutreachNextRow, OutreachSnooze } from '@/app/actions/outreach-next'
import {
  closeOutreachBusinesses, endOutreachSnooze, restoreOutreachSnooze, snoozeOutreachBusiness, undoCloseOutreachBusinesses,
} from '@/app/actions/outreach-next'
import { removeBusinessFromOutreach, undoRemoveFromOutreach, updateOutreachStage } from '@/app/actions/businesses'
import { ActionMenu, type MenuEntry } from '@/components/ui/action-menu'
import { OUTREACH_STAGES, PILL, type Tone } from '@/app/businesses/_components/MastersheetTable'
import type { OutreachWinbacks } from '@/app/actions/outreach-winbacks'
import { WinBacks } from './WinBacks'
import { useFold } from '@/components/ui/fold-section'
import { bandClass, bandStyle } from '@/components/ui/kind'

/** Stage 14c: long lists scroll inside the box, so the page ends at the screen. */
const SCROLL = 'max-h-[45vh] overflow-y-auto overscroll-contain'

const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`
const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'
const linkBtn = 'text-sm font-semibold text-brand-navy hover:underline min-h-10 md:min-h-0 inline-flex items-center'
/** A button in the header band (white, house style). */
const bandBtn = 'text-xs font-semibold rounded-sm px-2.5 min-h-10 md:min-h-8 inline-flex items-center transition-colors duration-200 ease-out'

const stageLabel = (key: string) => OUTREACH_STAGES.find((s) => s.key === key)?.label ?? key
const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')

type Group = { key: OutreachBucket; title: string; tone: Tone; hint: string }

const REPLY: Group = { key: 'reply', title: 'Reply', tone: 'red', hint: 'They wrote last, in the past 60 days, and you haven\'t answered.' }
const CHASE: Group = { key: 'chase', title: 'Chase', tone: 'orange', hint: 'In discussion, you wrote last 14 to 90 days ago.' }
const FOLLOW: Group = { key: 'follow_up', title: 'Follow up once', tone: 'blue', hint: 'Contacted 10 to 60 days ago with no reply. 23 of 47 businesses followed up so far replied after the follow-up.' }
const CLOSE: Group = { key: 'close', title: 'Close?', tone: 'muted', hint: 'Followed up 30 or more days ago and still no reply.' }
const NEW: Group = { key: 'new', title: 'New: best fit first', tone: 'green', hint: 'Identified, with an email address on file. The points come from which businesses have replied before.' }
const FIND: Group = { key: 'find_contact', title: 'No email address yet', tone: 'muted', hint: 'Identified businesses with no email on file, best fit first. The business page is where to add a contact.' }
const SNOOZED: Group = { key: 'snoozed', title: 'Not now', tone: 'muted', hint: 'Hidden for a while. Each comes back by itself on its date, or sooner if they email you.' }
const TIDY: Group[] = [
  { key: 'tidy_wrote', title: 'They wrote over 60 days ago', tone: 'muted', hint: 'Their last email went unanswered for more than two months.' },
  { key: 'tidy_discussion', title: 'In discussion, quiet over 90 days', tone: 'muted', hint: 'You wrote last, more than three months ago.' },
  { key: 'tidy_contacted', title: 'Contacted over 60 days ago, no reply', tone: 'muted', hint: 'Never replied. Most of these were the November 2025 send.' },
]

type TabKey = 'reply' | 'chase' | 'follow_up' | 'close' | 'new' | 'find_contact' | 'tidy' | 'snoozed'
const TABS: { key: TabKey; label: string; groups: Group[] }[] = [
  { key: 'reply', label: 'Reply', groups: [REPLY] },
  { key: 'chase', label: 'Chase', groups: [CHASE] },
  { key: 'follow_up', label: 'Follow up', groups: [FOLLOW] },
  { key: 'close', label: 'Close?', groups: [CLOSE] },
  { key: 'new', label: 'New', groups: [NEW] },
  { key: 'find_contact', label: 'No email yet', groups: [FIND] },
  { key: 'tidy', label: 'Tidy up', groups: TIDY },
  { key: 'snoozed', label: 'Not now', groups: [SNOOZED] },
]

const FIRST = 10
const SNOOZE_CHOICES: [number, string][] = [[7, '1 week'], [14, '2 weeks'], [30, '1 month'], [91, '3 months']]

const POINT_LABELS: [keyof FitPoints, string][] = [
  ['named_contact', 'Named contact with email'],
  ['wrote_before', 'Has written to us'],
  ['in_news', 'In our news'],
  ['had_deal', 'Former member or advertiser'],
  ['category', 'Category'],
]

function ago(days: number | null) {
  if (days == null) return 'a while ago'
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function addDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function why(r: OutreachNextRow): string {
  const stage = stageLabel(r.outreach_stage)
  switch (r.bucket) {
    case 'reply':
    case 'tidy_wrote':
      return `They emailed ${ago(r.days_quiet)} and you haven't replied. ${stage}.`
    case 'chase':
    case 'tidy_discussion':
      return `You emailed ${ago(r.days_quiet)}, no answer yet. ${stage}.`
    case 'follow_up':
    case 'tidy_contacted':
      return `You wrote ${ago(r.days_quiet)} and they haven't replied. ${stage}.`
    case 'close':
      return `Followed up ${ago(r.days_quiet)}, no reply.`
    case 'snoozed':
      return `Not now, back on ${dateGB(r.snoozed_until)}. ${stage}${r.days_quiet != null ? `, last email ${ago(r.days_quiet)}` : ''}.`
    case 'new':
    case 'find_contact':
      return [r.category, r.points.had_deal ? 'Former member or advertiser' : null, r.points.named_contact ? 'Named contact with email' : null]
        .filter(Boolean).join('. ') || 'Identified.'
    default:
      return stage
  }
}

function pillText(r: OutreachNextRow) {
  if (r.bucket === 'new' || r.bucket === 'find_contact') return `${r.fit_score} pts`
  if (r.bucket === 'snoozed') return 'Not now'
  if (r.days_quiet == null) return 'No date'
  return r.days_quiet === 1 ? '1 day' : `${r.days_quiet} days`
}

export function PointChips({ points, score }: { points: FitPoints; score: number }) {
  const parts = POINT_LABELS.filter(([k]) => points[k] !== 0)
  return (
    <span className="flex flex-wrap gap-1 mt-1" aria-label={`Fit score ${score}`}>
      {parts.map(([k, label]) => (
        <span key={k} className="text-xs px-1.5 py-px rounded-sm border border-black/[0.08] bg-brand-warm text-gray-700">
          {label} <b className={points[k] < 0 ? 'text-ms-red-text' : 'text-brand-navy'}>{points[k] > 0 ? `+${points[k]}` : points[k]}</b>
        </span>
      ))}
      {parts.length === 0 && <span className="text-xs text-gray-600">No signals yet</span>}
    </span>
  )
}

type Mode = 'pipeline' | 'winback' | 'gaps'

export function WorkOnNext({ rows, contacts, extra }: { rows: OutreachNextRow[]; contacts: Map<string, TableContact | null>; extra?: OutreachWinbacks | null }) {
  const [mode, setMode] = useState<Mode>('pipeline')
  const router = useRouter()
  // Rows taken off here, as "business:group", so a row that moves to another group (Not now) shows there.
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, number>>({})
  const [confirmBulk, setConfirmBulk] = useState<OutreachBucket | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  // Stage 14c: open on a computer, folded on a phone; the rows scroll inside.
  const [open, toggle] = useFold('outreach.next', true, false)
  const [picked, setPicked] = useState<TabKey | null>(null)

  const byBucket = useMemo(() => {
    const m = new Map<OutreachBucket, OutreachNextRow[]>()
    for (const r of rows) {
      if (hidden.has(`${r.business_id}:${r.bucket}`)) continue
      const list = m.get(r.bucket) ?? []
      list.push(r)
      m.set(r.bucket, list)
    }
    return m
  }, [rows, hidden])
  const count = (k: OutreachBucket) => byBucket.get(k)?.length ?? 0
  const tabCount = (t: (typeof TABS)[number]) => t.groups.reduce((n, g) => n + count(g.key), 0)
  // Open on the first group with something in it, Reply first.
  const tab = picked ?? TABS.find((t) => t.key !== 'snoozed' && tabCount(t) > 0)?.key ?? 'new'
  const current = TABS.find((t) => t.key === tab)!

  const bucketOf = useMemo(() => new Map(rows.map((r) => [r.business_id, r.bucket])), [rows])
  const keysOf = (ids: string[]) => ids.map((id) => `${id}:${bucketOf.get(id)}`)
  const hide = (keys: string[], on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev)
      for (const k of keys) if (on) next.add(k); else next.delete(k)
      return next
    })

  const putBack = (keys: string[]) => {
    hide(keys, false)
    toast.success('Put back')
    router.refresh()
  }

  async function close(ids: string[], label: string) {
    setBusy(ids.length === 1 ? ids[0] : 'bulk')
    const keys = keysOf(ids)
    hide(keys, true)
    const result = await closeOutreachBusinesses(ids)
    setBusy(null)
    setConfirmBulk(null)
    if (result.error || !result.batch) {
      hide(keys, false)
      if (result.error) toast.error(result.error)
      return
    }
    const batch = result.batch
    toast.undo(`${label}: Not interested`, async () => {
      const undo = await undoCloseOutreachBusinesses(batch)
      if (undo.error) toast.error(undo.error)
      else putBack(keys)
    })
    router.refresh()
  }

  async function takeOff(r: OutreachNextRow) {
    setBusy(r.business_id)
    const keys = keysOf([r.business_id])
    hide(keys, true)
    const result = await removeBusinessFromOutreach(r.business_id)
    setBusy(null)
    if (result.error || result.backupId === undefined) {
      hide(keys, false)
      toast.error(result.error ?? 'Not taken off outreach')
      return
    }
    const backupId = result.backupId
    toast.undo(`${r.name} taken off outreach`, async () => {
      const undo = await undoRemoveFromOutreach(backupId)
      if (undo.error) toast.error(undo.error)
      else putBack(keys)
    })
    router.refresh()
  }

  async function snooze(r: OutreachNextRow, days: number) {
    setBusy(r.business_id)
    const keys = keysOf([r.business_id])
    hide(keys, true)
    const result = await snoozeOutreachBusiness(r.business_id, days)
    setBusy(null)
    if (result.error || !result.until) {
      hide(keys, false)
      toast.error(result.error ?? 'Not hidden')
      return
    }
    const previous: OutreachSnooze = result.previous ?? null
    toast.undo(`${r.name}: not now, back on ${dateGB(result.until)}`, async () => {
      const undo = await restoreOutreachSnooze(r.business_id, previous)
      if (undo.error) toast.error(undo.error)
      else putBack(keys)
    })
    router.refresh()
  }

  async function bringBack(r: OutreachNextRow) {
    setBusy(r.business_id)
    const keys = keysOf([r.business_id])
    hide(keys, true)
    const result = await endOutreachSnooze(r.business_id)
    setBusy(null)
    if (result.error) {
      hide(keys, false)
      toast.error(result.error)
      return
    }
    const previous: OutreachSnooze = result.previous ?? null
    toast.undo(`${r.name} back on the list`, async () => {
      const undo = await restoreOutreachSnooze(r.business_id, previous)
      if (undo.error) toast.error(undo.error)
      else putBack(keys)
    })
    router.refresh()
  }

  async function move(r: OutreachNextRow, stage: string) {
    setBusy(r.business_id)
    const keys = keysOf([r.business_id])
    hide(keys, true)
    const result = await updateOutreachStage(r.business_id, stage)
    setBusy(null)
    if (result.error) {
      hide(keys, false)
      toast.error(result.error)
      return
    }
    toast.undo(`${r.name}: ${stageLabel(stage)}`, async () => {
      const undo = await updateOutreachStage(r.business_id, r.outreach_stage)
      if (undo.error) toast.error(undo.error)
      else putBack(keys)
    })
    router.refresh()
  }

  function renderRow(r: OutreachNextRow, g: Group) {
    const c = contacts.get(r.business_id) ?? null
    const email = c?.email ?? null
    const who = c && !c.is_placeholder ? c.name : null
    const isNew = r.bucket === 'new' || r.bucket === 'find_contact'
    const closing = r.bucket === 'close' || r.bucket.startsWith('tidy')
    const off: MenuEntry[] = [
      { label: 'Business page', href: `/businesses/${r.business_id}` },
      ...(r.bucket === 'snoozed'
        ? []
        : [{ group: 'Not now (back sooner if they email)', items: SNOOZE_CHOICES.map(([days, label]) => ({ label: `${label}, back on ${dateGB(addDays(days))}`, onSelect: () => snooze(r, days) })) }]),
      ...(closing ? [] : [{ label: 'Not interested', hint: 'Close it: the stage becomes Not interested', onSelect: () => close([r.business_id], r.name) }]),
      { label: 'Take off outreach', hint: 'No stage at all; the business and its emails stay', onSelect: () => takeOff(r) },
    ]
    return (
      <li key={r.business_id} className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 items-center px-3 py-2 hover:bg-brand-warm transition-colors duration-200 ease-out">
        <span className={cn('self-start sm:self-center justify-self-start text-xs font-bold px-2 py-0.5 rounded-sm whitespace-nowrap tabular-nums', PILL[g.tone])}>
          {pillText(r)}
        </span>
        <div className="min-w-0">
          <Link href={`/businesses/${r.business_id}`} className="font-semibold text-brand-dark hover:underline break-words">{r.name}</Link>
          <p className="text-xs text-gray-600">
            {why(r)}
            {who && !isNew && <> Main contact: {who}{c?.role ? ` (${c.role})` : ''}.</>}
            {r.draft_ready && <> The outreach routine has a draft ready in Outlook.</>}
          </p>
          {isNew && <PointChips points={r.points} score={r.fit_score} />}
        </div>
        <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-1.5 sm:justify-end">
          {r.bucket === 'snoozed' ? (
            <button type="button" className={mainBtn} disabled={busy === r.business_id} onClick={() => bringBack(r)}>Bring back</button>
          ) : r.bucket === 'reply' || r.bucket === 'tidy_wrote' ? (
            <Link href={`/businesses/${r.business_id}`} className={mainBtn}>Open their email</Link>
          ) : email ? (
            <a href={`mailto:${email}`} className={closing ? softBtn : mainBtn}>Email {who ?? email}</a>
          ) : (
            <Link href={`/businesses/${r.business_id}`} className={softBtn}>Find a contact</Link>
          )}
          {r.bucket === 'new' && (
            <button type="button" className={softBtn} disabled={busy === r.business_id} onClick={() => move(r, 'contacted')}>Mark contacted</button>
          )}
          {r.bucket === 'follow_up' && (
            <button type="button" className={softBtn} disabled={busy === r.business_id} onClick={() => move(r, 'followed_up')}>Mark followed up</button>
          )}
          {(r.bucket === 'reply' || r.bucket === 'chase') && (
            <Link href={`/new-entry?businessId=${r.business_id}`} className={softBtn}>Log</Link>
          )}
          {closing && (
            <button type="button" className={softBtn} disabled={busy === r.business_id} onClick={() => close([r.business_id], r.name)}>Not interested</button>
          )}
          <ActionMenu
            label="Remove"
            accessibleLabel={`Remove ${r.name} from this list`}
            className="border border-black/[0.12] bg-white text-sm text-brand-dark px-3 md:min-h-9"
            entries={off}
          />
        </div>
      </li>
    )
  }

  function renderGroup(g: Group, sub: boolean) {
    const list = byBucket.get(g.key) ?? []
    if (sub && list.length === 0) return null
    const limit = shown[g.key] ?? (sub ? FIRST / 2 : FIRST)
    const bulk = g.key.startsWith('tidy')
    return (
      <div key={g.key} className={cn(sub && 'border-t border-black/[0.08]')}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5 pb-1">
          <p className="text-xs text-gray-600 min-w-0 flex-1">
            {sub && <b className="text-sm text-brand-dark mr-1">{g.title} <span className="tabular-nums">({list.length})</span>.</b>}
            {g.hint}
          </p>
          {bulk && (confirmBulk === g.key ? (
            <span className="flex flex-wrap items-center gap-1.5 text-sm">
              <span>Mark all {list.length} Not interested?</span>
              <button type="button" className={mainBtn} disabled={busy === 'bulk'} onClick={() => close(list.map((r) => r.business_id), `${list.length} businesses`)}>Yes, mark all</button>
              <button type="button" className={softBtn} onClick={() => setConfirmBulk(null)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className={softBtn} onClick={() => setConfirmBulk(g.key)}>Mark all {list.length} Not interested</button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-gray-600">Nothing here right now.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {list.slice(0, limit).map((r) => renderRow(r, g))}
          </ul>
        )}
        {list.length > limit && (
          <div className="px-3 py-1.5 border-t border-black/[0.06]">
            <button type="button" className={linkBtn} onClick={() => setShown((s) => ({ ...s, [g.key]: limit + FIRST * 2 }))}>
              Show {Math.min(list.length - limit, FIRST * 2)} more of {list.length - limit}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section id="work-on-next" aria-labelledby="work-on-next-heading" className={cn(card, 'scroll-mt-4 min-w-0')}>
      <div className={cn('cc-band-controls flex flex-wrap items-center justify-between gap-2 px-3 py-1 rounded-t-sm', bandClass('outreach'), !open && 'rounded-b-sm')} style={bandStyle('outreach')}>
        <h2 id="work-on-next-heading" className="text-[1.35rem] leading-tight font-semibold text-white" style={{ fontFamily: 'var(--font-serif)' }}>
          Work on next
        </h2>
        <button type="button" className={bandBtn} aria-expanded={open} aria-controls="work-on-next-body" onClick={toggle}>
          {open ? 'Hide' : 'Show'}<span className="sr-only"> work on next</span>
        </button>
        {open && extra && (
          <div role="group" aria-label="Show" className="inline-flex border border-black/10 rounded-sm overflow-hidden ml-auto">
            {([
              ['pipeline', 'The pipeline', null],
              ['winback', 'Win back', extra.winbacks.filter((w) => !w.snoozed_until).length],
              ['gaps', 'Fill a category', extra.gaps.filter((g) => g.is_thin).length],
            ] as const).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={cn(
                  'px-3 min-h-10 md:min-h-8 text-sm transition-colors duration-200 ease-out',
                  mode === key ? 'bg-brand-navy text-white' : 'bg-white text-gray-800 hover:bg-brand-warm',
                )}
              >
                {label}
                {n != null && <span className="tabular-nums">{key === 'gaps' ? ` (${n} thin)` : ` (${n})`}</span>}
              </button>
            ))}
          </div>
        )}
        {open && mode === 'pipeline' && (
          <button type="button" className={bandBtn} aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)}>
            {howOpen ? 'Hide how this is ordered' : 'How this is ordered'}
          </button>
        )}
      </div>
      <div id="work-on-next-body" hidden={!open} className="pb-1">
      {mode !== 'pipeline' && extra ? <div className={cn('mt-2', SCROLL)}><WinBacks key={mode} data={extra} mode={mode} /></div> : (<>
      {howOpen && (
        <div className="mx-3 mt-2 p-3 bg-brand-warm rounded-sm text-sm text-gray-700 space-y-1">
          <p>Plain rules on the latest email each way, worked out fresh every time (the outreach routine reads the same list). Replies first, then chases, follow-ups, ones to close, then new businesses by fit score.</p>
          <p>Fit score points, from which of 225 approached businesses replied: named contact with email +3 (33% replied, against 6% without), has written to us before +2 (36% against 12%), in our news +2 (37% against 16%), former member or advertiser +2 (30% against 17%); category Entertainment +2, Activities +1, Food &amp; Drink +1, Retail 0, Services, For Children and Health &amp; Beauty −1. Newsletter mentions and routine drafts made no difference, so they score nothing.</p>
          <p>Remove takes a row off the list: Not now hides it for a while (back on its date, or sooner if they email), Not interested closes it, Take off outreach takes it off the pipeline altogether. Each has Undo.</p>
        </div>
      )}
      <div role="group" aria-label="Show" className="flex flex-wrap gap-x-1 px-1.5 mt-1 border-b border-black/[0.08]">
        {TABS.map((t) => {
          const n = tabCount(t)
          if (t.key === 'snoozed' && n === 0) return null
          const on = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setPicked(t.key); setConfirmBulk(null) }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 min-h-10 text-sm font-semibold border-b-[3px] -mb-px transition-colors duration-200 ease-out',
                on ? 'border-ms-band text-ms-band' : 'border-transparent text-brand-dark hover:bg-brand-warm',
              )}
            >
              {t.label} <span className="tabular-nums font-bold">{n}</span>
            </button>
          )
        })}
      </div>
      <div className={SCROLL}>
      {current.groups.length === 1 ? renderGroup(current.groups[0], false) : current.groups.map((g) => renderGroup(g, true))}
      {current.groups.every((g) => count(g.key) === 0) && current.groups.length > 1 && (
        <p className="px-3 py-3 text-sm text-gray-600">Nothing to tidy up.</p>
      )}
      </div>
      </>)}
      </div>
    </section>
  )
}
