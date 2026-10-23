'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import { updateTask } from '@/app/actions/tasks'
import { getBusinessNames } from '@/app/actions/today'
import { addCalendarItem, getCalendarItems, moveCalendarItem, type CalendarItem } from '@/app/actions/calendar'
import { addDays } from '@/lib/today'
import { CALENDAR_KINDS, addMonths, isWednesday, monthGrid, monthStart, weekStart, type CalendarKind } from '@/lib/calendar'

// The work calendar on Today (UI overhaul Stage 12). Week view by default,
// month on a toggle. Click a day to add a to-do, call, meeting, event,
// deadline or newsletter item; drag an item to another day to move it (or
// open it and change the date, which is how it works on a phone). Renewals
// ending and invoices due are markers that open their business. Everything is
// a task, so it shows wherever tasks do.

export const CALENDAR_CHANGED = 'cc:calendar-changed'

/** A busy day in week view shows this many items, then "Show N more". */
const WEEK_DAY_LIMIT = 6

const btnBase = 'text-xs font-semibold px-2.5 py-1.5 border rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const btn = `${btnBase} border-black/[0.12] bg-white text-brand-navy hover:bg-brand-warm`
const btnOn = `${btnBase} border-brand-navy bg-brand-navy text-white hover:bg-brand-navy-hover`
const input = 'text-sm border border-black/[0.12] rounded-sm px-2.5 py-2 bg-white'

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)
const dayName = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

