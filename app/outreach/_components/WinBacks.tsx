'use client'

// Outreach "Win back" and "Fill a category" (UI overhaul Stage 11c, layout C): two more views
// of the Work on next card, chosen from its switch, so the page gets no taller. The category
// bars sit beside either list and filter it. Order comes from v_outreach_winbacks and
// v_category_gap_prospects. Every row has the same ways off as Work on next, each with Undo.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn, formatDateGB } from '@/lib/utils'
import type { GapProspect, OutreachWinbacks, WinBackContact, WinBackRow } from '@/app/actions/outreach-winbacks'
import type { OutreachSnooze } from '@/app/actions/outreach-next'
import {
  acceptOutreachSuggestion, closeOutreachBusinesses, dismissOutreachSuggestion, endOutreachSnooze,
  restoreOutreachSnooze, snoozeOutreachBusiness, undoCloseOutreachBusinesses, undoDismissOutreachSuggestion,
} from '@/app/actions/outreach-next'
import { removeBusinessFromOutreach, undoRemoveFromOutreach } from '@/app/actions/businesses'
import { ActionMenu, type MenuEntry } from '@/components/ui/action-menu'
import { PILL } from '@/app/businesses/_components/MastersheetTable'

const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`
const linkBtn = 'text-sm font-semibold text-brand-navy hover:underline min-h-10 md:min-h-0 inline-flex items-center'

const FIRST = 10
const SNOOZE_CHOICES: [number, string][] = [[7, '1 week'], [14, '2 weeks'], [30, '1 month'], [91, '3 months']]
const DEAL_WORDS: Record<string, string> = { club_card: 'Club Card', advertiser: 'Advertising', former_advertiser: 'Advertising' }

const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

function addDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type Row = {
  business_id: string
  name: string
  category: string | null
  outreach_stage: string | null
  snoozed_until: string | null
  contact: WinBackContact
  pill: string
  why: string
}

function winBackWhy(r: WinBackRow): string {
  const deal = r.last_deal_end
    ? `${DEAL_WORDS[r.last_deal_type ?? ''] ?? 'Deal'} ended ${dateGB(r.last_deal_end)}`
    : 'Former member, no deal dates on file'
  const paid = r.paid_total > 0 ? `${money(r.paid_total)}${r.deals > 1 ? ` over ${r.deals} deals` : ''}` : 'nothing paid on file'
  const mail = r.emails > 0 ? `${r.emails} ${r.emails === 1 ? 'email' : 'emails'}${r.last_email_on ? `, last ${dateGB(r.last_email_on)}` : ''}` : 'no emails'
  return [r.category, `${deal}, ${paid}`, mail, r.outreach_stage === 'identified' ? 'Identified on outreach' : null].filter(Boolean).join('. ') + '.'
}

function gapWhy(p: GapProspect): string {
  return [
    p.status === 'Former' ? 'Former member' : p.status === 'Unreviewed' ? 'Emailed in, not reviewed' : 'Prospect',
    p.has_named_contact ? 'Named contact with email' : p.has_email ? 'Email on file' : 'No email yet',
    p.last_email_on ? `Last email ${dateGB(p.last_email_on)}` : null,
    p.outreach_stage === 'identified' ? 'Identified on outreach' : null,
  ].filter(Boolean).join('. ') + '.'
}

export function WinBacks({ data, mode }: { data: OutreachWinbacks; mode: 'winback' | 'gaps' }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [limit, setLimit] = useState(FIRST)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const firstThin = data.gaps.find((g) => g.is_thin)?.category ?? null
  const [pickedCat, setPickedCat] = useState<string | null | undefined>(undefined)
  // Win back opens on every category; Fill a category opens on the thinnest category first.
  const cat = pickedCat === undefined ? (mode === 'gaps' ? firstThin : null) : pickedCat

  const rows: Row[] = useMemo(() => {
    if (mode === 'winback') {
      return data.winbacks.map((r) => ({ ...r, pill: `${r.score} pts`, why: winBackWhy(r) }))
    }
    return data.prospects.map((p) => ({ ...p, pill: `${p.fit_score} pts`, why: gapWhy(p) }))
  }, [data, mode])

  const inCat = rows.filter((r) => !hidden.has(r.business_id) && (!cat || r.category === cat))
  const live = inCat.filter((r) => !r.snoozed_until)
  const snoozed = inCat.filter((r) => r.snoozed_until)
  const biggest = Math.max(1, ...data.gaps.map((g) => g.members))
  const prospectsIn = (c: string) => data.prospects.filter((p) => p.category === c && !p.snoozed_until && !hidden.has(p.business_id)).length
  const thin = data.gaps.filter((g) => g.is_thin)

  const hide = (id: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  const putBack = (id: string) => {
    hide(id, false)
    toast.success('Put back')
    router.refresh()
  }

  // One shape for every action: hide at once, run, Undo restores and shows the row again.
  async function run(r: Row, act: () => Promise<{ error?: string; undo?: () => Promise<{ error?: string }>; message?: string }>) {
    setBusy(r.business_id)
    hide(r.business_id, true)
    const result = await act()
    setBusy(null)
    if (result.error || !result.undo) {
      hide(r.business_id, false)
      toast.error(result.error ?? 'Not changed')
      return
    }
    const undo = result.undo
    toast.undo(result.message ?? r.name, async () => {
      const u = await undo()
      if (u.error) toast.error(u.error)
      else putBack(r.business_id)
    })
    router.refresh()
  }

  const putOn = (r: Row) => run(r, async () => {
    const res = await acceptOutreachSuggestion(r.business_id)
    if (res.error || !res.backupId) return { error: res.error ?? 'Not added' }
    const id = res.backupId
    return { message: `${r.name} on outreach as Identified`, undo: () => undoRemoveFromOutreach(id) }
  })
  const snooze = (r: Row, days: number) => run(r, async () => {
    const res = await snoozeOutreachBusiness(r.business_id, days)
    if (res.error || !res.until) return { error: res.error ?? 'Not hidden' }
    const previous: OutreachSnooze = res.previous ?? null
    return { message: `${r.name}: not now, back on ${dateGB(res.until)}`, undo: () => restoreOutreachSnooze(r.business_id, previous) }
  })
  const bringBack = (r: Row) => run(r, async () => {
    const res = await endOutreachSnooze(r.business_id)
    if (res.error) return { error: res.error }
    const previous: OutreachSnooze = res.previous ?? null
    return { message: `${r.name} back on the list`, undo: () => restoreOutreachSnooze(r.business_id, previous) }
  })
  const notInterested = (r: Row) => run(r, async () => {
    const res = await closeOutreachBusinesses([r.business_id], { offOutreachToo: true })
    if (res.error || !res.batch) return { error: res.error ?? 'Not changed' }
    const batch = res.batch
    return { message: `${r.name}: Not interested`, undo: () => undoCloseOutreachBusinesses(batch) }
  })
  const takeOff = (r: Row) => run(r, async () => {
    const res = await removeBusinessFromOutreach(r.business_id)
    if (res.error || res.backupId === undefined) return { error: res.error ?? 'Not taken off outreach' }
    const id = res.backupId
    return { message: `${r.name} taken off outreach`, undo: () => undoRemoveFromOutreach(id) }
  })
  const notOnList = (r: Row) => run(r, async () => {
    const res = await dismissOutreachSuggestion(r.business_id)
    if (res.error) return { error: res.error }
    return { message: `${r.name} off this list`, undo: () => undoDismissOutreachSuggestion(r.business_id) }
  })

  function renderRow(r: Row) {
    const c = r.contact
    const who = c && !c.is_placeholder ? c.name : null
    const off: MenuEntry[] = [
      { label: 'Business page', href: `/businesses/${r.business_id}` },
      ...(r.snoozed_until
        ? []
        : [{ group: 'Not now (back sooner if they email)', items: SNOOZE_CHOICES.map(([days, label]) => ({ label: `${label}, back on ${dateGB(addDays(days))}`, onSelect: () => snooze(r, days) })) }]),
      { label: 'Not interested', hint: 'Close it: the outreach stage becomes Not interested', onSelect: () => notInterested(r) },
      r.outreach_stage
        ? { label: 'Take off outreach', hint: 'No stage at all; the business and its emails stay', onSelect: () => takeOff(r) }
        : { label: mode === 'winback' ? 'Not a win-back' : 'Not for this list', hint: 'Leaves these lists and Could be on outreach', onSelect: () => notOnList(r) },
    ]
    return (
      <li key={r.business_id} className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 items-center px-3 py-2 hover:bg-brand-warm transition-colors duration-200 ease-out">
        <span className={cn('self-start sm:self-center justify-self-start text-xs font-bold px-2 py-0.5 rounded-sm whitespace-nowrap tabular-nums', PILL[r.snoozed_until ? 'muted' : 'green'])}>
          {r.snoozed_until ? 'Not now' : r.pill}
        </span>
        <div className="min-w-0">
          <Link href={`/businesses/${r.business_id}`} className="font-semibold text-brand-dark hover:underline break-words">{r.name}</Link>
          <p className="text-xs text-gray-600">
            {r.snoozed_until && <>Not now, back on {dateGB(r.snoozed_until)}. </>}
            {r.why}
            {who && <> Main contact: {who}{c?.role ? ` (${c.role})` : ''}.</>}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-1.5 sm:justify-end">
          {r.snoozed_until ? (
            <button type="button" className={mainBtn} disabled={busy === r.business_id} onClick={() => bringBack(r)}>Bring back</button>
          ) : r.outreach_stage ? (
            c?.email ? <a href={`mailto:${c.email}`} className={mainBtn}>Email {who ?? c.email}</a> : <Link href={`/businesses/${r.business_id}`} className={softBtn}>Find a contact</Link>
          ) : (
            <button type="button" className={mainBtn} disabled={busy === r.business_id} onClick={() => putOn(r)}>
              Put on outreach<span className="sr-only"> {r.name}</span>
            </button>
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

  return (
    <div className="grid sm:grid-cols-[15rem_minmax(0,1fr)] border-t border-black/[0.08]">
      <div className="px-3 py-2.5 sm:border-r border-b sm:border-b-0 border-black/[0.06]">
        <p className="text-sm font-semibold text-brand-dark">Club Card members by category</p>
        <p className="text-xs text-gray-600">In force or in grace. Fewer than 5 counts as thin. Choose one to filter the list.</p>
        <div role="group" aria-label="Filter by category" className="mt-1.5 space-y-0.5">
          {data.gaps.map((g) => {
            const on = cat === g.category
            return (
              <button
                key={g.category}
                type="button"
                aria-pressed={on}
                onClick={() => { setPickedCat(on ? null : g.category); setLimit(FIRST) }}
                className={cn(
                  'w-full grid grid-cols-[7.5rem_minmax(0,1fr)_1.75rem] gap-1.5 items-center text-left text-xs px-1 py-1 rounded-sm transition-colors duration-200 ease-out',
                  on ? 'bg-brand-warm ring-1 ring-ms-band' : 'hover:bg-brand-warm',
                )}
              >
                <span className={cn('truncate', g.is_thin ? 'font-bold text-ms-orange-text' : 'text-gray-800')}>{g.category}</span>
                <span className="block h-2 bg-ms-muted rounded-sm overflow-hidden" aria-hidden="true">
                  <span className={cn('block h-full', g.is_thin ? 'bg-ms-orange-text' : 'bg-brand-olive')} style={{ width: `${Math.max(3, (g.members / biggest) * 100)}%` }} />
                </span>
                <span className="tabular-nums font-semibold text-right">{g.members}</span>
              </button>
            )
          })}
        </div>
        {cat && (
          <button type="button" className={cn(linkBtn, 'mt-1.5')} onClick={() => { setPickedCat(null); setLimit(FIRST) }}>
            {mode === 'gaps' ? 'Every thin category' : 'Every category'}
          </button>
        )}
      </div>

      <div className="min-w-0">
        <p className="px-3 pt-2.5 pb-1 text-xs text-gray-600">
          {mode === 'winback' ? (
            <>Former members and advertisers you are not talking to now, most recent and most valuable first. Points: dealt with (a deal ending, an invoice or an email) in the last year +3, the last two years +2; paid £500 or more +2, anything paid +1; 20 or more emails +1.</>
          ) : thin.length === 0 ? (
            <>No category is thin: each has at least 5 Club Card members.</>
          ) : (
            <>
              Businesses that could fill {cat ? <b>{cat}</b> : thin.map((g, i) => <span key={g.category}>{i > 0 && ' and '}<b>{g.category}</b></span>)}: prospects, former members and businesses that emailed in, not being talked to now, best fit first (the same points as New).
              {!cat && thin.length > 1 && <> {thin.map((g) => `${g.category} ${prospectsIn(g.category)}`).join(', ')}.</>}
            </>
          )}
        </p>
        {live.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-gray-600">
            {mode === 'gaps' && cat && !thin.some((g) => g.category === cat) ? `${cat} is not thin, so nobody is listed for it.` : 'Nothing here right now.'}
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
            {live.slice(0, limit).map(renderRow)}
          </ul>
        )}
        {live.length > limit && (
          <div className="px-3 py-1.5 border-t border-black/[0.06]">
            <button type="button" className={linkBtn} onClick={() => setLimit(limit + FIRST * 2)}>
              Show {Math.min(live.length - limit, FIRST * 2)} more of {live.length - limit}
            </button>
          </div>
        )}
        {snoozed.length > 0 && (
          <div className="px-3 py-1.5 border-t border-black/[0.06]">
            <button type="button" className={linkBtn} aria-expanded={showSnoozed} onClick={() => setShowSnoozed((o) => !o)}>
              {showSnoozed ? 'Hide' : 'Show'} {snoozed.length} hidden for now
            </button>
          </div>
        )}
        {showSnoozed && snoozed.length > 0 && (
          <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06]">{snoozed.map(renderRow)}</ul>
        )}
      </div>
    </div>
  )
}
