'use client'

// Outreach "Work on next" (UI overhaul Stage 16c2, layout A): the open pipeline in groups by
// what to do, in the order v_outreach_next gives (the outreach routine reads the same view).
// Every row says why it is there; the fit score shows its points. Closing writes the stage
// only, with a backup so Undo puts it back.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { TableContact } from '@/app/actions/business-table'
import type { FitPoints, OutreachBucket, OutreachNextRow } from '@/app/actions/outreach-next'
import { closeOutreachBusinesses, undoCloseOutreachBusinesses } from '@/app/actions/outreach-next'
import { updateOutreachStage } from '@/app/actions/businesses'
import { OUTREACH_STAGES, PILL, type Tone } from '@/app/businesses/_components/MastersheetTable'

const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`
const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'
const linkBtn = 'text-sm font-semibold text-brand-navy hover:underline min-h-10 md:min-h-0 inline-flex items-center'

const stageLabel = (key: string) => OUTREACH_STAGES.find((s) => s.key === key)?.label ?? key

type Group = { key: OutreachBucket; title: string; pill: string; tone: Tone; first: number; hint: string }

const MAIN: Group[] = [
  { key: 'reply', title: 'Reply', pill: 'Reply', tone: 'red', first: 5, hint: 'They wrote last, in the past 60 days, and you haven\'t answered.' },
  { key: 'chase', title: 'Chase', pill: 'Chase', tone: 'orange', first: 5, hint: 'In discussion, you wrote last 14 to 90 days ago.' },
  { key: 'follow_up', title: 'Follow up once', pill: 'Follow up', tone: 'blue', first: 5, hint: 'Contacted 10 to 60 days ago with no reply. 23 of 47 businesses followed up so far replied after the follow-up.' },
  { key: 'close', title: 'Close?', pill: 'Close?', tone: 'muted', first: 5, hint: 'Followed up 30 or more days ago and still no reply. Not interested takes them off the open pipeline (with Undo).' },
  { key: 'new', title: 'New: best fit first', pill: 'New', tone: 'green', first: 8, hint: 'Identified, with an email address on file. The points come from which businesses have replied before.' },
]
const TIDY: Group[] = [
  { key: 'tidy_wrote', title: 'They wrote over 60 days ago', pill: 'Old reply', tone: 'muted', first: 5, hint: 'Their last email went unanswered for more than two months.' },
  { key: 'tidy_discussion', title: 'In discussion, quiet over 90 days', pill: 'Quiet', tone: 'muted', first: 5, hint: 'You wrote last, more than three months ago.' },
  { key: 'tidy_contacted', title: 'Contacted over 60 days ago, no reply', pill: 'Cold', tone: 'muted', first: 5, hint: 'Never replied. Most of these were the November 2025 send.' },
]

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
    case 'new':
    case 'find_contact':
      return [r.category, r.points.had_deal ? 'Former member or advertiser' : null, r.points.named_contact ? 'Named contact with email' : null]
        .filter(Boolean).join('. ') || 'Identified.'
    default:
      return stage
  }
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

export function WorkOnNext({ rows, contacts }: { rows: OutreachNextRow[]; contacts: Map<string, TableContact | null> }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, number>>({})
  const [confirmBulk, setConfirmBulk] = useState<OutreachBucket | null>(null)
  const [tidyOpen, setTidyOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  const byBucket = useMemo(() => {
    const m = new Map<OutreachBucket, OutreachNextRow[]>()
    for (const r of rows) {
      if (hidden.has(r.business_id)) continue
      const list = m.get(r.bucket) ?? []
      list.push(r)
      m.set(r.bucket, list)
    }
    return m
  }, [rows, hidden])
  const count = (k: OutreachBucket) => byBucket.get(k)?.length ?? 0
  const tidyTotal = TIDY.reduce((n, g) => n + count(g.key), 0)

  const hide = (ids: string[], on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev)
      for (const id of ids) if (on) next.add(id); else next.delete(id)
      return next
    })

  async function close(ids: string[], label: string) {
    setBusy(ids.length === 1 ? ids[0] : 'bulk')
    hide(ids, true)
    const result = await closeOutreachBusinesses(ids)
    setBusy(null)
    setConfirmBulk(null)
    if (result.error || !result.batch) {
      hide(ids, false)
      if (result.error) toast.error(result.error)
      return
    }
    const batch = result.batch
    toast.undo(`${label}: Not interested`, async () => {
      const undo = await undoCloseOutreachBusinesses(batch)
      if (undo.error) toast.error(undo.error)
      else {
        hide(ids, false)
        toast.success('Put back')
        router.refresh()
      }
    })
    router.refresh()
  }

  async function move(r: OutreachNextRow, stage: string) {
    setBusy(r.business_id)
    hide([r.business_id], true)
    const result = await updateOutreachStage(r.business_id, stage)
    setBusy(null)
    if (result.error) {
      hide([r.business_id], false)
      toast.error(result.error)
      return
    }
    toast.undo(`${r.name}: ${stageLabel(stage)}`, async () => {
      const undo = await updateOutreachStage(r.business_id, r.outreach_stage)
      if (undo.error) toast.error(undo.error)
      else {
        hide([r.business_id], false)
        toast.success('Put back')
        router.refresh()
      }
    })
    router.refresh()
  }

  function renderRow(r: OutreachNextRow, g: Group) {
    const c = contacts.get(r.business_id) ?? null
    const email = c?.email ?? null
    const who = c && !c.is_placeholder ? c.name : null
    const isNew = r.bucket === 'new' || r.bucket === 'find_contact'
    return (
      <li key={r.business_id} className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start px-3 py-2.5">
        <span className={cn('justify-self-start text-xs font-bold px-2 py-0.5 rounded-sm whitespace-nowrap', PILL[g.tone])}>
          {isNew ? `${r.fit_score} pts` : g.pill}
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
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {r.bucket === 'reply' || r.bucket === 'tidy_wrote' ? (
            <Link href={`/businesses/${r.business_id}`} className={mainBtn}>Open their email</Link>
          ) : email ? (
            <a href={`mailto:${email}`} className={r.bucket === 'close' || r.bucket.startsWith('tidy') ? softBtn : mainBtn}>
              Email {who ?? email}
            </a>
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
          {(r.bucket === 'close' || r.bucket.startsWith('tidy')) && (
            <button type="button" className={softBtn} disabled={busy === r.business_id} onClick={() => close([r.business_id], r.name)}>Not interested</button>
          )}
        </div>
      </li>
    )
  }

  function renderGroup(g: Group, bulk = false) {
    const list = byBucket.get(g.key) ?? []
    if (list.length === 0) return null
    const limit = shown[g.key] ?? g.first
    return (
      <div key={g.key}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3 pb-1">
          <h3 className="text-sm font-bold text-brand-dark">
            {g.title} <span className="font-semibold text-gray-600 tabular-nums">({list.length})</span>
          </h3>
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
        <p className="px-3 text-xs text-gray-600">{g.hint}</p>
        <ul className="divide-y divide-black/[0.06]">
          {list.slice(0, limit).map((r) => renderRow(r, g))}
        </ul>
        {list.length > limit && (
          <div className="px-3 pb-2">
            <button type="button" className={linkBtn} onClick={() => setShown((s) => ({ ...s, [g.key]: limit + g.first * 2 }))}>
              Show {Math.min(list.length - limit, g.first * 2)} more of {list.length - limit}
            </button>
          </div>
        )}
      </div>
    )
  }

  const findContact = byBucket.get('find_contact') ?? []
  const SUMMARY: [OutreachBucket, string][] = [['reply', 'to reply'], ['chase', 'to chase'], ['follow_up', 'to follow up'], ['close', 'to close'], ['new', 'new with an email']]
  const summary = SUMMARY.map(([k, label]) => `${count(k)} ${label}`).join(' · ')

  return (
    <section id="work-on-next" aria-labelledby="work-on-next-heading" className="mb-8 scroll-mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 id="work-on-next-heading" className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
          Work on next
        </h2>
        <button type="button" className={linkBtn} aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)}>
          {howOpen ? 'Hide how this is ordered' : 'How this is ordered'}
        </button>
      </div>
      <p className="text-xs text-gray-600 mb-2">{summary}{tidyTotal > 0 && ` · ${tidyTotal} to tidy up`}</p>
      {howOpen && (
        <div className={cn(card, 'p-3 mb-3 text-sm text-gray-700 space-y-1')}>
          <p>Plain rules on the latest email each way, worked out fresh every time (the outreach routine reads the same list). Replies first, then chases, follow-ups, ones to close, then new businesses by fit score.</p>
          <p>Fit score points, from which of 225 approached businesses replied: named contact with email +3 (33% replied, against 6% without), has written to us before +2 (36% against 12%), in our news +2 (37% against 16%), former member or advertiser +2 (30% against 17%); category Entertainment +2, Activities +1, Food &amp; Drink +1, Retail 0, Services, For Children and Health &amp; Beauty −1. Newsletter mentions and routine drafts made no difference, so they score nothing.</p>
        </div>
      )}
      <div className={cn(card, 'divide-y divide-black/[0.06]')}>
        {MAIN.map((g) => renderGroup(g))}
        {findContact.length > 0 && (
          <div className="px-3 py-2 text-sm">
            <span className="font-semibold text-brand-dark">No email address yet: {findContact.length}</span>
            <span className="text-gray-600"> Identified businesses with no email on file. Best fit first: </span>
            {findContact.slice(0, 5).map((r, i) => (
              <span key={r.business_id}>
                {i > 0 && ', '}
                <Link href={`/businesses/${r.business_id}`} className="text-brand-navy hover:underline">{r.name}</Link>
              </span>
            ))}
            {findContact.length > 5 && <span className="text-gray-600"> and {findContact.length - 5} more (Identified box below).</span>}
          </div>
        )}
        {tidyTotal > 0 && (
          <div>
            <button type="button" className="w-full text-left px-3 py-2.5 text-sm font-semibold text-brand-navy hover:bg-brand-warm" aria-expanded={tidyOpen} onClick={() => setTidyOpen((o) => !o)}>
              {tidyOpen ? '▾' : '▸'} Tidy up ({tidyTotal}): gone quiet, close or try again
            </button>
            {tidyOpen && TIDY.map((g) => renderGroup(g, true))}
          </div>
        )}
        {MAIN.every((g) => count(g.key) === 0) && tidyTotal === 0 && (
          <p className="px-3 py-3 text-sm text-gray-600">Nothing waiting. Add businesses at Identified from the leads or suggestions below.</p>
        )}
      </div>
    </section>
  )
}
