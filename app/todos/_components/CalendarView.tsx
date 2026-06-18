'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import type { Task } from '@/app/actions/tasks'

type CalendarViewProps = {
  tasks: Task[]
  today: string
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onQuickAdd: (title: string, dueDate: string | null, category: 'work' | 'personal') => Promise<void>
  onDateChange: (taskId: string, newDate: string) => Promise<void>
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: { date: string; inMonth: boolean; day: number }[] = []

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: fmt(d), inMonth: false, day: d.getDate() })
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d)
    days.push({ date: fmt(dt), inMonth: true, day: d })
  }

  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      days.push({ date: fmt(d), inMonth: false, day: d.getDate() })
    }
  }

  return days
}

function fmt(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isCRM(t: Task) {
  return t.source === 'contract_renewal' || t.source === 'follow_up'
}

function getTaskTooltip(t: Task): string {
  const parts = [t.title]
  if (t.source === 'contract_renewal' && t.business?.contract_renewal_type) {
    const raw = t.business.contract_renewal_type
    parts.push('(' + raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ') + ')')
  }
  return parts.join(' ')
}

export function CalendarView({
  tasks,
  today,
  onToggle,
  onEdit,
  onQuickAdd,
  onDateChange,
}: CalendarViewProps) {
  const [year, setYear] = useState(() => parseInt(today.slice(0, 4)))
  const [month, setMonth] = useState(() => parseInt(today.slice(5, 7)) - 1)
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const quickAddRef = useRef<HTMLInputElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const days = useMemo(() => getMonthDays(year, month), [year, month])

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (t.due_date) {
        if (!map[t.due_date]) map[t.due_date] = []
        map[t.due_date].push(t)
      }
    }
    return map
  }, [tasks])

  const prevMonth = useCallback(() => {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
    setQuickAddDate(null)
  }, [month])

  const nextMonth = useCallback(() => {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
    setQuickAddDate(null)
  }, [month])

  const goToday = useCallback(() => {
    setYear(parseInt(today.slice(0, 4)))
    setMonth(parseInt(today.slice(5, 7)) - 1)
    setQuickAddDate(null)
  }, [today])

  const handleDayClick = useCallback(
    (date: string, inMonth: boolean) => {
      if (!inMonth) return
      if (quickAddDate === date) {
        setQuickAddDate(null)
        setQuickAddTitle('')
      } else {
        setQuickAddDate(date)
        setQuickAddTitle('')
        requestAnimationFrame(() => quickAddRef.current?.focus())
      }
    },
    [quickAddDate]
  )

  const handleQuickAddSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!quickAddTitle.trim() || !quickAddDate) return
      setAdding(true)
      await onQuickAdd(quickAddTitle.trim(), quickAddDate, 'work')
      setQuickAddTitle('')
      setQuickAddDate(null)
      setAdding(false)
    },
    [quickAddTitle, quickAddDate, onQuickAdd]
  )

  const handleDragStart = useCallback((taskId: string) => {
    setDragId(taskId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, date: string) => {
    e.preventDefault()
    setDragOverDate(date)
  }, [])

  const handleDrop = useCallback(
    async (date: string) => {
      if (dragId) {
        await onDateChange(dragId, date)
      }
      setDragId(null)
      setDragOverDate(null)
    },
    [dragId, onDateChange]
  )

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setDragOverDate(null)
  }, [])

  return (
    <div className="mt-6">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="text-sm px-2 py-1 text-gray-600 hover:text-brand-navy hover:bg-gray-100 transition-colors"
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="text-sm px-2 py-1 text-gray-600 hover:text-brand-navy hover:bg-gray-100 transition-colors"
            aria-label="Next month"
          >
            →
          </button>
        </div>
        <button
          onClick={goToday}
          className="text-sm px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 mb-px">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-xs font-medium text-gray-500 text-center py-2"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 border-l border-t border-gray-200">
        {days.map(({ date, inMonth, day }) => {
          const dateTasks = tasksByDate[date] ?? []
          const isToday = date === today
          const isDropTarget = dragOverDate === date

          return (
            <div
              key={date}
              className={`border-r border-b border-gray-200 min-h-[100px] p-1 transition-colors ${
                inMonth ? 'bg-white' : 'bg-gray-50/50'
              } ${isDropTarget ? 'bg-brand-olive/10' : ''}`}
              onClick={() => handleDayClick(date, inMonth)}
              onDragOver={(e) => handleDragOver(e, date)}
              onDrop={() => handleDrop(date)}
            >
              {/* Day number */}
              <div className="flex justify-end">
                <span
                  className={`text-xs w-6 h-6 flex items-center justify-center ${
                    isToday
                      ? 'bg-brand-navy text-white rounded-full font-bold'
                      : inMonth
                      ? 'text-gray-700'
                      : 'text-gray-300'
                  }`}
                >
                  {day}
                </span>
              </div>

              {/* Tasks in cell */}
              <div className="space-y-0.5 mt-0.5">
                {dateTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={() => handleDragStart(t.id)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(t)
                    }}
                    className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 truncate block transition-colors cursor-pointer ${
                      t.status === 'done'
                        ? 'text-gray-400 line-through bg-gray-50'
                        : t.is_priority
                        ? 'bg-amber-100 text-amber-800 font-medium'
                        : isCRM(t)
                        ? 'bg-brand-navy/5 text-brand-navy'
                        : 'bg-brand-warm text-gray-700 hover:bg-gray-100'
                    }`}
                    title={getTaskTooltip(t)}
                  >
                    {t.is_priority && t.status !== 'done' && '★ '}
                    {isCRM(t) && '⟳ '}
                    {t.title}
                  </button>
                ))}
                {dateTasks.length > 3 && (
                  <span className="text-[10px] text-gray-400 px-1">
                    +{dateTasks.length - 3} more
                  </span>
                )}
              </div>

              {/* Quick-add inline form */}
              {quickAddDate === date && (
                <form
                  onSubmit={handleQuickAddSubmit}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                >
                  <input
                    ref={quickAddRef}
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder="New task…"
                    disabled={adding}
                    className="w-full text-[11px] px-1 py-0.5 border border-brand-navy/30 bg-white focus:border-brand-navy outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setQuickAddDate(null)
                        setQuickAddTitle('')
                      }
                    }}
                  />
                </form>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 bg-amber-100 border border-amber-200" />
          Focus
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 bg-brand-navy/5 border border-brand-navy/20" />
          CRM
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 bg-gray-50 border border-gray-200" />
          Done
        </span>
        <span className="text-gray-400">· Click empty day to add · Drag to reschedule</span>
      </div>
    </div>
  )
}
