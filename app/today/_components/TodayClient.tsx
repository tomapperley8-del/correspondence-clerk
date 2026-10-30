'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn, formatDateGB } from '@/lib/utils'
import { snoozeBusinessAttention, dismissWaitingReplies } from '@/app/actions/attention'
import { updateBusinessRenewalStage } from '@/app/actions/businesses'
import { updateTask } from '@/app/actions/tasks'
import {
  clearFollowUpFlag, moveFollowUpFlag, getTodayDetail, deleteTodayTask, undoDeleteTodayTask, linkTaskToBusiness, getBusinessNames,
  type TodayData, type TodayDetail, type QuietReminder,
} from '@/app/actions/today'
import { markInvoiceVoid } from '@/app/actions/invoices'
import {
  markNewsletterUsed, deleteNewsletterItem, undoDeleteNewsletterItem, moveNewsletterItem, changeNewsletterKind, changeTaskKind,
  type CalendarItem, type NewsletterItem,
} from '@/app/actions/calendar'
import { CALENDAR_KINDS, type CalendarKind } from '@/lib/calendar'
import { REASON_LABEL, addDays, ageWords, daysFrom, isOverdue, todayOrder, type TodayItem, type TodayReason } from '@/lib/today'
import { TodayQuickAdd } from './TodayQuickAdd'
import { TodayCalendar, CALENDAR_CHANGED } from './TodayCalendar'
import { addToNewsletter } from '@/components/ForNewsletterButton'
import { ActionMenu, type MenuItem } from '@/components/ui/action-menu'
import { FoldSection } from '@/components/ui/fold-section'
import { FullScreenPanel, useFullScreen } from '@/components/ui/full-screen-panel'
import { KIND, KindTag, type KindColour } from '@/components/ui/kind'
import { ResizableSplit } from '@/components/ui/resizable-split'

// Today v2 (UI overhaul Stage 14a v2, mockup B, Tom 23 Oct). One list of
// everything needing attention, overdue first and then most pressing, with
// filter chips and "+ Add" above it. Each row is two lines: the name in bold
// with a coloured age pill, and one grey line of detail. Choosing a row (click,
// or Up/Down and Enter) fills the detail panel on the right: the deal, the main
// contact (Hard Rule 4), the facts behind the reason and every action as a
// labelled button. This week's calendar sits under the panel. On a phone the
// detail opens under its row and the calendar follows the list. Colours are
// the Mastersheet palette of the Businesses table. Nothing is ticked here but
// to-dos and newsletter items: a line goes when its cause goes.
//
// Stage 14c ("nothing out of sight", Tom 29 Oct): your to-dos have their own
// box at the top, overdue first, with + Add to-do inside; every other kind is a
// folded section with its count (the chips went: the headings carry the same
// counts), so every heading is on the first screen. Open sections, the detail
// panel and the calendar scroll inside themselves.

const OUTLOOK_DRAFTS = 'https://outlook.office.com/mail/drafts'
const OVERDUE_HINT =
  'The nav badge counts these: money more than 30 days overdue, a renewal ended in the last 30 days or ending within a week, an email waiting a week or more, a to-do past its date.'

type Kind = TodayReason | 'newsletter' | 'snoozed'

type Row = {
  key: string
  kind: Kind
  business_id: string | null
  business_name: string | null
  title: string
  detail: string
  pill: { text: string; tone: Tone }
  overdue: boolean
  item?: TodayItem
  nl?: NewsletterItem
  snooze?: TodayData['snoozed'][number]
}

type Tone = 'red' | 'orange' | 'yellow' | 'blue' | 'green' | 'muted'
const TONE: Record<Tone, string> = {
  red: 'bg-ms-red text-ms-red-text',
  orange: 'bg-ms-orange text-ms-orange-text',
  yellow: 'bg-ms-yellow text-ms-yellow-text',
  blue: 'bg-ms-blue text-ms-blue-text',
  green: 'bg-ms-green text-ms-green-text',
  muted: 'bg-ms-muted text-ms-muted-text',
}

const SECTIONS: { key: Kind; label: string; hint: string }[] = [
  { key: 'money_owed', label: 'Money', hint: 'QuickBooks invoices past due, with no chaser in the last 7 days.' },
  { key: 'renewal', label: 'Renewals', hint: 'Ending in the next 45 days or ended in the last 60, with no outcome recorded.' },
  { key: 'club_card_lapsed', label: 'Lapsed cards', hint: 'The card ended more than 60 days ago (or is not renewing) but the website page is still up.' },
  { key: 'waiting_on_you', label: 'Waiting on you', hint: 'They wrote in the last 30 days and nothing has gone back.' },
  { key: 'todo', label: 'To-dos', hint: 'Everything you have said you will do, and follow-up flags that are due.' },
  { key: 'club_card', label: 'Card pages', hint: 'Member pages on the website to fix: no page, offer out of date, missing from the A-Z, map or a category, listed twice, or details that differ.' },
  { key: 'newsletter', label: 'Newsletter', hint: "For Wednesday's newsletter. Mark each \"It has gone in\" once it has; Snooze moves one to another date, Change to makes it a to-do, call, meeting, event or deadline." },
  { key: 'snoozed', label: 'Snoozed', hint: 'Hidden until the date shown. Wake one to put it back now.' },
]

