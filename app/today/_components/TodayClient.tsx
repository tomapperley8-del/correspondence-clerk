'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
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
import { TodayCalendar } from './TodayCalendar'
import { NewsletterList } from './NewsletterList'
import { addToNewsletter } from '@/components/ForNewsletterButton'
import { ActionMenu, type MenuEntry, type MenuItem } from '@/components/ui/action-menu'
import { FilterChips, type Chip } from '@/components/ui/filter-chips'
import { FullScreenPanel, useFullScreen } from '@/components/ui/full-screen-panel'
import { ItemList, ItemRow, rowButtonClass } from '@/components/ui/item-row'
import { ResizableSplit } from '@/components/ui/resizable-split'
import type { CalendarItem, NewsletterItem } from '@/app/actions/calendar'

// Today (UI overhaul Stage 7; calendar and newsletter list Stage 12; two
// columns, one-line rows and filter chips Stage 14a). On a computer: the work
// on the left (Do now, then Everything else as one list with filter chips),
// the calendar, newsletter list and quick add on the right, with a divider to
// drag. One column on a phone, Do now first. Each line has its most likely
// action as a button and the rest in a "More" menu. Nothing is ticked here
// except to-dos: a line goes when its cause goes. The actions are the same
// server actions as before; only the layout changed.

const OUTLOOK_DRAFTS = 'https://outlook.office.com/mail/drafts'

const TAG_TONE: Record<TodayReason, string> = {
  money_owed: 'bg-red-50 text-red-800',
  renewal: 'bg-amber-50 text-amber-800',
  club_card_lapsed: 'bg-amber-50 text-amber-800',
  waiting_on_you: 'bg-brand-navy/10 text-brand-navy',
  todo: 'bg-brand-olive/15 text-brand-dark',
  club_card: 'bg-gray-100 text-gray-700',
}

const GROUPS: { reason: TodayReason; chip: string; hint: string }[] = [
  { reason: 'money_owed', chip: 'Money owed', hint: 'QuickBooks invoices past due, with no chaser in the last 7 days.' },
  { reason: 'renewal', chip: 'Renewals', hint: 'Ending in the next 45 days or ended in the last 60, with no outcome recorded.' },
  { reason: 'club_card_lapsed', chip: 'Club Card ended', hint: 'The card ended more than 60 days ago (or is not renewing) but the website page is still up. Chase the renewal or take the page down.' },
  { reason: 'waiting_on_you', chip: 'Waiting on you', hint: 'They wrote in the last 30 days and nothing has gone back.' },
  { reason: 'todo', chip: 'To-dos', hint: 'Everything you have said you will do, and follow-up flags that are due.' },
  { reason: 'club_card', chip: 'Club Card pages', hint: 'Member pages on the website to fix: no page, offer out of date, missing from the A-Z, map or a category, listed twice, or contact details that differ from the app.' },
]

type FilterKey = 'all' | TodayReason | 'snoozed'

const FILTER_STORE = 'cc.today.filter'
/** Everything else shows this many lines, then "Show all" (full screen shows all). */
const REST_LIMIT = 20

const SNOOZE_DAYS = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
]

const QUIET_LABEL: Record<QuietReminder['kind'], string> = {
  checkin: 'Club Card check-in',
  stats: 'Advertiser stats',
  editorial: 'Editorial',
}

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)

function refreshNav() {
  window.dispatchEvent(new Event('cc:nav-refresh'))
}

const groupIndex = (r: TodayReason) => GROUPS.findIndex((g) => g.reason === r)

function groupOrder(a: TodayItem, b: TodayItem): number {
  if (a.reason !== b.reason) return groupIndex(a.reason) - groupIndex(b.reason)
  if (a.reason === 'todo') {
    // Dated to-dos first, soonest first; undated last.
    if (!a.since !== !b.since) return a.since ? -1 : 1
    return (a.since ?? '').localeCompare(b.since ?? '')
  }
  return (a.since ?? '').localeCompare(b.since ?? '')
}

