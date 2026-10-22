'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import { snoozeBusinessAttention, dismissWaitingReplies } from '@/app/actions/attention'
import { updateBusinessRenewalStage } from '@/app/actions/businesses'
import { updateTask } from '@/app/actions/tasks'
import { clearFollowUpFlag, moveFollowUpFlag, type TodayData, type QuietReminder } from '@/app/actions/today'
import { REASON_LABEL, addDays, ageWords, daysFrom, splitDoNow, type TodayItem, type TodayReason } from '@/lib/today'
import { TodayQuickAdd } from './TodayQuickAdd'

// Today (UI overhaul Stage 7): this week, Do now (at most 8, chosen by plain
// rules), everything else folded by reason, and small links. Nothing is ticked
// here except to-dos: a line goes when its cause goes.

const OUTLOOK_DRAFTS = 'https://outlook.office.com/mail/drafts'

const TAG_TONE: Record<TodayReason, string> = {
  money_owed: 'bg-red-50 text-red-800',
  renewal: 'bg-amber-50 text-amber-800',
  waiting_on_you: 'bg-brand-navy/10 text-brand-navy',
  todo: 'bg-brand-olive/15 text-brand-dark',
}

const GROUPS: { reason: TodayReason; title: string; hint: string }[] = [
  { reason: 'money_owed', title: 'Money owed', hint: 'QuickBooks invoices past due, with no chaser in the last 7 days.' },
  { reason: 'renewal', title: 'Renewals', hint: 'Ending in the next 45 days or ended in the last 60, with no outcome recorded.' },
  { reason: 'waiting_on_you', title: 'Waiting on you', hint: 'They wrote in the last 30 days and nothing has gone back.' },
  { reason: 'todo', title: 'Your to-dos', hint: 'Everything you have said you will do, and follow-up flags that are due.' },
]

const QUIET_LABEL: Record<QuietReminder['kind'], string> = {
  checkin: 'Club Card check-in',
  stats: 'Advertiser stats',
  editorial: 'Editorial',
}

const btn = 'text-xs font-semibold px-2.5 py-1.5 border border-black/[0.12] rounded-sm bg-white text-brand-navy hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)

function refreshNav() {
  window.dispatchEvent(new Event('cc:nav-refresh'))
}

function groupOrder(a: TodayItem, b: TodayItem): number {
  if (a.reason === 'todo') {
    // Dated to-dos first, soonest first; undated last.
    if (!a.since !== !b.since) return a.since ? -1 : 1
    return (a.since ?? '').localeCompare(b.since ?? '')
  }
  return (a.since ?? '').localeCompare(b.since ?? '')
}

