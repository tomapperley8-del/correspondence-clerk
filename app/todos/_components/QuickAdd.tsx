'use client'

import { useState, useRef, useMemo } from 'react'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const SHORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseNaturalDate(text: string): { date: string; cleaned: string } | null {
  const lower = text.toLowerCase()
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  // "today"
  if (/\btoday\b/.test(lower)) {
    return { date: fmt(now), cleaned: text.replace(/\s*\btoday\b\s*/i, ' ').trim() }
  }

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 1)
    return { date: fmt(d), cleaned: text.replace(/\s*\btomorrow\b\s*/i, ' ').trim() }
  }

  // "next week" = next Monday
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
    return { date: fmt(d), cleaned: text.replace(/\s*\bnext\s+week\b\s*/i, ' ').trim() }
  }

  // "end of month"
  if (/\bend\s+of\s+(the\s+)?month\b/.test(lower)) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { date: fmt(d), cleaned: text.replace(/\s*\bend\s+of\s+(the\s+)?month\b\s*/i, ' ').trim() }
  }

  // "next <day>" e.g. "next tuesday"
  const nextDayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (nextDayMatch) {
    const target = DAY_NAMES.indexOf(nextDayMatch[1])
    const d = new Date(now)
    const diff = ((target - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + diff)
    if (diff <= 0) d.setDate(d.getDate() + 7)
    return { date: fmt(d), cleaned: text.replace(/\s*\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*/i, ' ').trim() }
  }

  // "on <day>" e.g. "on friday"
  const onDayMatch = lower.match(/\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (onDayMatch) {
    const target = DAY_NAMES.indexOf(onDayMatch[1])
    const d = new Date(now)
    const diff = ((target - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + diff)
    return { date: fmt(d), cleaned: text.replace(/\s*\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*/i, ' ').trim() }
  }

  // "on <ordinal> of <month>" or "<ordinal> <month>" or "<day> <month>" e.g. "10th of august", "10 august", "10th august"
  const dateMonthMatch = lower.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)\b/)
  if (dateMonthMatch) {
    const dayNum = parseInt(dateMonthMatch[1])
    const monthStr = dateMonthMatch[2]
    let monthIdx = MONTH_NAMES.indexOf(monthStr)
    if (monthIdx === -1) monthIdx = SHORT_MONTHS.indexOf(monthStr.slice(0, 3))
    if (monthIdx !== -1 && dayNum >= 1 && dayNum <= 31) {
      let year = now.getFullYear()
      const candidate = new Date(year, monthIdx, dayNum)
      if (candidate < now) year++
      const d = new Date(year, monthIdx, dayNum)
      const fullMatch = dateMonthMatch[0]
      return { date: fmt(d), cleaned: text.replace(new RegExp('\\s*\\b' + fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'i'), ' ').trim() }
    }
  }

  // "in N days/weeks"
  const inNMatch = lower.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/)
  if (inNMatch) {
    const n = parseInt(inNMatch[1])
    const unit = inNMatch[2].startsWith('week') ? 7 : 1
    const d = new Date(now); d.setDate(d.getDate() + n * unit)
    return { date: fmt(d), cleaned: text.replace(/\s*\bin\s+\d+\s+(day|days|week|weeks)\b\s*/i, ' ').trim() }
  }

  return null
}

export function QuickAdd({
  onAdd,
  defaultDate,
}: {
  onAdd: (title: string, dueDate: string | null, category: 'work' | 'personal') => Promise<void>
  defaultDate?: string | null
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(defaultDate ?? '')
  const [category, setCategory] = useState<'work' | 'personal'>('work')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsedDate = useMemo(() => parseNaturalDate(title), [title])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setAdding(true)
    const finalTitle = parsedDate && !dueDate ? parsedDate.cleaned : title.trim()
    const finalDate = dueDate || parsedDate?.date || null
    await onAdd(finalTitle, finalDate, category)
    setTitle('')
    setDueDate(defaultDate ?? '')
    setAdding(false)
    inputRef.current?.focus()
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 bg-white border border-gray-200 p-3 shadow-[var(--shadow-sm)]">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a to-do… (try &quot;call Tim next Tuesday&quot;)"
          className="flex-1 text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
          disabled={adding}
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none w-full sm:w-auto"
          disabled={adding}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as 'work' | 'personal')}
          className="text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none w-full sm:w-auto"
          disabled={adding}
        >
          <option value="work">Work</option>
          <option value="personal">Personal</option>
        </select>
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy-hover disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>
      {parsedDate && !dueDate && (
        <div className="mt-1 text-xs text-brand-olive flex items-center gap-1.5 px-1">
          <span>📅</span>
          <span>
            Detected date: <strong>{new Date(parsedDate.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          </span>
          <span className="text-gray-400">· Task: &quot;{parsedDate.cleaned}&quot;</span>
        </div>
      )}
    </div>
  )
}