const KIND_LABEL: Record<Kind, string> = { ...REASON_LABEL, newsletter: 'Newsletter', snoozed: 'Snoozed' }

/** Each kind's colour (Stage 14d house style), the same on every tab and the calendar. */
const KIND_COLOUR: Record<Kind, KindColour> = {
  money_owed: 'money',
  renewal: 'renewal',
  club_card_lapsed: 'card',
  waiting_on_you: 'waiting',
  todo: 'todo',
  club_card: 'card',
  newsletter: 'newsletter',
  snoozed: 'neutral',
}

const NL_LABEL: Record<NewsletterItem['kind'], string> = {
  task: 'For newsletter',
  commitment: 'You said you would',
  editorial: 'Promote my event',
}

const QUIET_LABEL: Record<QuietReminder['kind'], string> = {
  checkin: 'Club Card check-in',
  stats: 'Advertiser stats',
  editorial: 'Editorial',
}

const SNOOZE_DAYS = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
]

const H2 = 'text-[1.6rem] leading-tight font-semibold text-brand-dark'
const CARD = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'
const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
/** The main action in the detail panel: Mastersheet green. */
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`
const linkBtn = 'text-xs font-semibold text-brand-navy hover:underline inline-flex items-center min-h-10 md:min-h-8'

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)
const moneyGB = (n: number | null) => (n === null ? '' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

function refreshNav() {
  window.dispatchEvent(new Event('cc:nav-refresh'))
}

/** The age pill: red only past a real deadline; orange close to one; blue for later dates. */
function pillFor(i: TodayItem, today: string): Row['pill'] {
  const age = daysFrom(i.since, today)
  const text = ageWords(i, today)
  if (age === null) return { text, tone: 'muted' }
  switch (i.reason) {
    case 'money_owed':
      return { text, tone: age > 0 ? 'red' : 'orange' }
    case 'renewal':
      return { text, tone: age > 0 ? 'red' : age >= -14 ? 'orange' : 'blue' }
    case 'waiting_on_you':
      return { text, tone: age >= 7 ? 'orange' : 'yellow' }
    case 'todo':
      return { text, tone: age >= 1 ? 'red' : age === 0 ? 'orange' : 'blue' }
    case 'club_card_lapsed':
    case 'club_card':
      return { text, tone: 'muted' }
  }
}

function itemRow(i: TodayItem, today: string): Row {
  const also = i.other_reasons.length > 0 ? `Also: ${i.other_reasons.map((r) => REASON_LABEL[r]).join(', ')}` : ''
  return {
    key: i.key,
    kind: i.reason,
    business_id: i.business_id,
    business_name: i.business_name,
    title: i.business_name ?? i.detail,
    detail: [i.business_name ? i.detail : REASON_LABEL[i.reason], also].filter(Boolean).join(' · '),
    pill: pillFor(i, today),
    overdue: isOverdue(i, today),
    item: i,
  }
}

function newsletterRow(n: NewsletterItem, asTodo: TodayItem | undefined, today: string): Row {
  // A newsletter task past its date counts as overdue, like any to-do (the badge counts it too).
  const late = !!asTodo && isOverdue(asTodo, today)
  return {
    key: `nl:${n.key}`,
    kind: 'newsletter',
    business_id: n.business_id,
    business_name: n.business_name,
    title: n.business_name ?? n.title,
    detail: n.business_name ? `${NL_LABEL[n.kind]}: ${n.title}` : NL_LABEL[n.kind],
    pill: late ? { text: ageWords(asTodo!, today), tone: 'red' } : { text: n.date ? `newsletter ${dateGB(n.date).slice(0, 5)}` : 'newsletter', tone: 'green' },
    overdue: late,
    nl: n,
  }
}

function snoozedRow(s: TodayData['snoozed'][number]): Row {
  return {
    key: `snoozed:${s.business_id}`,
    kind: 'snoozed',
    business_id: s.business_id,
    business_name: s.business_name,
    title: s.business_name,
    detail: REASON_LABEL[s.reason as TodayReason] ?? s.reason,
    pill: { text: s.until ? `until ${dateGB(s.until).slice(0, 5)}` : 'snoozed', tone: 'muted' },
    overdue: false,
    snooze: s,
  }
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
  const [busy, setBusy] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [shownData, setShownData] = useState(data)
  const [details, setDetails] = useState<Map<string, TodayDetail | 'loading' | 'error'>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  /** On a phone the detail opens under its row only once a row is chosen. */
  const [opened, setOpened] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showQuiet, setShowQuiet] = useState(false)
  const { today } = data

  // Rows cleared here stay hidden until fresh data arrives, which leaves them
  // out by itself; fresh data also means the cached details are stale.
  if (data !== shownData) {
    setShownData(data)
    setGone(new Set())
    setDetails(new Map())
  }

  const rows = useMemo<Row[]>(() => {
    // A newsletter task shows once, under Newsletter, not again as a to-do.
    const onNewsletter = new Set(newsletter.items.filter((n) => n.kind !== 'commitment').map((n) => n.ref_id))
    const list = todayOrder(data.items.filter((i) => !(i.todo_kind === 'task' && i.ref_id && onNewsletter.has(i.ref_id))), today).map((i) => itemRow(i, today))
    const asTodo = new Map(data.items.filter((i) => i.todo_kind === 'task' && i.ref_id).map((i) => [i.ref_id!, i]))
    list.push(...newsletter.items.map((n) => newsletterRow(n, n.kind === 'commitment' ? undefined : asTodo.get(n.ref_id), today)))
    list.push(...data.snoozed.map(snoozedRow))
    return list.filter((r) => !gone.has(r.key))
  }, [data.items, data.snoozed, newsletter.items, today, gone])

  const overdueCount = rows.filter((r) => r.overdue).length
  const quiet = data.quiet.filter((q) => !gone.has(`quiet:${q.id}`))

  function changed() {
    refreshNav()
    window.dispatchEvent(new Event(CALENDAR_CHANGED))
    router.refresh()
  }

  function run(key: string, action: () => Promise<{ error?: string | null }>, message: string, clears = true) {
    setBusy(key)
    startTransition(async () => {
      const result = await action()
      setBusy(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(message)
      if (clears) setGone((prev) => new Set(prev).add(key))
      changed()
    })
  }

  function remove(row: Row, taskId: string) {
    setBusy(row.key)
    startTransition(async () => {
      const result = await deleteTodayTask(taskId)
      setBusy(null)
      if (result.error || result.backupId === undefined) {
        toast.error(result.error ?? 'Not deleted')
        return
      }
      setGone((prev) => new Set(prev).add(row.key))
      const backupId = result.backupId
      toast.undo(`Deleted: ${row.nl?.title ?? row.item?.detail ?? row.title}`, async () => {
        const undo = await undoDeleteTodayTask(backupId)
        if (undo.error) toast.error(undo.error)
        else {
          toast.success('Put back')
          setGone((prev) => {
            const next = new Set(prev)
            next.delete(row.key)
            return next
          })
          changed()
        }
      })
      changed()
    })
  }

  /** Delete a newsletter item of any kind, with Undo (Tom, 28 Oct). */
  function removeNewsletter(row: Row, n: NewsletterItem) {
    setBusy(row.key)
    startTransition(async () => {
      const result = await deleteNewsletterItem(n.kind, n.ref_id)
      setBusy(null)
      if (result.error || !result.undo) {
        toast.error(result.error ?? 'Not deleted')
        return
      }
      setGone((prev) => new Set(prev).add(row.key))
      const undo = result.undo
      toast.undo(`Taken off the newsletter: ${n.title}`, async () => {
        const back = await undoDeleteNewsletterItem(undo)
        if (back.error) toast.error(back.error)
        else {
          toast.success('Put back')
          setGone((prev) => {
            const next = new Set(prev)
            next.delete(row.key)
            return next
          })
          changed()
        }
      })
      changed()
    })
  }

  async function loadDetail(businessId: string, force = false) {
    if (!force && details.has(businessId) && details.get(businessId) !== 'error') return
    setDetails((m) => new Map(m).set(businessId, 'loading'))
    const result = await getTodayDetail(businessId)
    setDetails((m) => new Map(m).set(businessId, result.data ?? 'error'))
  }

  function choose(row: Row, open: boolean) {
    setSelected(row.key)
    if (open) setOpened((o) => (o === row.key ? null : row.key))
    if (row.business_id) loadDetail(row.business_id)
  }

  const actions: PanelActions = { run, remove, removeNewsletter, busy, today, changed, wednesday: newsletter.wednesday }

  const todoRows = rows.filter((r) => r.kind === 'todo')
  const current = rows.find((r) => r.key === selected) ?? rows.find((r) => r.kind !== 'snoozed') ?? null
  const listProps = { selected: current?.key ?? null, opened, choose, renderInline: (row: Row) => <DetailPanel row={row} detail={row.business_id ? details.get(row.business_id) : undefined} actions={actions} inline /> }

  const todos = (
    <FoldSection
      storageKey="today.todos"
      title="Your to-dos"
      big
      band="todo"
      defaultOpen
      count={todoRows.length}
      badge={todoRows.some((r) => r.overdue) ? <span className="shrink-0 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-kind-overdue" style={{ fontFamily: 'var(--font-sans)' }}>{todoRows.filter((r) => r.overdue).length} overdue</span> : undefined}
      scroll="max-h-[10vh] sm:max-h-[16vh] lg:max-h-[24vh]"
      controls={
        <button type="button" className={`${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          + Add to-do
        </button>
      }
      className="shadow-[var(--shadow-sm)]"
    >
      {adding && (
        <div className="bg-ms-green/40 border-b border-ms-green p-3">
          <TodayQuickAdd
            today={today}
            wednesday={newsletter.wednesday}
            onCancel={() => setAdding(false)}
            onAdded={() => {
              setAdding(false)
              changed()
            }}
          />
        </div>
      )}
      {todoRows.length === 0 ? (
        <p className="text-sm text-gray-700 px-3 py-2">No to-dos. Use + Add to-do for anything you have said you will do.</p>
      ) : (
        <RowList rows={todoRows} label="Your to-dos" {...listProps} />
      )}
    </FoldSection>
  )

  // Under the list on a computer; under the calendar on a phone, so the calendar's heading stays on the first screen.
  const other = <OtherThings data={data} quiet={quiet} showQuiet={showQuiet} setShowQuiet={setShowQuiet} busy={busy} run={run} />

  const list = (
    <FullScreenPanel title="Needs attention" headingId="attention-h" band="attention" bodyClassName="p-0">
      <div>
        <AttentionList rows={rows.filter((r) => r.kind !== 'todo')} {...listProps} />
        <div className="hidden lg:block px-3 py-2 border-t border-black/[0.08]">{other}</div>
      </div>
    </FullScreenPanel>
  )

  // The panel follows the first row until one is chosen.
  useEffect(() => {
    if (!selected && current?.business_id) loadDetail(current.business_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per first row
  }, [current?.key, selected])

  const side = (
    <div className="space-y-3">
      <section
        id="today-detail"
        aria-label="Detail"
        className={cn(CARD, 'hidden lg:block p-4 max-h-[42vh] overflow-y-auto overscroll-contain')}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented && (e.target as HTMLElement).closest('[role="menu"]') === null) {
            document.querySelector<HTMLElement>('button[data-row][aria-current="true"], button[data-row][tabindex="0"]')?.focus()
          }
        }}
      >
        {current ? (
          <DetailPanel row={current} detail={current.business_id ? details.get(current.business_id) : undefined} actions={actions} />
        ) : (
          <p className="text-sm text-gray-700">Nothing needs attention. Choose a row to see it here.</p>
        )}
      </section>
      <TodayCalendar today={today} initialItems={calendar} onChanged={() => { refreshNav(); router.refresh() }} />
      <div className="lg:hidden">{other}</div>
    </div>
  )

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-2xl sm:text-3xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>Today</h1>
        <p className="text-sm text-gray-700">
          <strong className="text-ms-red-text">{overdueCount} overdue.</strong>{' '}
          {rows.filter((r) => r.kind !== 'snoozed').length} in the list<span className="hidden sm:inline">, nothing hidden</span>.
          {data.owed > 0 && <> £{data.owed.toLocaleString('en-GB', { maximumFractionDigits: 2 })} owed.</>}
        </p>
      </header>
      <ResizableSplit storageKey="cc.today.split.v2" defaultPercent={55} label="Resize the list and the detail panel" first={<div className="space-y-2 sm:space-y-3">{todos}{list}</div>} second={side} />
    </div>
  )
}