export function TodayClient({ data }: { data: TodayData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [moving, setMoving] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [shownData, setShownData] = useState(data)
  const { today } = data

  // Lines cleared here are hidden until fresh data arrives, which already
  // leaves them out (and brings back anything woken from a snooze).
  if (data !== shownData) {
    setShownData(data)
    setGone(new Set())
  }

  const items = useMemo(() => data.items.filter((i) => !gone.has(i.key)), [data.items, gone])
  const { doNow, rest } = useMemo(() => splitDoNow(items, today), [items, today])
  const quiet = data.quiet.filter((q) => !gone.has(`quiet:${q.id}`))

  function run(key: string, action: () => Promise<{ error?: string | null; success?: boolean; data?: unknown }>, message: string, clears = true) {
    setBusyKey(key)
    startTransition(async () => {
      const result = await action()
      setBusyKey(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(message)
      if (clears) setGone((prev) => new Set(prev).add(key))
      setMoving(null)
      refreshNav()
      router.refresh()
    })
  }

  const snooze = (i: TodayItem) =>
    run(i.key, () => snoozeBusinessAttention(i.business_id!, addDays(today, 7)), `${i.business_name} snoozed for 7 days`)

  function actions(i: TodayItem) {
    const busy = pending && busyKey === i.key
    const biz = i.business_id ? `/businesses/${i.business_id}` : null
    if (i.reason === 'todo') {
      if (moving === i.key) {
        return (
          <form
            className="flex gap-2 items-center"
            onSubmit={(e) => {
              e.preventDefault()
              if (!moveTo) return
              run(
                i.key,
                () => (i.todo_kind === 'flag' ? moveFollowUpFlag(i.ref_id!, moveTo) : updateTask(i.ref_id!, { due_date: moveTo })),
                `Moved to ${dateGB(moveTo)}`,
                false,
              )
            }}
          >
            <label className="sr-only" htmlFor={`move-${i.key}`}>New date</label>
            <input id={`move-${i.key}`} type="date" value={moveTo} min={today} onChange={(e) => setMoveTo(e.target.value)} className="text-xs border border-black/[0.12] rounded-sm px-2 py-1" />
            <button type="submit" disabled={busy || !moveTo} className={btn}>Save date</button>
            <button type="button" onClick={() => setMoving(null)} className={btn}>Cancel</button>
          </form>
        )
      }
      return (
        <>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => run(i.key, () => (i.todo_kind === 'flag' ? clearFollowUpFlag(i.ref_id!) : updateTask(i.ref_id!, { status: 'done' })), 'Done')}
          >
            Done
          </button>
          <button type="button" disabled={busy} className={btn} onClick={() => { setMoving(i.key); setMoveTo(i.since && i.since > today ? i.since : addDays(today, 7)) }}>
            Move date
          </button>
          {biz && i.todo_kind === 'flag' && <Link href={biz} className={btn}>Open</Link>}
        </>
      )
    }
    return (
      <>
        {i.reason === 'money_owed' && (
          <>
            <Link href={biz!} className={btn} title="Open the business to see the contact and write a chaser">Chase</Link>
            <button
              type="button"
              disabled={busy}
              className={btn}
              title="QuickBooks clears the line when the payment arrives there. Until then it is hidden for 7 days."
              onClick={() => run(i.key, () => snoozeBusinessAttention(i.business_id!, addDays(today, 7)), `${i.business_name}: hidden for 7 days while QuickBooks catches up`)}
            >
              Mark paid
            </button>
          </>
        )}
        {i.reason === 'renewal' && (
          <>
            <Link href={`${biz}?tab=details`} className={btn} title="Open the deal to record the new contract">Log renewal</Link>
            <button
              type="button"
              disabled={busy}
              className={btn}
              onClick={() => {
                if (!window.confirm(`Mark ${i.business_name} as not renewing?`)) return
                run(i.key, () => updateBusinessRenewalStage(i.business_id!, 'not_renewing'), `${i.business_name}: not renewing`)
              }}
            >
              Not renewing
            </button>
          </>
        )}
        {i.reason === 'waiting_on_you' && (
          <>
            <Link href={biz!} className={btn} title="Open the business to read the email and reply">Reply</Link>
            <button
              type="button"
              disabled={busy}
              className={btn}
              onClick={() => run(i.key, () => dismissWaitingReplies(i.business_id!), `${i.business_name}: no reply needed`)}
            >
              No reply needed
            </button>
          </>
        )}
        <button type="button" disabled={busy} className={btn} onClick={() => snooze(i)}>Snooze 7 days</button>
      </>
    )
  }

  function row(i: TodayItem) {
    const age = daysFrom(i.since, today)
    const late = i.reason !== 'waiting_on_you' && age !== null && age > 0
    return (
      <li key={i.key} className="py-3 px-1 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start">
        <span className={`justify-self-start text-[11px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap ${TAG_TONE[i.reason]}`}>
          {REASON_LABEL[i.reason]}
        </span>
        <div className="min-w-0">
          {i.business_id ? (
            <Link href={`/businesses/${i.business_id}`} className="font-semibold text-brand-dark hover:underline break-words">
              {i.business_name}
            </Link>
          ) : (
            <span className="font-semibold text-brand-dark">{i.reason === 'todo' ? 'Your to-do' : ''}</span>
          )}
          <p className="text-sm text-gray-700 break-words">{i.detail}</p>
          <p className={`text-xs ${late ? 'text-red-700' : 'text-gray-500'}`}>
            {ageWords(i, today)}
            {i.since ? ` (${dateGB(i.since)})` : ''}
            {i.other_reasons.length > 0 ? ` · Also: ${i.other_reasons.map((r) => REASON_LABEL[r]).join(', ')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">{actions(i)}</div>
      </li>
    )
  }

  const total = items.length
  const weekDays = Array.from({ length: 7 }, (_, k) => addDays(today, k))
  const eventTone = { renewal: 'bg-amber-50 text-amber-800', todo: 'bg-brand-olive/15 text-brand-dark', invoice: 'bg-red-50 text-red-800' }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Today</h1>
        <p className="text-sm text-gray-600 mt-1">
          <strong className="text-brand-dark">{doNow.length} to do now.</strong>{' '}
          {total - doNow.length} more waiting below, nothing hidden.
          {data.owed > 0 && <> £{data.owed.toLocaleString('en-GB', { maximumFractionDigits: 2 })} owed.</>}
        </p>
      </header>

      <section aria-labelledby="week-h" className="space-y-2">
        <h2 id="week-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>This week</h2>
        {/* Seven columns on a wide screen; on a phone, a list of the days that have something on. */}
        <div className="border border-black/[0.06] rounded-sm bg-brand-warm">
          <div className="grid grid-cols-1 sm:grid-cols-7">
            {weekDays.map((d, k) => {
              const events = data.week.filter((e) => e.date === d)
              const name = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
              return (
                <div
                  key={d}
                  className={`p-2 min-w-0 border-black/[0.06] ${k < 6 ? 'border-b sm:border-b-0 sm:border-r' : ''} ${events.length === 0 && k > 0 ? 'hidden sm:block' : ''}`}
                >
                  <div className={`text-[11px] uppercase tracking-wide ${k === 0 ? 'text-brand-navy font-semibold' : 'text-gray-500'}`}>
                    {k === 0 ? 'Today' : name}
                  </div>
                  {events.length === 0 && <p className="mt-1.5 text-[11.5px] text-gray-500 sm:hidden">Nothing dated today.</p>}
                  {events.map((e, n) => {
                    const cls = `block mt-1.5 text-[11.5px] leading-tight px-1.5 py-1 rounded-sm break-words ${eventTone[e.kind]}`
                    return e.business_id ? (
                      <Link key={n} href={`/businesses/${e.business_id}`} className={`${cls} hover:underline`}>{e.label}</Link>
                    ) : (
                      <span key={n} className={cls}>{e.label}</span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        <p className="text-xs text-gray-500">Renewals ending, to-dos due and invoices falling due in the next seven days.</p>
      </section>

      <section aria-labelledby="donow-h" className="space-y-2">
        <h2 id="donow-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Do now</h2>
        <p className="text-xs text-gray-500 max-w-[70ch] border-l-[3px] border-brand-olive pl-3">
          At most 8, picked by plain rules: money more than 30 days overdue, a renewal that ended in the last 30 days or ends within a week,
          an email waiting a week or more, a to-do past its date. Most pressing first. Each line goes by itself when the thing is done.
        </p>
        {doNow.length === 0 ? (
          <p className="text-sm text-gray-600 py-3">Nothing pressing. Anything else is folded away below.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">{doNow.map(row)}</ul>
        )}
      </section>

      <section aria-labelledby="rest-h" className="space-y-2">
        <h2 id="rest-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Everything else</h2>
        {GROUPS.map(({ reason, title, hint }) => {
          const list = rest.filter((i) => i.reason === reason).sort(groupOrder)
          if (list.length === 0) return null
          return (
            <details key={reason} className="group border border-black/[0.06] rounded-sm bg-brand-warm">
              <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center gap-3 font-semibold text-brand-dark [&::-webkit-details-marker]:hidden">
                {title} <span className="font-normal text-gray-500">{list.length}</span>
                <span className="ml-auto text-xs font-semibold text-brand-navy group-open:hidden">Show</span>
                <span className="ml-auto text-xs font-semibold text-brand-navy hidden group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-black/[0.06] bg-white px-3">
                <p className="text-xs text-gray-500 pt-2">{hint}</p>
                <ul className="divide-y divide-black/[0.06]">{list.map(row)}</ul>
              </div>
            </details>
          )
        })}
        {data.snoozed.length > 0 && (
          <details className="group border border-black/[0.06] rounded-sm bg-brand-warm">
            <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center gap-3 font-semibold text-brand-dark [&::-webkit-details-marker]:hidden">
              Snoozed <span className="font-normal text-gray-500">{data.snoozed.length}</span>
              <span className="ml-auto text-xs font-semibold text-brand-navy group-open:hidden">Show</span>
              <span className="ml-auto text-xs font-semibold text-brand-navy hidden group-open:inline">Hide</span>
            </summary>
            <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06] bg-white px-3">
              {data.snoozed.filter((s) => !gone.has(`wake:${s.business_id}`)).map((s) => (
                <li key={s.business_id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/businesses/${s.business_id}`} className="font-semibold text-brand-dark hover:underline">{s.business_name}</Link>
                    <p className="text-xs text-gray-500">
                      {REASON_LABEL[s.reason as TodayReason] ?? s.reason}{s.until ? ` · snoozed until ${dateGB(s.until)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending && busyKey === `wake:${s.business_id}`}
                    className={btn}
                    onClick={() => run(`wake:${s.business_id}`, () => snoozeBusinessAttention(s.business_id, null), `${s.business_name} is back on the list`)}
                  >
                    Wake now
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="add-h" className="space-y-2">
        <h2 id="add-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>I&apos;ll do this by…</h2>
        <TodayQuickAdd today={today} onAdded={() => { refreshNav(); router.refresh() }} />
      </section>

      <section aria-label="Other things" className="grid gap-3 sm:grid-cols-3">
        <div className="border border-black/[0.06] rounded-sm bg-brand-warm px-3 py-2.5 text-sm">
          <p className="font-semibold text-brand-dark">{data.newLeads} new lead{data.newLeads === 1 ? '' : 's'}</p>
          <p className="text-gray-600 text-xs mb-1">From the prospecting routine.</p>
          <Link href="/businesses?view=leads" className="text-xs font-semibold text-brand-navy hover:underline">Open Leads</Link>
        </div>
        <div className="border border-black/[0.06] rounded-sm bg-brand-warm px-3 py-2.5 text-sm">
          <p className="font-semibold text-brand-dark">{data.draftsReady} draft{data.draftsReady === 1 ? '' : 's'} ready</p>
          <p className="text-gray-600 text-xs mb-1">Written by the routines in the last 14 days, shown on each business page next to the email they answer.</p>
          <a href={OUTLOOK_DRAFTS} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-navy hover:underline">Open Outlook Drafts</a>
        </div>
        <details className="group border border-black/[0.06] rounded-sm bg-brand-warm px-3 py-2.5 text-sm sm:col-span-1">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-brand-dark">{quiet.length} quiet reminder{quiet.length === 1 ? '' : 's'}</span>
            <span className="block text-gray-600 text-xs">Advertiser stats, Club Card check-ins and editorial. Not counted.</span>
            <span className="text-xs font-semibold text-brand-navy group-open:hidden">Show</span>
            <span className="text-xs font-semibold text-brand-navy hidden group-open:inline">Hide</span>
          </summary>
          <ul className="mt-2 divide-y divide-black/[0.06]">
            {quiet.map((q) => (
              <li key={q.id} className="py-2">
                <p className="text-xs text-gray-500">{QUIET_LABEL[q.kind]}{q.due_date ? ` · ${dateGB(q.due_date)}` : ''}</p>
                {q.business_id ? (
                  <Link href={`/businesses/${q.business_id}`} className="text-sm text-brand-dark hover:underline break-words">{q.title}</Link>
                ) : (
                  <p className="text-sm text-brand-dark break-words">{q.title}</p>
                )}
                <button
                  type="button"
                  disabled={pending && busyKey === `quiet:${q.id}`}
                  className={`${btn} mt-1`}
                  onClick={() => run(`quiet:${q.id}`, () => updateTask(q.id, { status: 'done' }), 'Done')}
                >
                  Done
                </button>
              </li>
            ))}
            {quiet.length === 0 && <li className="py-2 text-xs text-gray-500">None.</li>}
          </ul>
        </details>
      </section>
    </div>
  )
}