export function TodayClient({
  data,
  calendar,
  newsletter,
}: {
  data: TodayData
  calendar: CalendarItem[]
  newsletter: { wednesday: string; items: NewsletterItem[] }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState<string | null>(null)
  const [pickDate, setPickDate] = useState('')
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
  const snoozed = data.snoozed.filter((s) => !gone.has(`wake:${s.business_id}`))

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
      setPicking(null)
      refreshNav()
      router.refresh()
    })
  }

  // Snooze: a business's line is hidden until the date (attention_snoozed_until);
  // a to-do's date moves, which is the snooze that sticks for tasks.
  function snoozeTo(i: TodayItem, date: string) {
    if (i.reason === 'todo') {
      run(
        i.key,
        () => (i.todo_kind === 'flag' ? moveFollowUpFlag(i.ref_id!, date) : updateTask(i.ref_id!, { due_date: date })),
        `Moved to ${dateGB(date)}`,
        false,
      )
    } else {
      run(i.key, () => snoozeBusinessAttention(i.business_id!, date), `${i.business_name} snoozed until ${dateGB(date)}`)
    }
  }

  function snoozeGroup(i: TodayItem): MenuEntry | null {
    if (i.reason === 'todo' ? !i.ref_id : !i.business_id) return null
    const items: MenuItem[] = SNOOZE_DAYS.map(({ days, label }) => ({
      label,
      hint: dateGB(addDays(today, days)),
      onSelect: () => snoozeTo(i, addDays(today, days)),
    }))
    items.push({
      label: 'Pick a date…',
      onSelect: () => {
        setPicking(i.key)
        setPickDate(i.reason === 'todo' && i.since && i.since > today ? i.since : addDays(today, 7))
      },
    })
    return { group: i.reason === 'todo' ? 'Snooze (moves the date)' : 'Snooze', items }
  }

  function primary(i: TodayItem): React.ReactNode {
    const busy = busyKey === i.key
    const biz = i.business_id ? `/businesses/${i.business_id}` : null
    switch (i.reason) {
      case 'todo':
        return (
          <button
            type="button"
            disabled={busy}
            className={rowButtonClass}
            onClick={() => run(i.key, () => (i.todo_kind === 'flag' ? clearFollowUpFlag(i.ref_id!) : updateTask(i.ref_id!, { status: 'done' })), 'Done')}
          >
            {busy ? 'Saving…' : 'Done'}
          </button>
        )
      case 'money_owed':
        return <Link href={biz!} className={rowButtonClass} title="Open the business to see the contact and write a chaser">Chase</Link>
      case 'renewal':
        return <Link href={`${biz}?tab=details`} className={rowButtonClass} title="Open the deal to record the new contract">Log renewal</Link>
      case 'waiting_on_you':
        return <Link href={biz!} className={rowButtonClass} title="Open the business to read the email and reply">Reply</Link>
      case 'club_card_lapsed':
      case 'club_card':
        return i.ref_id ? (
          <a href={`https://chiswickcalendar.co.uk/?page_id=${i.ref_id}`} target="_blank" rel="noopener noreferrer" className={rowButtonClass} title="Open the member page on the website (new tab)">
            Open page
          </a>
        ) : (
          <Link href={`${biz}?tab=details`} className={rowButtonClass} title="Open the business's Club Card section">Club Card details</Link>
        )
    }
  }

  function more(i: TodayItem): MenuEntry[] {
    const biz = i.business_id ? `/businesses/${i.business_id}` : null
    const list: MenuEntry[] = []
    if (i.reason === 'money_owed') {
      list.push({
        label: 'Mark paid',
        hint: 'Hidden for 7 days while QuickBooks catches up',
        onSelect: () => run(i.key, () => snoozeBusinessAttention(i.business_id!, addDays(today, 7)), `${i.business_name}: hidden for 7 days while QuickBooks catches up`),
      })
    }
    if (i.reason === 'renewal') {
      list.push({
        label: 'Not renewing',
        onSelect: () => {
          if (!window.confirm(`Mark ${i.business_name} as not renewing?`)) return
          run(i.key, () => updateBusinessRenewalStage(i.business_id!, 'not_renewing'), `${i.business_name}: not renewing`)
        },
      })
    }
    if (i.reason === 'waiting_on_you') {
      list.push({
        label: 'No reply needed',
        onSelect: () => run(i.key, () => dismissWaitingReplies(i.business_id!), `${i.business_name}: no reply needed`),
      })
    }
    if ((i.reason === 'club_card_lapsed' || i.reason === 'club_card') && i.ref_id && biz) {
      list.push({ label: 'Club Card details', href: `${biz}?tab=details` })
    }
    if (i.reason === 'todo' && i.todo_kind === 'task' && !i.for_newsletter && i.ref_id) {
      list.push({ label: 'For newsletter', hint: "Add to Wednesday's list", onSelect: () => { addToNewsletter('task', i.ref_id!).then((ok) => ok && router.refresh()) } })
    }
    if (biz) list.push({ label: 'Open business', href: biz })
    const s = snoozeGroup(i)
    if (s) list.push(s)
    return list
  }

  function pickForm(i: TodayItem) {
    const todo = i.reason === 'todo'
    return (
      <form
        className="flex flex-wrap gap-2 items-end bg-brand-warm border border-black/[0.06] rounded-sm p-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (pickDate) snoozeTo(i, pickDate)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setPicking(null)
          }
        }}
      >
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">{todo ? 'Move to' : 'Snooze until'}</span>
          <input
            type="date"
            autoFocus
            value={pickDate}
            min={todo ? today : addDays(today, 1)}
            onChange={(e) => setPickDate(e.target.value)}
            className="text-sm border border-black/[0.12] rounded-sm px-2 min-h-10 md:min-h-8 bg-white"
            required
          />
        </label>
        <button type="submit" disabled={busyKey === i.key || !pickDate} className={rowButtonClass}>{todo ? 'Save date' : 'Snooze'}</button>
        <button type="button" onClick={() => setPicking(null)} className={rowButtonClass}>Cancel</button>
      </form>
    )
  }

  function row(i: TodayItem) {
    const age = daysFrom(i.since, today)
    const late = i.reason !== 'waiting_on_you' && age !== null && age > 0
    const also = i.other_reasons.length > 0 ? `Also: ${i.other_reasons.map((r) => REASON_LABEL[r]).join(', ')}` : ''
    const title = i.business_name ?? i.detail
    const detail = [i.business_name ? i.detail : '', also].filter(Boolean).join(' · ')
    return (
      <ItemRow
        key={i.key}
        tag={REASON_LABEL[i.reason]}
        tagClassName={TAG_TONE[i.reason]}
        title={title || 'To-do'}
        href={i.business_id ? `/businesses/${i.business_id}` : null}
        detail={detail}
        meta={`${ageWords(i, today)}${i.since ? ` · ${dateGB(i.since)}` : ''}`}
        metaClassName={late ? 'text-red-700 font-semibold' : undefined}
        actions={
          <>
            {primary(i)}
            <ActionMenu entries={more(i)} accessibleLabel={`More actions for ${title}`} />
          </>
        }
        below={picking === i.key ? pickForm(i) : undefined}
      />
    )
  }

  const total = items.length

  const work = (
    <FullScreenPanel title="Do now" headingId="donow-h">
      <WorkBody
        doNow={doNow}
        rest={rest}
        snoozed={snoozed}
        row={row}
        wake={(id, name) => run(`wake:${id}`, () => snoozeBusinessAttention(id, null), `${name} is back on the list`)}
        busyKey={busyKey}
      />
    </FullScreenPanel>
  )

  const side = (
    <div className="space-y-8">
      <TodayCalendar today={today} initialItems={calendar} onChanged={() => { refreshNav(); router.refresh() }} />
      <NewsletterList initial={newsletter} onChanged={() => { refreshNav(); router.refresh() }} />
      <section aria-labelledby="add-h" className="space-y-2">
        <h2 id="add-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>I&apos;ll do this by…</h2>
        <TodayQuickAdd today={today} onAdded={() => { refreshNav(); router.refresh() }} />
      </section>
      <section aria-labelledby="other-h" className="space-y-2">
        <h2 id="other-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Other things</h2>
        <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06] text-sm">
          <li className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-brand-dark">{data.newLeads} new lead{data.newLeads === 1 ? '' : 's'}</span>
            <span className="text-xs text-gray-600">from the prospecting routine</span>
            <Link href="/businesses?view=leads" className="ml-auto inline-flex items-center min-h-10 md:min-h-8 text-xs font-semibold text-brand-navy hover:underline">Open Leads</Link>
          </li>
          {data.clubCardToMatch > 0 && (
            <li className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-brand-dark">{data.clubCardToMatch} Club Card page{data.clubCardToMatch === 1 ? '' : 's'} to match</span>
              <Link href="/businesses/club-card-pages" className="ml-auto inline-flex items-center min-h-10 md:min-h-8 text-xs font-semibold text-brand-navy hover:underline">Match them</Link>
            </li>
          )}
          <li className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-brand-dark">{data.draftsReady} draft{data.draftsReady === 1 ? '' : 's'} ready</span>
            <span className="text-xs text-gray-600">from the routines, last 14 days; each is on its business page</span>
            <a href={OUTLOOK_DRAFTS} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center min-h-10 md:min-h-8 text-xs font-semibold text-brand-navy hover:underline">
              Open Outlook Drafts<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
          <li className="py-2">
            <details className="group">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex flex-wrap items-center gap-x-3 gap-y-1 min-h-8">
                <span className="font-semibold text-brand-dark">{quiet.length} quiet reminder{quiet.length === 1 ? '' : 's'}</span>
                <span className="text-xs text-gray-600">stats, check-ins and editorial; not counted</span>
                <span className="ml-auto text-xs font-semibold text-brand-navy group-open:hidden">Show</span>
                <span className="ml-auto text-xs font-semibold text-brand-navy hidden group-open:inline">Hide</span>
              </summary>
              <ItemList className="mt-2">
                {quiet.map((q) => (
                  <ItemRow
                    key={q.id}
                    tag={QUIET_LABEL[q.kind]}
                    tagClassName="bg-gray-100 text-gray-700"
                    title={q.title}
                    href={q.business_id ? `/businesses/${q.business_id}` : null}
                    meta={q.due_date ? dateGB(q.due_date) : undefined}
                    actions={
                      <button
                        type="button"
                        disabled={busyKey === `quiet:${q.id}`}
                        className={rowButtonClass}
                        onClick={() => run(`quiet:${q.id}`, () => updateTask(q.id, { status: 'done' }), 'Done')}
                      >
                        Done
                      </button>
                    }
                  />
                ))}
                {quiet.length === 0 && <li className="py-2 text-xs text-gray-600">None.</li>}
              </ItemList>
            </details>
          </li>
        </ul>
      </section>
    </div>
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Today</h1>
        <p className="text-sm text-gray-700 mt-1">
          <strong className="text-brand-dark">{doNow.length} to do now.</strong>{' '}
          {total - doNow.length} more in Everything else, nothing hidden.
          {data.owed > 0 && <> £{data.owed.toLocaleString('en-GB', { maximumFractionDigits: 2 })} owed.</>}
        </p>
      </header>
      <ResizableSplit storageKey="cc.today.split" defaultPercent={58} label="Resize the Today columns" first={work} second={side} />
    </div>
  )
}