/** Leads, card pages to match, drafts and quiet reminders: one small line of links. */
function OtherThings({
  data,
  quiet,
  showQuiet,
  setShowQuiet,
  busy,
  run,
}: {
  data: TodayData
  quiet: QuietReminder[]
  showQuiet: boolean
  setShowQuiet: (v: boolean) => void
  busy: string | null
  run: PanelActions['run']
}) {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  return (
    <div className="text-xs text-gray-700">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-0">
        <Link href="/outreach" className={linkBtn}>{plural(data.newLeads, 'new lead')}</Link>
        {data.clubCardToMatch > 0 && <Link href="/businesses/club-card-pages" className={linkBtn}>{plural(data.clubCardToMatch, 'card page')} to match</Link>}
        <a href={OUTLOOK_DRAFTS} target="_blank" rel="noopener noreferrer" className={linkBtn}>
          {plural(data.draftsReady, 'draft')} ready in Outlook<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <button type="button" className={linkBtn} aria-expanded={showQuiet} onClick={() => setShowQuiet(!showQuiet)}>
          {plural(quiet.length, 'quiet reminder')} {showQuiet ? '(hide)' : '(show)'}
        </button>
      </p>
      {showQuiet && (
        <ul className="mt-1 divide-y divide-black/[0.05] border-y border-black/[0.05]">
          {quiet.map((q) => (
            <li key={q.id} className="py-1.5 flex flex-wrap items-center gap-x-3">
              <span className="text-ms-muted-text">{QUIET_LABEL[q.kind]}</span>
              {q.business_id ? <Link href={`/businesses/${q.business_id}`} className="font-semibold text-brand-dark hover:underline">{q.title}</Link> : <span className="font-semibold text-brand-dark">{q.title}</span>}
              {q.due_date && <span>{dateGB(q.due_date)}</span>}
              <button type="button" disabled={busy === `quiet:${q.id}`} className={`${linkBtn} ml-auto`} onClick={() => run(`quiet:${q.id}`, () => updateTask(q.id, { status: 'done' }), 'Done')}>
                Done<span className="sr-only">: {q.title}</span>
              </button>
            </li>
          ))}
          {quiet.length === 0 && <li className="py-1.5">None. Stats, check-ins and editorial reminders show here; they are not counted.</li>}
        </ul>
      )}
    </div>
  )
}

