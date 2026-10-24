'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import { updateTask } from '@/app/actions/tasks'
import { deleteTodayTask, getBusinessNames, undoDeleteTodayTask } from '@/app/actions/today'
import { addCalendarItem, getCalendarItems, moveCalendarItem, type CalendarItem } from '@/app/actions/calendar'
import { addDays } from '@/lib/today'
import { FullScreenPanel, panelButtonClass } from '@/components/ui/full-screen-panel'
import { CALENDAR_KINDS, addMonths, isWednesday, monthGrid, monthStart, weekStart, type CalendarKind } from '@/lib/calendar'

// The work calendar on Today (UI overhaul Stage 12). Week view by default,
// month on a toggle. Click a day to add a to-do, call, meeting, event,
// deadline or newsletter item; drag an item to another day to move it (or
// open it and change the date, which is how it works on a phone). Renewals
// ending and invoices due are markers that open their business. Everything is
// a task, so it shows wherever tasks do.
// Stage 14a: it sits in Today's right-hand column, where the week is a list of
// days (it lays itself out by its own width, not the window's), and has a Full
// screen button: there the week gets tall columns and the month roomy days.

export const CALENDAR_CHANGED = 'cc:calendar-changed'

/** A busy day in week view shows this many items, one line each, then "Show N more" (full screen shows them all, in full). */
const WEEK_DAY_LIMIT = 3

const btnBase = 'inline-flex items-center text-xs font-semibold px-2.5 min-h-10 md:min-h-8 pointer-coarse:min-h-10 border rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const btn = `${btnBase} border-black/[0.12] bg-white text-brand-navy hover:bg-brand-warm`
const btnOn = `${btnBase} border-brand-navy bg-brand-navy text-white hover:bg-brand-navy-hover`
const input = 'text-sm border border-black/[0.12] rounded-sm px-2.5 py-2 bg-white'

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)
const dayName = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

function tone(i: CalendarItem): string {
  // A coloured edge and plain text; the words ("invoice due", "Meeting:") say the kind.
  if (i.kind === 'renewal') return 'border-l-2 border-amber-500 text-amber-800'
  if (i.kind === 'invoice') return 'border-l-2 border-red-600 text-red-800'
  if (i.done) return 'border-l-2 border-gray-300 text-gray-500 line-through'
  switch (i.category) {
    case 'Call':
    case 'Meeting':
      return 'border-l-2 border-brand-navy text-brand-dark'
    case 'Deadline':
      return 'border-l-2 border-red-600 text-brand-dark'
    default:
      return 'border-l-2 border-brand-olive text-brand-dark'
  }
}

function label(i: CalendarItem): string {
  if (i.kind !== 'task') return i.title
  const shown: Record<string, string> = { Call: 'Call', Meeting: 'Meeting', Event: 'Event', Deadline: 'Deadline', 'For Newsletter': 'Newsletter' }
  const what = i.category && shown[i.category] ? `${shown[i.category]}: ` : ''
  const who = i.business_name && !i.title.includes(i.business_name) ? ` (${i.business_name})` : ''
  return `${i.time ? `${i.time} ` : ''}${what}${i.title}${who}`
}

function useBusinessNames() {
  const [names, setNames] = useState<{ id: string; name: string }[] | null>(null)
  const load = useCallback(() => {
    if (names) return
    setNames([])
    getBusinessNames().then(setNames).catch(() => setNames(null))
  }, [names])
  return { names: names ?? [], load }
}