/** Do now and Everything else: the body of the work panel, which can go full screen. */
function WorkBody({
  doNow,
  rest,
  snoozed,
  row,
  wake,
  busyKey,
}: {
  doNow: TodayItem[]
  rest: TodayItem[]
  snoozed: TodayData['snoozed']
  row: (i: TodayItem) => React.ReactNode
  wake: (businessId: string, name: string) => void
  busyKey: string | null
}) {
  const full = useFullScreen()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [showAll, setShowAll] = useState(false)

  // The chosen chip is remembered in this browser.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTER_STORE) as FilterKey | null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of a saved preference on mount
      if (saved) setFilter(saved)
    } catch {
      // storage blocked: start on All
    }
  }, [])
  const choose = (k: FilterKey) => {
    setFilter(k)
    setShowAll(false)
    try {
      if (k === 'all') window.localStorage.removeItem(FILTER_STORE)
      else window.localStorage.setItem(FILTER_STORE, k)
    } catch {
      // storage blocked
    }
  }

  const sorted = useMemo(() => [...rest].sort(groupOrder), [rest])
  const chips: Chip<FilterKey>[] = [
    { key: 'all', label: 'All', count: rest.length },
    ...GROUPS.map((g) => ({ key: g.reason as FilterKey, label: g.chip, count: rest.filter((i) => i.reason === g.reason).length })).filter((c) => c.count > 0),
    ...(snoozed.length > 0 ? [{ key: 'snoozed' as FilterKey, label: 'Snoozed', count: snoozed.length }] : []),
  ]
  // A remembered chip that has nothing in it today falls back to All.
  const active: FilterKey = chips.some((c) => c.key === filter) ? filter : 'all'
  const list = active === 'all' || active === 'snoozed' ? sorted : sorted.filter((i) => i.reason === active)
  const limit = full || showAll ? Infinity : REST_LIMIT
  const hint = GROUPS.find((g) => g.reason === active)?.hint

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <details className="text-xs text-gray-700">
          <summary className="cursor-pointer text-brand-navy font-semibold inline-block min-h-8 py-1">How these are picked</summary>
          <p className="max-w-[70ch] border-l-[3px] border-brand-olive pl-3 mt-1">
            At most 8, picked by plain rules: money more than 30 days overdue, a renewal that ended in the last 30 days or ends within a week,
            an email waiting a week or more, a to-do past its date. Most pressing first. Each line goes by itself when the thing is done.
          </p>
        </details>
        {doNow.length === 0 ? (
          <p className="text-sm text-gray-700 py-3">Nothing pressing. Everything else is below.</p>
        ) : (
          <ItemList label="Do now">{doNow.map(row)}</ItemList>
        )}
      </div>

      <section aria-labelledby="rest-h" className="space-y-2">
        <h2 id="rest-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Everything else</h2>
        <FilterChips chips={chips} value={active} onChange={choose} label="Show" />
        {hint && <p className="text-xs text-gray-700">{hint}</p>}
        {active === 'snoozed' ? (
          <ItemList label="Snoozed">
            {snoozed.map((s) => (
              <ItemRow
                key={s.business_id}
                tag="Snoozed"
                tagClassName="bg-gray-100 text-gray-700"
                title={s.business_name}
                href={`/businesses/${s.business_id}`}
                detail={REASON_LABEL[s.reason as TodayReason] ?? s.reason}
                meta={s.until ? `until ${dateGB(s.until)}` : undefined}
                actions={
                  <button type="button" disabled={busyKey === `wake:${s.business_id}`} className={rowButtonClass} onClick={() => wake(s.business_id, s.business_name)}>
                    Wake now
                  </button>
                }
              />
            ))}
          </ItemList>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-700 py-2">Nothing else waiting.</p>
        ) : (
          <>
            <ItemList label="Everything else">{list.slice(0, limit).map(row)}</ItemList>
            {list.length > limit && (
              <button type="button" className={rowButtonClass} onClick={() => setShowAll(true)}>
                Show all {list.length}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