type ListProps = {
  selected: string | null
  opened: string | null
  choose: (row: Row, open: boolean) => void
  renderInline: (row: Row) => React.ReactNode
}

/**
 * One list of rows. Up and Down (and Home, End) move the choice through the
 * list; Enter opens it (on a phone, under the row). The chosen row, or else
 * the first, is the list's one Tab stop.
 */
function RowList({ rows, label, selected, opened, choose, renderInline, showKind = false }: ListProps & { rows: Row[]; label: string; showKind?: boolean }) {
  const listRef = useRef<HTMLUListElement>(null)
  const focusKey = rows.some((r) => r.key === selected) ? selected : rows[0]?.key

  function onKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]') ?? [])
    const at = buttons.findIndex((b) => b === document.activeElement)
    if (at < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))
    buttons[next].focus()
    buttons[next].scrollIntoView({ block: 'nearest' })
    const row = rows.find((r) => r.key === buttons[next].dataset.row)
    if (row) choose(row, false)
  }

  return (
    <ul ref={listRef} aria-label={label} onKeyDown={onKey}>
      {rows.map((r) => {
        const on = r.key === selected
        return (
          <li key={r.key} className="border-b border-ms-grid last:border-b-0">
            <button
              type="button"
              data-row={r.key}
              aria-label={`${r.title}. ${KIND_LABEL[r.kind]}: ${r.detail}. ${r.pill.text}${r.overdue ? ', overdue' : ''}`}
              aria-current={on ? 'true' : undefined}
              aria-expanded={opened === r.key}
              tabIndex={r.key === focusKey ? 0 : -1}
              onClick={(e) => {
                choose(r, true)
                // Enter on a computer: on to the detail panel's main action (Escape comes back).
                if (e.detail === 0 && window.matchMedia('(min-width: 1024px)').matches) {
                  window.setTimeout(() => document.querySelector<HTMLElement>('#today-detail [data-main]')?.focus(), 50)
                }
              }}
              className={cn(
                'w-full text-left flex items-start gap-3 px-3 py-2 border-l-[3px] transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy',
                on ? 'bg-ms-green/50 border-ms-band' : 'bg-white border-transparent hover:bg-brand-warm',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-brand-dark truncate" title={r.title}>{r.title}</span>
                <span className="block text-xs text-gray-600 truncate" title={r.detail}>
                  <span className="sr-only">{KIND_LABEL[r.kind]}: </span>{r.detail}
                </span>
              </span>
              {showKind && <KindTag kind={KIND_COLOUR[r.kind]} className="mt-0.5 hidden sm:inline-flex">{KIND_LABEL[r.kind]}</KindTag>}
              <span className={cn('shrink-0 mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', TONE[r.pill.tone])}>{r.pill.text}</span>
            </button>
            {opened === r.key && <div className="lg:hidden px-3 pb-3 pt-1 bg-ms-green/20">{renderInline(r)}</div>}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Everything but your to-dos, as folded sections with counts: Overdue first,
 * then one per kind holding the rest, then Snoozed. Which are open is
 * remembered in this browser; an open one scrolls inside itself (full screen
 * shows them at full height).
 */
function AttentionList({ rows, ...listProps }: ListProps & { rows: Row[] }) {
  const full = useFullScreen()
  const live = rows.filter((r) => r.kind !== 'snoozed')
  const groups: { key: string; label: string; hint?: string; rows: Row[] }[] = [
    { key: 'overdue', label: 'Overdue', hint: OVERDUE_HINT, rows: live.filter((r) => r.overdue) },
    ...SECTIONS.filter((c) => c.key !== 'todo').map((c) => ({
      key: c.key as string,
      label: c.label,
      hint: c.hint,
      rows: c.key === 'snoozed' ? rows.filter((r) => r.kind === 'snoozed') : live.filter((r) => r.kind === c.key && !r.overdue),
    })),
  ].filter((g) => g.rows.length > 0)

  if (groups.length === 0) return <p className="text-sm text-gray-700 px-3 py-3">Nothing needs attention.</p>
  return (
    <div>
      {groups.map((g) => (
        <FoldSection
          key={g.key}
          storageKey={`today.group.${g.key}`}
          heading="h3"
          title={g.label}
          count={g.rows.length}
          tone={g.key === 'overdue' ? 'alert' : 'plain'}
          kind={g.key === 'overdue' ? undefined : KIND_COLOUR[g.key as Kind]}
          hint={g.hint}
          scroll={full ? '' : 'max-h-[40vh]'}
        >
          <RowList rows={g.rows} label={g.label} showKind={g.key === 'overdue'} {...listProps} />
        </FoldSection>
      ))}
    </div>
  )
}

type PanelActions = {
  run: (key: string, action: () => Promise<{ error?: string | null }>, message: string, clears?: boolean) => void
  remove: (row: Row, taskId: string) => void
  removeNewsletter: (row: Row, n: NewsletterItem) => void
  busy: string | null
  today: string
  wednesday: string
  changed: () => void
}

/** The detail for one row: the deal, the main contact, the reason's facts and every action. */
function DetailPanel({ row, detail, actions, inline = false }: { row: Row; detail: TodayDetail | 'loading' | 'error' | undefined; actions: PanelActions; inline?: boolean }) {
  const { run, remove, removeNewsletter, busy, today } = actions
  const [picking, setPicking] = useState(false)
  const [pickDate, setPickDate] = useState('')
  const isBusy = busy === row.key
  const i = row.item
  const biz = row.business_id ? `/businesses/${row.business_id}` : null
  const loaded = detail && detail !== 'loading' && detail !== 'error' ? detail : null
  const glance = loaded?.glance

  // The deal from contracts (Stage 11b: the only source).
  const current = glance?.contracts.filter((c) => c.is_current) ?? []
  const types = new Set(current.map((c) => c.membership_type))
  const dealPill = types.has('club_card') && types.has('advertiser')
    ? { text: 'Club Card + Advertiser', cls: 'bg-white border border-ms-both-text text-ms-both-text' }
    : types.has('club_card')
      ? { text: 'Club Card', cls: 'bg-ms-clubcard text-white' }
      : types.has('advertiser')
        ? { text: 'Advertiser', cls: 'bg-ms-advertiser text-ms-advertiser-text' }
        : null
  const unpaid = (glance?.invoices ?? []).filter((v) => (v.balance ?? 0) > 0 && !v.voided_at)

  function snoozeTo(date: string) {
    setPicking(false)
    if (row.nl) {
      const n = row.nl
      run(row.key, () => moveNewsletterItem(n.kind, n.ref_id, date), `Moved to ${dateGB(date)}`, false)
      return
    }
    if (!i) return
    if (i.reason === 'todo') {
      run(i.key, () => (i.todo_kind === 'flag' ? moveFollowUpFlag(i.ref_id!, date) : updateTask(i.ref_id!, { due_date: date })), `Moved to ${dateGB(date)}`, false)
    } else {
      run(i.key, () => snoozeBusinessAttention(i.business_id!, date), `${i.business_name} snoozed until ${dateGB(date)}`)
    }
  }

  const snoozeItems: MenuItem[] = SNOOZE_DAYS.map(({ days, label }) => ({ label, hint: dateGB(addDays(today, days)), onSelect: () => snoozeTo(addDays(today, days)) }))
  snoozeItems.push({
    label: 'Pick a date…',
    onSelect: () => {
      setPicking(true)
      setPickDate(row.nl?.date && row.nl.date > today ? row.nl.date : i?.reason === 'todo' && i.since && i.since > today ? i.since : addDays(today, 7))
    },
  })
  const canSnooze = !!row.nl || (i && (i.reason === 'todo' ? !!i.ref_id : !!i.business_id))
  /** Dates move rather than hide for to-dos and newsletter items. */
  const moves = !!row.nl || i?.reason === 'todo'

  // "Change to…": a newsletter item or hand-written to-do becomes another kind (Tom, 28 Oct).
  const changeRef = row.nl ? row.nl : i?.reason === 'todo' && i.todo_kind === 'task' && i.ref_id ? i : null
  const changeItems: MenuItem[] = changeRef
    ? CALENDAR_KINDS.filter((k) => (row.nl ? k.value !== 'newsletter' : true)).map((k) => ({
        label: k.value === 'newsletter' ? 'Newsletter item' : k.label,
        onSelect: () => {
          const to = k.value as CalendarKind
          const said = k.value === 'newsletter' ? 'a newsletter item' : `a ${k.label.toLowerCase()}`
          run(row.key, () => (row.nl ? changeNewsletterKind(row.nl.kind, row.nl.ref_id, to) : changeTaskKind(i!.ref_id!, to)), `Changed to ${said}`)
        },
      }))
    : []

  // The main action, then the rest, all labelled (Hard Rule 9).
  const main: React.ReactNode = (() => {
    if (row.snooze) {
      return (
        <button type="button" disabled={isBusy} data-main className={mainBtn} onClick={() => run(row.key, () => snoozeBusinessAttention(row.business_id!, null), `${row.business_name} is back on the list`)}>
          Wake now
        </button>
      )
    }
    if (row.nl) {
      const n = row.nl
      return (
        <button type="button" disabled={isBusy} data-main className={mainBtn} onClick={() => run(row.key, () => markNewsletterUsed(n.kind, n.ref_id), 'Ticked off: it has gone in')}>
          {isBusy ? 'Saving…' : 'It has gone in'}
        </button>
      )
    }
    if (!i) return null
    switch (i.reason) {
      case 'todo':
        return (
          <button type="button" disabled={isBusy} data-main className={mainBtn} onClick={() => run(i.key, () => (i.todo_kind === 'flag' ? clearFollowUpFlag(i.ref_id!) : updateTask(i.ref_id!, { status: 'done' })), 'Done')}>
            {isBusy ? 'Saving…' : 'Done'}
          </button>
        )
      case 'money_owed':
        return <Link href={biz!} data-main className={mainBtn}>Chase: open the business</Link>
      case 'renewal':
        return <Link href={`${biz}?tab=details`} data-main className={mainBtn}>Log renewal</Link>
      case 'waiting_on_you':
        return <Link href={biz!} data-main className={mainBtn}>Reply: open the email</Link>
      case 'club_card_lapsed':
      case 'club_card':
        return i.ref_id ? (
          <a href={`https://chiswickcalendar.co.uk/?page_id=${i.ref_id}`} target="_blank" rel="noopener noreferrer" data-main className={mainBtn}>
            Open the page<span className="sr-only"> on the website (new tab)</span>
          </a>
        ) : (
          <Link href={`${biz}?tab=details`} data-main className={mainBtn}>Club Card details</Link>
        )
    }
  })()

  const more: React.ReactNode[] = []
  if (i?.reason === 'money_owed') {
    more.push(
      <button key="paid" type="button" disabled={isBusy} className={softBtn}
        onClick={() => run(i.key, () => snoozeBusinessAttention(i.business_id!, addDays(today, 7)), `${i.business_name}: hidden for 7 days while QuickBooks catches up`)}>
        Mark paid
      </button>,
    )
  }
  if (i?.reason === 'renewal') {
    more.push(
      <button key="nr" type="button" disabled={isBusy} className={softBtn}
        onClick={() => {
          if (!window.confirm(`Mark ${i.business_name} as not renewing?`)) return
          run(i.key, () => updateBusinessRenewalStage(i.business_id!, 'not_renewing'), `${i.business_name}: not renewing`)
        }}>
        Not renewing
      </button>,
    )
  }
  if (i?.reason === 'waiting_on_you') {
    more.push(
      <button key="nrn" type="button" disabled={isBusy} className={softBtn} onClick={() => run(i.key, () => dismissWaitingReplies(i.business_id!), `${i.business_name}: no reply needed`)}>
        No reply needed
      </button>,
    )
  }
  if (i?.reason === 'todo' && i.todo_kind === 'task' && !i.for_newsletter && i.ref_id) {
    more.push(
      <button key="nl" type="button" className={softBtn} onClick={() => { addToNewsletter('task', i.ref_id!).then((ok) => ok && actions.changed()) }}>
        For newsletter
      </button>,
    )
  } else if (i && i.reason !== 'todo' && i.business_id) {
    more.push(
      <button key="nlb" type="button" className={softBtn} onClick={() => { addToNewsletter('business', i.business_id!).then((ok) => ok && actions.changed()) }}>
        For newsletter
      </button>,
    )
  }
  // Delete: hand-written to-dos here; every newsletter item below.
  const deletable = i?.reason === 'todo' && i.todo_kind === 'task' && i.ref_id ? i.ref_id : null
  if (row.nl) {
    const n = row.nl
    more.push(
      <button key="del" type="button" disabled={isBusy} className={`${softBtn} text-ms-red-text`} onClick={() => removeNewsletter(row, n)}>
        Delete
      </button>,
    )
  } else if (deletable) {
    more.push(
      <button key="del" type="button" disabled={isBusy} className={`${softBtn} text-ms-red-text`} onClick={() => remove(row, deletable)}>
        Delete
      </button>,
    )
  }
  if (biz) more.push(<Link key="open" href={biz} className={softBtn}>Open business</Link>)

  // A to-do or newsletter task with no business can be attached to one.
  const attachable = !row.business_id ? (i?.todo_kind === 'task' ? i.ref_id : row.nl?.kind === 'task' ? row.nl.ref_id : null) : null
  const Heading = inline ? 'h3' : 'h2'

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className={inline ? 'text-lg font-semibold text-brand-dark' : H2} style={inline ? undefined : { fontFamily: 'var(--font-serif)' }}>
            {biz ? <Link href={biz} className="hover:underline">{row.title}</Link> : row.title}
          </Heading>
          {dealPill && <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', dealPill.cls)}>{dealPill.text}</span>}
        </div>
        <p className="text-sm text-gray-700">
          <span className={cn('font-semibold', KIND[KIND_COLOUR[row.kind]].text)}>{KIND_LABEL[row.kind]}</span>
          {' · '}
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', TONE[row.pill.tone])}>{row.pill.text}</span>
          {row.overdue && <span className="sr-only"> (overdue)</span>}
        </p>
      </div>

      {/* The facts behind the reason */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {i && <Fact term={i.reason === 'todo' ? 'To-do' : 'Why'}>{i.detail}</Fact>}
        {i?.since && <Fact term={i.reason === 'renewal' ? 'Contract end' : i.reason === 'money_owed' ? 'Due' : i.reason === 'waiting_on_you' ? 'Since' : 'Date'}>{dateGB(i.since)}</Fact>}
        {row.nl && <Fact term="Item">{row.nl.title}</Fact>}
        {row.nl?.date && <Fact term="For">{dateGB(row.nl.date)}</Fact>}
        {row.snooze?.until && <Fact term="Snoozed until">{dateGB(row.snooze.until)}</Fact>}
        {i?.reason === 'renewal' && current.map((c) => (
          <Fact key={c.id} term="Deal">
            {c.membership_type === 'club_card' ? 'Club Card' : c.membership_type === 'advertiser' ? 'Advertiser' : c.membership_type ?? 'Deal'}
            {c.contract_start && c.contract_end ? `, ${dateGB(c.contract_start)} to ${dateGB(c.contract_end)}` : ''}
            {c.contract_amount ? `, ${moneyGB(c.contract_amount)}` : ''}
          </Fact>
        ))}
        {loaded?.latestEmail && (
          <Fact term="Latest email">
            {loaded.latestEmail.direction === 'received' ? 'From them' : 'From you'}, {formatDateGB(loaded.latestEmail.entry_date)}
            {loaded.latestEmail.subject ? `: ${loaded.latestEmail.subject}` : ''}
          </Fact>
        )}
      </dl>

      {unpaid.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-700">Unpaid invoices</p>
          <ul className="border-t border-ms-grid text-sm">
            {unpaid.map((v) => {
              const late = v.due_date ? (daysFrom(v.due_date, today) ?? 0) > 0 : false
              const key = `void:${v.qbo_invoice_id}`
              return (
                <li key={v.qbo_invoice_id} className="border-b border-ms-grid py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-brand-dark">{v.doc_number ? `No. ${v.doc_number}` : 'Invoice'}</span>
                  <span>{moneyGB(v.balance)}</span>
                  {v.due_date && <span className={late ? 'text-ms-red-text' : 'text-gray-600'}>due {dateGB(v.due_date)}</span>}
                  <button
                    type="button"
                    disabled={busy === key}
                    className={`${linkBtn} ml-auto`}
                    onClick={() => {
                      if (!window.confirm(`Mark invoice ${v.doc_number ?? ''} void? It stops counting as owed everywhere in the app. Void it in QuickBooks yourself as well.`)) return
                      run(key, () => markInvoiceVoid(v.qbo_invoice_id), `Invoice ${v.doc_number ?? ''} marked void`, false)
                    }}
                  >
                    Mark void<span className="sr-only">: invoice {v.doc_number}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Main contact, always with role, email and phone (Hard Rule 4) */}
      {row.business_id && (
        <div className="text-sm space-y-0.5">
          <p className="text-xs font-semibold text-gray-700">Main contact</p>
          {detail === 'loading' || detail === undefined ? (
            <p className="text-gray-600">Loading…</p>
          ) : detail === 'error' ? (
            <p className="text-ms-red-text">Could not load the contact. <Link href={biz!} className="underline">Open the business</Link></p>
          ) : loaded?.contact ? (
            <>
              <p>
                <span className="font-semibold text-brand-dark">{loaded.contact.name}</span>
                {loaded.contact.role ? `, ${loaded.contact.role}` : <span className="text-gray-600">, no role recorded</span>}
                {!loaded.contact.manual && <span className="text-xs text-gray-600"> (chosen automatically)</span>}
              </p>
              <p>
                Email:{' '}
                {loaded.contact.emails.length > 0
                  ? loaded.contact.emails.map((e, n) => <span key={e}>{n > 0 && ', '}<a href={`mailto:${e}`} className="text-brand-navy hover:underline break-all">{e}</a></span>)
                  : <span className="text-gray-600">none recorded</span>}
              </p>
              <p>
                Phone:{' '}
                {loaded.contact.phones.length > 0
                  ? loaded.contact.phones.map((p, n) => <span key={p}>{n > 0 && ', '}<a href={`tel:${p.replace(/\s/g, '')}`} className="text-brand-navy hover:underline">{p}</a></span>)
                  : <span className="text-gray-600">none recorded</span>}
              </p>
            </>
          ) : (
            <p className="text-gray-600">No named contact yet. <Link href={biz!} className="text-brand-navy hover:underline">Add one on the business page</Link></p>
          )}
          {loaded?.website && (
            <p>Website: <a href={loaded.website.startsWith('http') ? loaded.website : `https://${loaded.website}`} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline break-all">{loaded.website}</a></p>
          )}
        </div>
      )}

      {attachable && <AttachBusiness taskId={attachable} onDone={actions.changed} />}

      <div className="flex flex-wrap gap-2 items-center">
        {main}
        {more}
        {canSnooze && <ActionMenu label="Snooze" accessibleLabel={`Snooze ${row.title}`} entries={[{ group: moves ? 'Snooze (moves the date)' : 'Snooze', items: snoozeItems }]} />}
        {changeItems.length > 0 && <ActionMenu label="Change to" accessibleLabel={`Change to: ${row.title}`} entries={[{ group: 'Change it to', items: changeItems }]} />}
      </div>

      {picking && (
        <form
          className="flex flex-wrap gap-2 items-end bg-brand-warm border border-black/[0.06] rounded-sm p-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (pickDate) snoozeTo(pickDate)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setPicking(false)
            }
          }}
        >
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">{moves ? 'Move to' : 'Snooze until'}</span>
            <input type="date" autoFocus value={pickDate} min={moves ? today : addDays(today, 1)} onChange={(e) => setPickDate(e.target.value)} className="text-sm border border-black/[0.12] rounded-sm px-2 min-h-10 md:min-h-8 bg-white" required />
          </label>
          <button type="submit" disabled={isBusy || !pickDate} data-main className={mainBtn}>{moves ? 'Save date' : 'Snooze'}</button>
          <button type="button" onClick={() => setPicking(false)} className={softBtn}>Cancel</button>
        </form>
      )}
    </div>
  )
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-600">{term}</dt>
      <dd className="text-brand-dark min-w-0 break-words">{children}</dd>
    </>
  )
}

/** Attach a to-do or newsletter item to a business by name. */
function AttachBusiness({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [names, setNames] = useState<{ id: string; name: string }[] | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const listId = `attach-${taskId}`
  return (
    <form
      className="flex flex-wrap gap-2 items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        const match = (names ?? []).find((b) => b.name.toLowerCase() === value.trim().toLowerCase())
        if (!match) {
          toast.error('Pick the business from the list')
          return
        }
        setSaving(true)
        const result = await linkTaskToBusiness(taskId, match.id)
        setSaving(false)
        if (result.error) toast.error(result.error)
        else {
          toast.success(`Attached to ${match.name}`)
          onDone()
        }
      }}
    >
      <label className="block flex-1 min-w-[180px]">
        <span className="block text-xs font-semibold text-gray-700 mb-1">Attach to a business</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => { if (!names) getBusinessNames().then(setNames).catch(() => setNames([])) }}
          list={listId}
          placeholder="Start typing a name"
          className="w-full text-sm border border-black/[0.12] rounded-sm px-2.5 min-h-10 bg-white"
        />
        <datalist id={listId}>{(names ?? []).map((b) => <option key={b.id} value={b.name} />)}</datalist>
      </label>
      <button type="submit" disabled={saving || !value.trim()} className={softBtn}>{saving ? 'Saving…' : 'Attach'}</button>
    </form>
  )
}