export function TodayCalendar({
  today,
  initialItems,
  onChanged,
}: {
  today: string
  initialItems: CalendarItem[]
  onChanged: () => void
}) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)
  const [items, setItems] = useState<CalendarItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [addingOn, setAddingOn] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropDay, setDropDay] = useState<string | null>(null)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())

  const days = useMemo(() => {
    if (view === 'week') {
      const start = weekStart(anchor)
      return Array.from({ length: 7 }, (_, k) => addDays(start, k))
    }
    return monthGrid(anchor)
  }, [view, anchor])
  const from = days[0]
  const to = days[days.length - 1]

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getCalendarItems(from, to)
    setLoading(false)
    if (result.error) toast.error(`Calendar: ${result.error}`)
    else setItems(result.data ?? [])
  }, [from, to])

  // The first week comes from the server; anything else is fetched.
  const loadedRange = useRef(`${weekStart(today)}|${addDays(weekStart(today), 6)}`)
  useEffect(() => {
    if (loadedRange.current === `${from}|${to}`) return
    loadedRange.current = `${from}|${to}`
    load()
  }, [from, to, load])

  // The newsletter list and the "For newsletter" buttons say when they change something.
  useEffect(() => {
    const again = () => load()
    window.addEventListener(CALENDAR_CHANGED, again)
    return () => window.removeEventListener(CALENDAR_CHANGED, again)
  }, [load])

  const changed = () => {
    window.dispatchEvent(new Event(CALENDAR_CHANGED))
    onChanged()
  }

  async function move(item: CalendarItem, date: string, time?: string | null) {
    if (!item.task_id || (date === item.date && time === undefined)) return
    const before = items
    setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, date, time: time === undefined ? i.time : time || null } : i)))
    const result = await moveCalendarItem(item.task_id, date, time)
    if (result.error) {
      setItems(before)
      toast.error(result.error)
      return
    }
    toast.success(`Moved to ${dateGB(date)}${item.engine && date > today ? '. It stays snoozed until then' : ''}`)
    changed()
  }

  async function done(item: CalendarItem) {
    if (!item.task_id) return
    const result = await updateTask(item.task_id, { status: 'done' })
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Done')
    setOpenKey(null)
    changed()
  }

  // Hand-written items only: the engine would make its own again overnight.
  async function remove(item: CalendarItem) {
    if (!item.task_id || item.engine) return
    const before = items
    setItems((prev) => prev.filter((i) => i.key !== item.key))
    setOpenKey(null)
    const result = await deleteTodayTask(item.task_id)
    if (result.error || !result.backupId) {
      setItems(before)
      toast.error(result.error ?? 'Not deleted')
      return
    }
    const backupId = result.backupId
    changed()
    toast.undo(`Deleted: ${item.title}`, async () => {
      const undo = await undoDeleteTodayTask(backupId)
      if (undo.error) toast.error(undo.error)
      else {
        toast.success('Put back')
        load()
        changed()
      }
    })
  }

  const step = (n: number) => setAnchor((a) => (view === 'week' ? addDays(a, 7 * n) : addMonths(monthStart(a), n)))
  const title =
    view === 'week'
      ? `${dayName(from, { day: 'numeric', month: 'short' })} to ${dayName(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : dayName(monthStart(anchor), { month: 'long', year: 'numeric' })
  const thisMonth = anchor.slice(0, 7)
  const open = items.find((i) => i.key === openKey) ?? null

  function chip(i: CalendarItem, oneLine: boolean) {
    const movable = i.kind === 'task' && !i.done
    const cls = `block w-full text-left mt-1 text-[12px] leading-tight px-2 py-1 bg-brand-warm/70 hover:bg-brand-warm ${view === 'week' ? 'min-h-10 md:min-h-0 pointer-coarse:min-h-10' : ''} rounded-sm break-words ${tone(i)} ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragKey === i.key ? 'opacity-40' : ''} ${oneLine ? 'truncate' : ''}`
    if (i.kind !== 'task') {
      return i.business_id ? (
        <Link key={i.key} href={`/businesses/${i.business_id}`} className={`${cls} hover:underline`} title={`${i.title}. Open the business to act on it`}>
          {label(i)}
        </Link>
      ) : (
        <span key={i.key} className={cls}>{label(i)}</span>
      )
    }
    return (
      <button
        key={i.key}
        type="button"
        draggable={movable}
        onDragStart={(e) => { setDragKey(i.key); e.dataTransfer.setData('text/plain', i.key); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setDragKey(null); setDropDay(null) }}
        onClick={() => { setOpenKey(openKey === i.key ? null : i.key); setAddingOn(null) }}
        className={cls}
        title={movable ? `${label(i)}. Open it, or drag it to another day` : label(i)}
        aria-label={label(i)}
        aria-expanded={openKey === i.key}
      >
        {label(i)}
      </button>
    )
  }

  function dayCell(d: string, k: number, full: boolean) {
    const list = items.filter((i) => i.date === d)
    const isToday = d === today
    const outside = view === 'month' && d.slice(0, 7) !== thisMonth
    const wednesday = isWednesday(d)
    const compact = view === 'month'
    const shown = compact ? list.slice(0, full ? 8 : 3) : full || openDays.has(d) ? list : list.slice(0, WEEK_DAY_LIMIT)
    return (
      <div
        key={d}
        onDragOver={(e) => { if (dragKey) { e.preventDefault(); setDropDay(d) } }}
        onDragLeave={() => setDropDay((x) => (x === d ? null : x))}
        onDrop={(e) => {
          e.preventDefault()
          const item = items.find((i) => i.key === (dragKey ?? e.dataTransfer.getData('text/plain')))
          setDragKey(null)
          setDropDay(null)
          if (item) move(item, d)
        }}
        className={`group/day p-1.5 min-w-0 border-black/[0.05] ${
          compact ? (full ? 'min-h-[calc((100vh-16rem)/6)]' : 'min-h-[92px]') : `flex gap-2 @2xl:block ${full ? '@2xl:min-h-[calc(100vh-16rem)]' : '@2xl:min-h-[150px]'}`
        } ${
          view === 'week' ? (k < 6 ? 'border-b @2xl:border-b-0 @2xl:border-r' : '') : `${k % 7 < 6 ? 'border-r' : ''} border-b`
        } ${outside ? 'bg-black/[0.02]' : ''} ${dropDay === d ? 'bg-brand-navy/10' : ''} ${wednesday && !outside ? 'bg-brand-olive/[0.06]' : ''}`}
      >
        <div className={`flex items-center gap-1 flex-wrap ${compact ? '' : 'w-28 shrink-0 content-start @2xl:w-auto'}`}>
          <button
            type="button"
            onClick={() => { setAddingOn(addingOn === d ? null : d); setOpenKey(null) }}
            className={`text-[11px] uppercase ${compact ? '' : 'min-h-8 pointer-coarse:min-h-10 @2xl:min-h-0'} tracking-wide hover:underline ${isToday ? 'text-brand-navy font-semibold' : outside ? 'text-gray-400' : 'text-gray-500'}`}
            title={`Add something on ${dateGB(d)}`}
          >
            {compact ? dayName(d, { day: 'numeric' }) : isToday ? `Today ${dayName(d, { day: 'numeric' })}` : dayName(d, { weekday: 'short', day: 'numeric' })}
          </button>
          {wednesday && (
            <a href="#newsletter" className={`text-[10px] font-semibold px-1 rounded-sm bg-brand-olive/20 text-brand-dark hover:underline relative after:absolute after:-inset-y-3 after:-inset-x-1 after:content-['']`} title="The newsletter goes out on Wednesdays. Open the list for it">
              {compact ? 'News' : 'Newsletter'}
            </a>
          )}
          <button
            type="button"
            onClick={() => { setAddingOn(addingOn === d ? null : d); setOpenKey(null) }}
            className={`ml-auto text-[11px] font-semibold text-brand-navy hover:underline opacity-0 group-hover/day:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 max-md:opacity-100 ${compact ? 'hidden @2xl:inline' : 'min-h-8 pointer-coarse:min-h-10 @2xl:min-h-0 px-1'}`}
            aria-label={`Add something on ${dateGB(d)}`}
          >
            + Add
          </button>
        </div>
        {/* Month view on a phone: too narrow for words, so a count that opens the week */}
        {compact && list.length > 0 && (
          <button
            type="button"
            onClick={() => { setView('week'); setAnchor(d) }}
            className="@2xl:hidden mt-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-brand-olive/15 text-brand-dark"
            aria-label={`${list.length} on ${dateGB(d)}. Show the week`}
          >
            {list.length}
          </button>
        )}
        <div className={compact ? 'hidden @2xl:block' : 'flex-1 min-w-0'}>
          {shown.map((i) => chip(i, !full))}
          {!compact && !full && list.length > WEEK_DAY_LIMIT && (
            <button
              type="button"
              onClick={() => setOpenDays((prev) => { const next = new Set(prev); if (next.has(d)) next.delete(d); else next.add(d); return next })}
              className="mt-1 min-h-10 md:min-h-0 text-[11px] font-semibold text-brand-navy hover:underline"
            >
              {openDays.has(d) ? 'Show fewer' : `Show ${list.length - WEEK_DAY_LIMIT} more`}
            </button>
          )}
          {compact && list.length > shown.length && (
            <button type="button" onClick={() => { setView('week'); setAnchor(d) }} className="mt-1 text-[11px] text-brand-navy hover:underline">
              {list.length - shown.length} more, show the week
            </button>
          )}
          {view === 'week' && list.length === 0 && <p className="mt-1.5 text-[11.5px] text-gray-500 @2xl:hidden">Nothing yet.</p>}
        </div>
      </div>
    )
  }

  const controls = (
    <>
      <div className="flex gap-1" role="group" aria-label="Calendar view">
        <button type="button" className={view === 'week' ? btnOn : btn} aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</button>
        <button type="button" className={view === 'month' ? btnOn : btn} aria-pressed={view === 'month'} onClick={() => setView('month')}>Month</button>
      </div>
    </>
  )

  return (
    <FullScreenPanel title="Calendar" headingId="calendar-h" controls={controls}>
      {(full) => (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-brand-dark font-semibold mr-auto" aria-live="polite">
              {title}
              {loading && <span className="ml-2 font-normal text-xs text-gray-600">Loading…</span>}
            </p>
            <div className="flex gap-1 items-center" role="group" aria-label={view === 'week' ? 'Change week' : 'Change month'}>
              <button type="button" className={panelButtonClass} onClick={() => step(-1)}>Previous</button>
              <button type="button" className={panelButtonClass} onClick={() => setAnchor(today)}>{view === 'week' ? 'This week' : 'This month'}</button>
              <button type="button" className={panelButtonClass} onClick={() => step(1)}>Next</button>
            </div>
          </div>

          <div className="@container border-y border-black/[0.05] -mx-1">
            {view === 'month' && (
              <div className="grid grid-cols-7 border-b border-black/[0.05]">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => (
                  <div key={n} className="px-1.5 py-1 text-[11px] uppercase tracking-wide text-gray-600">{n}</div>
                ))}
              </div>
            )}
            <div className={view === 'week' ? 'grid grid-cols-1 @2xl:grid-cols-7' : 'grid grid-cols-7'}>{days.map((d, k) => dayCell(d, k, full))}</div>
          </div>

          {addingOn && <AddForm date={addingOn} onClose={() => setAddingOn(null)} onAdded={() => { setAddingOn(null); load(); changed() }} />}
          {open && (
            <ItemPanel key={open.key} item={open} today={today} onClose={() => setOpenKey(null)} onMove={(d, t) => move(open, d, t)} onDone={() => done(open)} onDelete={open.engine ? undefined : () => remove(open)} />
          )}

          <p className="text-xs text-gray-600">
            Click a day to add something. Drag an item to another day, or open it and change the date. Renewals and invoices open their
            business. Wednesdays are newsletter days.
          </p>
        </div>
      )}
    </FullScreenPanel>
  )
}

function AddForm({ date, onClose, onAdded }: { date: string; onClose: () => void; onAdded: () => void }) {
  const [kind, setKind] = useState<CalendarKind>('todo')
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [saving, setSaving] = useState(false)
  const { names, load } = useBusinessNames()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    let businessId: string | null = null
    const typed = businessName.trim().toLowerCase()
    if (typed) {
      const match = names.find((b) => b.name.toLowerCase() === typed)
      if (!match) {
        toast.error('Pick the business from the list, or leave it empty')
        return
      }
      businessId = match.id
    }
    setSaving(true)
    const result = await addCalendarItem({ kind, title, date, time: time || null, business_id: businessId })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Added on ${dateGB(date)}`)
    onAdded()
  }

  return (
    <form onSubmit={submit} className="@container border border-black/[0.06] rounded-sm bg-brand-warm p-3 space-y-2">
      <p className="text-sm font-semibold text-brand-dark">Add on {dayName(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div className="grid gap-2 grid-cols-[auto_minmax(0,1fr)] @2xl:grid-cols-[auto_minmax(0,2fr)_auto_minmax(0,1.4fr)] items-end">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">What</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as CalendarKind)} className={input}>
            {CALENDAR_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} w-full`} required />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Time (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">For a business (optional)</span>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            onFocus={load}
            list="calendar-business-names"
            placeholder="Start typing a name"
            className={`${input} w-full`}
          />
          <datalist id="calendar-business-names">
            {names.map((b) => <option key={b.id} value={b.name} />)}
          </datalist>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !title.trim()} className="text-sm font-semibold px-4 py-2 rounded-sm bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors duration-200 ease-out disabled:opacity-50">
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={onClose} className={btn}>Cancel</button>
      </div>
    </form>
  )
}

function ItemPanel({
  item,
  today,
  onClose,
  onMove,
  onDone,
  onDelete,
}: {
  item: CalendarItem
  today: string
  onClose: () => void
  onMove: (date: string, time: string | null) => void
  onDone: () => void
  onDelete?: () => void
}) {
  const [date, setDate] = useState(item.date)
  const [time, setTime] = useState(item.time ?? '')
  return (
    <div className="border border-black/[0.06] rounded-sm bg-brand-warm p-3 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">
            {item.category ?? 'To-do'}
            {item.engine ? ' · added automatically' : ''} · {dateGB(item.date)}
            {item.time ? ` at ${item.time}` : ''}
            {item.done ? ' · done' : item.date < today ? ' · past its date' : ''}
          </p>
          <p className="font-semibold text-brand-dark break-words">{item.title}</p>
          {item.business_id && (
            <Link href={`/businesses/${item.business_id}`} className="text-sm text-brand-navy hover:underline">{item.business_name ?? 'Open the business'}</Link>
          )}
        </div>
        <button type="button" onClick={onClose} className={btn}>Close</button>
      </div>
      {!item.done && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (date) onMove(date, time || null) }}
        >
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} required />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Time (optional)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
          </label>
          <button type="submit" disabled={!date || (date === item.date && (time || null) === item.time)} className={btn}>Save date</button>
          <button type="button" onClick={onDone} className={btn}>Done</button>
          {onDelete && <button type="button" onClick={onDelete} className={`${btn} text-red-700`}>Delete</button>}
        </form>
      )}
      {item.done && onDelete && (
        <button type="button" onClick={onDelete} className={`${btn} text-red-700`}>Delete</button>
      )}
      {item.engine && !item.done && (
        <p className="text-xs text-gray-500">Moving this to a later date snoozes it until then, and the nightly refresh keeps it there.</p>
      )}
    </div>
  )
}
