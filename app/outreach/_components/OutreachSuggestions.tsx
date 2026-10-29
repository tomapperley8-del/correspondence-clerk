'use client'

// "Could be on outreach" (UI overhaul Stage 16c2, intake option A): businesses not on outreach
// that our own records say are worth a look (v_outreach_suggestions). Nothing joins outreach
// by itself: Accept puts the business at Identified (addBusinessToOutreach, the board's own
// action), Not now hides it, each with Undo.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn, formatDateGB } from '@/lib/utils'
import type { OutreachSuggestion } from '@/app/actions/outreach-next'
import { acceptOutreachSuggestion, dismissOutreachSuggestion, undoDismissOutreachSuggestion } from '@/app/actions/outreach-next'
import { undoRemoveFromOutreach } from '@/app/actions/businesses'
import { PointChips } from './WorkOnNext'

const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`
const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'

type Chip = 'all' | 'former' | 'unreviewed' | 'newsletter' | 'news'
const CHIPS: { key: Chip; label: string; test: (s: OutreachSuggestion) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'former', label: 'Former members', test: (s) => s.is_former },
  { key: 'unreviewed', label: 'Emailed in, not reviewed', test: (s) => s.is_unreviewed },
  { key: 'newsletter', label: 'In the newsletter', test: (s) => s.in_newsletter },
  { key: 'news', label: 'In the news', test: (s) => s.in_recent_news },
]
const FIRST = 6

const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')

function reasons(s: OutreachSuggestion): string {
  return [
    s.is_former ? 'Had a deal before, none now' : null,
    s.is_unreviewed ? 'Emailed in; the record was made from their email and not reviewed yet' : null,
    s.in_newsletter ? `In the newsletter ${s.newsletter_mentions_12m} ${s.newsletter_mentions_12m === 1 ? 'time' : 'times'} in the last year, no deal` : null,
    s.in_recent_news ? `In our news on ${dateGB(s.last_article)}, no deal` : null,
    s.last_contacted_at ? `Last in touch ${dateGB(s.last_contacted_at)}` : null,
  ].filter(Boolean).join('. ') + '.'
}

export function OutreachSuggestions({ suggestions }: { suggestions: OutreachSuggestion[] }) {
  const router = useRouter()
  const [chip, setChip] = useState<Chip>('all')
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [limit, setLimit] = useState(FIRST)

  const live = useMemo(() => suggestions.filter((s) => !gone.has(s.business_id)), [suggestions, gone])
  const list = useMemo(() => live.filter(CHIPS.find((c) => c.key === chip)!.test), [live, chip])
  const setOne = (id: string, on: boolean) =>
    setGone((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })

  async function accept(s: OutreachSuggestion) {
    setBusy(s.business_id)
    setOne(s.business_id, true)
    const result = await acceptOutreachSuggestion(s.business_id)
    setBusy(null)
    if (result.error || !result.backupId) {
      setOne(s.business_id, false)
      toast.error(result.error ?? 'Not added')
      return
    }
    const backupId = result.backupId
    toast.undo(`${s.name} on outreach as Identified`, async () => {
      const undo = await undoRemoveFromOutreach(backupId)
      if (undo.error) {
        toast.error(undo.error)
        return
      }
      setOne(s.business_id, false)
      toast.success('Put back')
      router.refresh()
    })
    router.refresh()
  }

  async function notNow(s: OutreachSuggestion) {
    setBusy(s.business_id)
    setOne(s.business_id, true)
    const result = await dismissOutreachSuggestion(s.business_id)
    setBusy(null)
    if (result.error) {
      setOne(s.business_id, false)
      toast.error(result.error)
      return
    }
    toast.undo(`${s.name}: not now`, async () => {
      const undo = await undoDismissOutreachSuggestion(s.business_id)
      if (undo.error) toast.error(undo.error)
      else {
        setOne(s.business_id, false)
        toast.success('Put back')
        router.refresh()
      }
    })
  }

  return (
    <section id="suggestions" aria-labelledby="suggestions-heading" className="mb-8 scroll-mt-4">
      <h2 id="suggestions-heading" className="text-xl font-bold flex flex-wrap items-baseline gap-2 mb-0.5" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
        Could be on outreach
        <span className="text-xs font-semibold text-gray-600" style={{ fontFamily: 'var(--font-sans)' }}>{live.length}</span>
      </h2>
      <p className="text-xs text-gray-600 mb-2">
        Businesses not on outreach that our own records point to. Former members came back more often than anyone else: leads for lapsed members converted 4 times in 5. Accept puts the business on outreach as Identified; Not now hides it. Nothing is added by itself.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Show">
        {CHIPS.map((c) => {
          const n = live.filter(c.test).length
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={chip === c.key}
              onClick={() => { setChip(c.key); setLimit(FIRST) }}
              className={cn(btnBase, chip === c.key ? 'bg-brand-navy text-white' : 'bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm')}
            >
              {c.label} <span className="ml-1 tabular-nums opacity-80">{n}</span>
            </button>
          )
        })}
      </div>
      {list.length === 0 ? (
        <p className={cn(card, 'px-3 py-3 text-sm text-gray-600')}>Nothing to suggest here right now.</p>
      ) : (
        <ul className={cn(card, 'divide-y divide-black/[0.06]')}>
          {list.slice(0, limit).map((s) => (
            <li key={s.business_id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-start px-3 py-2.5">
              <div className="min-w-0">
                <Link href={`/businesses/${s.business_id}`} className="font-semibold text-brand-dark hover:underline break-words">{s.name}</Link>
                <span className="text-xs text-gray-600"> {s.category ?? 'No category'} · fit {s.fit_score}{s.has_email ? '' : ' · no email on file'}</span>
                <p className="text-xs text-gray-600">{reasons(s)}</p>
                <PointChips points={s.points} score={s.fit_score} />
              </div>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                <button type="button" className={mainBtn} disabled={busy === s.business_id} onClick={() => accept(s)}>Accept</button>
                <button type="button" className={softBtn} disabled={busy === s.business_id} onClick={() => notNow(s)}>Not now</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > limit && (
        <button type="button" className="mt-1 text-sm font-semibold text-brand-navy hover:underline min-h-10 md:min-h-0" onClick={() => setLimit((l) => l + FIRST * 2)}>
          Show {Math.min(list.length - limit, FIRST * 2)} more of {list.length - limit}
        </button>
      )}
    </section>
  )
}