function tone(i: CalendarItem): string {
  if (i.kind === 'renewal') return 'bg-amber-50 text-amber-800'
  if (i.kind === 'invoice') return 'bg-red-50 text-red-800'
  if (i.done) return 'bg-gray-100 text-gray-500 line-through'
  switch (i.category) {
    case 'Call':
    case 'Meeting':
      return 'bg-brand-navy/10 text-brand-navy'
    case 'Event':
      return 'bg-brand-olive/25 text-brand-dark'
    case 'Deadline':
      return 'bg-red-50 text-red-800'
    case 'For Newsletter':
      return 'bg-brand-warm text-brand-dark border border-brand-olive/40'
    default:
      return 'bg-brand-olive/15 text-brand-dark'
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

  const step = (n: number) => setAnchor((a) => (view === 'week' ? addDays(a, 7 * n) : addMonths(monthStart(a), n)))
  const title =
    view === 'week'
      ? `${dayName(from, { day: 'numeric', month: 'short' })} to ${dayName(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : dayName(monthStart(anchor), { month: 'long', year: 'numeric' })
  const thisMonth = anchor.slice(0, 7)
  const open = items.find((i) => i.key === openKey) ?? null

  function chip(i: CalendarItem, compact: boolean) {
    const movable = i.kind === 'task' && !i.done
    const cls = `block w-full text-left mt-1 text-[11.5px] leading-tight px-1.5 py-1 rounded-sm break-words ${tone(i)} ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragKey === i.key ? 'opacity-40' : ''} ${compact ? 'truncate' : ''}`
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
        title={movable ? 'Open it, or drag it to another day' : label(i)}
        aria-label={label(i)}
        aria-expanded={openKey === i.key}
      >
        {label(i)}
      </button>
    )
  }

  function dayCell(d: string, k: number) {
    const list = items.filter((i) => i.date === d)
    const isToday = d === today
    const outside = view === 'month' && d.slice(0, 7) !== thisMonth
    const wednesday = isWednesday(d)
    const compact = view === 'month'
    const shown = compact ? list.slice(0, 3) : openDays.has(d) ? list : list.slice(0, WEEK_DAY_LIMIT)
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
        className={`p-1.5 min-w-0 border-black/[0.06] ${compact ? 'min-h-[92px]' : 'sm:min-h-[150px]'} ${
          view === 'week' ? (k < 6 ? 'border-b sm:border-b-0 sm:border-r' : '') : `${k % 7 < 6 ? 'border-r' : ''} border-b`
        } ${outside ? 'bg-black/[0.02]' : ''} ${dropDay === d ? 'bg-brand-navy/10' : ''} ${wednesday && !outside ? 'bg-brand-olive/[0.06]' : ''}`}
      >
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => { setAddingOn(addingOn === d ? null : d); setOpenKey(null) }}
            className={`text-[11px] uppercase tracking-wide hover:underline ${isToday ? 'text-brand-navy font-semibold' : outside ? 'text-gray-400' : 'text-gray-500'}`}
            title={`Add something on ${dateGB(d)}`}
          >
            {compact ? dayName(d, { day: 'numeric' }) : isToday ? `Today ${dayName(d, { day: 'numeric' })}` : dayName(d, { weekday: 'short', day: 'numeric' })}
          </button>
          {wednesday && (
            <a href="#newsletter" className="text-[10px] font-semibold px-1 rounded-sm bg-brand-olive/20 text-brand-dark hover:underline" title="The newsletter goes out on Wednesdays. Open the list for it">
              {compact ? 'News' : 'Newsletter'}
            </a>
          )}
          <button
            type="button"
            onClick={() => { setAddingOn(addingOn === d ? null : d); setOpenKey(null) }}
            className={`ml-auto text-[11px] font-semibold text-brand-navy hover:underline ${compact ? 'hidden sm:inline' : ''}`}
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
            className="sm:hidden mt-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-brand-olive/15 text-brand-dark"
            aria-label={`${list.length} on ${dateGB(d)}. Show the week`}
          >
            {list.length}
          </button>
        )}
        <div className={compact ? 'hidden sm:block' : ''}>
          {shown.map((i) => chip(i, compact))}
          {compact && list.length > shown.length && (
            <button type="button" onClick={() => { setView('week'); setAnchor(d) }} className="mt-1 text-[11px] text-brand-navy hover:underline">
              {list.length - shown.length} more, show the week
            </button>
          )}
        </div>
        {!compact && list.length > WEEK_DAY_LIMIT && (
          <button
            type="button"
            onClick={() => setOpenDays((prev) => { const next = new Set(prev); if (next.has(d)) next.delete(d); else next.add(d); return next })}
            className="mt-1 text-[11px] font-semibold text-brand-navy hover:underline"
          >
            {openDays.has(d) ? 'Show fewer' : `Show ${list.length - WEEK_DAY_LIMIT} more`}
          </button>
        )}
        {view === 'week' && list.length === 0 && <p className="mt-1 text-[11.5px] text-gray-400 sm:hidden">Nothing yet.</p>}
      </div>
    )
  }

  return (
    <section aria-labelledby="calendar-h" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="calendar-h" className="text-2xl font-semibold text-brand-dark mr-2" style={{ fontFamily: 'var(--font-serif)' }}>Calendar</h2>
        <div className="flex gap-1" role="group" aria-label="Calendar view">
          <button type="button" className={view === 'week' ? btnOn : btn} aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</button>
          <button type="button" className={view === 'month' ? btnOn : btn} aria-pressed={view === 'month'} onClick={() => setView('month')}>Month</button>
        </div>
        <div className="flex gap-1 sm:ml-auto items-center">
          <button type="button" className={btn} onClick={() => step(-1)}>Previous</button>
          <button type="button" className={btn} onClick={() => setAnchor(today)}>{view === 'week' ? 'This week' : 'This month'}</button>
          <button type="button" className={btn} onClick={() => step(1)}>Next</button>
        </div>
      </div>
      <p className="text-sm text-brand-dark font-semibold">
        {title}
        {loading && <span className="ml-2 font-normal text-xs text-gray-500">Loading…</span>}
      </p>

      <div className="border border-black/[0.06] rounded-sm bg-white">
        {view === 'month' && (
          <div className="grid grid-cols-7 border-b border-black/[0.06] bg-brand-warm">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => (
              <div key={n} className="px-1.5 py-1 text-[11px] uppercase tracking-wide text-gray-500">{n}</div>
            ))}
          </div>
        )}
        <div className={view === 'week' ? 'grid grid-cols-1 sm:grid-cols-7' : 'grid grid-cols-7'}>{days.map(dayCell)}</div>
      </div>

      {addingOn && <AddForm date={addingOn} onClose={() => setAddingOn(null)} onAdded={() => { setAddingOn(null); load(); changed() }} />}
      {open && (
        <ItemPanel key={open.key} item={open} today={today} onClose={() => setOpenKey(null)} onMove={(d, t) => move(open, d, t)} onDone={() => done(open)} />
      )}

      <p className="text-xs text-gray-500">
        Click a day to add something. Drag an item to another day to move it, or open it and change the date. Renewals (amber) and
        invoices (red) open their business. Wednesdays are newsletter days.
      </p>
    </section>
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
    <form onSubmit={submit} className="border border-black/[0.06] rounded-sm bg-brand-warm p-3 space-y-2">
      <p className="text-sm font-semibold text-brand-dark">Add on {dayName(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,2fr)_auto_minmax(0,1.4fr)] items-end">
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
}: {
  item: CalendarItem
  today: string
  onClose: () => void
  onMove: (date: string, time: string | null) => void
  onDone: () => void
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
        </form>
      )}
      {item.engine && !item.done && (
        <p className="text-xs text-gray-500">Moving this to a later date snoozes it until then, and the nightly refresh keeps it there.</p>
      )}
    </div>
  )
}
