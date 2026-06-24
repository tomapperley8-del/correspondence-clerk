'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Task, TaskCategory } from '@/app/actions/tasks'
import { getCategoryColor } from '@/lib/task-colors'

type CalendarViewProps = {
  tasks: Task[]
  categories: TaskCategory[]
  today: string
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onQuickAdd: (title: string, dueDate: string | null, category: 'work' | 'personal', taskCategoryId?: string) => Promise<void>
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

function getTaskPillClass(t: Task): string {
  if (t.status === 'done') return 'text-gray-400 line-through bg-gray-50'
  if (t.is_priority) return 'bg-amber-100 text-amber-800 font-medium'
  const col = getCategoryColor(t.task_category?.color)
  return col.pill
}

export function CalendarView({
  tasks,
  categories,
  today,
  onToggle,
  onEdit,
  onQuickAdd,
  onDateChange,
}: CalendarViewProps) {
  const [year, setYear] = useState(() => parseInt(today.slice(0, 4)))
  const [month, setMonth] = useState(() => parseInt(today.slice(5, 7)) - 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [quickAddCategoryId, setQuickAddCategoryId] = useState(categories[0]?.id ?? '')
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

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : []

  const prevMonth = useCallback(() => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
    setSelectedDate(null)
  }, [month])

  const nextMonth = useCallback(() => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
    setSelectedDate(null)
  }, [month])

  const goToday = useCallback(() => {
    setYear(parseInt(today.slice(0, 4)))
    setMonth(parseInt(today.slice(5, 7)) - 1)
    setSelectedDate(today)
  }, [today])

  const handleDayClick = useCallback((date: string, inMonth: boolean) => {
    if (!inMonth) return
    setSelectedDate((prev) => prev === date ? null : date)
    setQuickAddTitle('')
  }, [])

  const handleQuickAddSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickAddTitle.trim() || !selectedDate) return
    setAdding(true)
    await onQuickAdd(quickAddTitle.trim(), selectedDate, 'work', quickAddCategoryId || undefined)
    setQuickAddTitle('')
    setAdding(false)
    quickAddRef.current?.focus()
  }, [quickAddTitle, selectedDate, onQuickAdd, quickAddCategoryId])

  const handleDragStart = useCallback((taskId: string) => { setDragId(taskId) }, [])
  const handleDragOver = useCallback((e: React.DragEvent, date: string) => {
    e.preventDefault(); setDragOverDate(date)
  }, [])
  const handleDrop = useCallback(async (date: string) => {
    if (dragId) await onDateChange(dragId, date)
    setDragId(null); setDragOverDate(null)
  }, [dragId, onDateChange])
  const handleDragEnd = useCallback(() => { setDragId(null); setDragOverDate(null) }, [])

  const selectedDateFormatted = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="mt-6">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="text-sm px-2 py-1 text-gray-600 hover:text-brand-navy hover:bg-gray-100 transition-colors" aria-label="Previous month">←</button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">{MONTH_NAMES[month]} {year}</h2>
          <button onClick={nextMonth} className="text-sm px-2 py-1 text-gray-600 hover:text-brand-navy hover:bg-gray-100 transition-colors" aria-label="Next month">→</button>
        </div>
        <button onClick={goToday} className="text-sm px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 transition-colors">Today</button>
      </div>

      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="flex-1">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 mb-px">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-xs font-medium text-gray-500 text-center py-2">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 border-l border-t border-gray-200">
            {days.map(({ date, inMonth, day }) => {
              const dateTasks = tasksByDate[date] ?? []
              const isToday = date === today
              const isSelected = date === selectedDate
              const isDropTarget = dragOverDate === date

              return (
                <div
                  key={date}
                  className={`border-r border-b border-gray-200 min-h-[90px] p-1 transition-colors cursor-pointer ${
                    inMonth ? 'bg-white' : 'bg-gray-50/50'
                  } ${isDropTarget ? 'bg-brand-olive/10' : ''} ${isSelected ? 'ring-2 ring-inset ring-brand-navy/40' : ''}`}
                  onClick={() => handleDayClick(date, inMonth)}
                  onDragOver={(e) => handleDragOver(e, date)}
                  onDrop={() => handleDrop(date)}
                >
                  {/* Day number */}
                  <div className="flex justify-end">
                    <span className={`text-xs w-6 h-6 flex items-center justify-center ${
                      isToday ? 'bg-brand-navy text-white rounded-full font-bold'
                        : inMonth ? 'text-gray-700' : 'text-gray-300'
                    }`}>{day}</span>
                  </div>

                  {/* Task pills */}
                  <div className="space-y-0.5 mt-0.5">
                    {dateTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        draggable
                        onDragStart={() => handleDragStart(t.id)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => { e.stopPropagation(); onEdit(t) }}
                        className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 truncate block transition-colors cursor-pointer ${getTaskPillClass(t)}`}
                        title={t.title}
                      >
                        {t.is_priority && t.status !== 'done' && '★ '}
                        {t.title}
                      </button>
                    ))}
                    {dateTasks.length > 3 && (
                      <span className="text-[10px] text-gray-400 px-1">+{dateTasks.length - 3} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend — from categories */}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500 flex-wrap">
            {categories.map((cat) => {
              const col = getCategoryColor(cat.color)
              return (
                <span key={cat.id} className="flex items-center gap-1">
                  <span className={`inline-block w-2.5 h-2.5 rounded-sm ${col.dot}`} />
                  {cat.name}
                </span>
              )
            })}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400" />Focus
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300" />Done
            </span>
            <span className="text-gray-400 ml-1">· Click day to view · Drag to reschedule</span>
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDate && (
          <div className="w-[280px] flex-shrink-0 border border-gray-200 bg-white self-start">
            <div className="px-3 py-2.5 border-b border-gray-200 bg-brand-warm">
              <p className="text-sm font-semibold text-gray-800">{selectedDateFormatted}</p>
              <p className="text-xs text-gray-500">{selectedTasks.length} item{selectedTasks.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Tasks for this day */}
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {selectedTasks.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">Nothing scheduled</p>
              ) : (
                selectedTasks.map((t) => {
                  const cat = t.task_category
                  const catColor = getCategoryColor(cat?.color)
                  return (
                    <div key={t.id} className="px-3 py-2 hover:bg-brand-warm/50 transition-colors">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => onToggle(t)}
                          className={`flex-shrink-0 w-4 h-4 mt-0.5 border-2 flex items-center justify-center transition-colors ${
                            t.status === 'done' ? 'bg-brand-olive border-brand-olive text-white' : 'border-gray-300 hover:border-brand-navy'
                          }`}
                        >
                          {t.status === 'done' && (
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => onEdit(t)}
                            className={`text-xs text-left block w-full ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}
                          >
                            {t.title}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {cat && cat.name !== 'Task' && (
                              <span className={`text-[9px] font-semibold px-1 py-0.5 ${catColor.pill}`}>{cat.name}</span>
                            )}
                            {t.business_id && t.business && (
                              <Link
                                href={`/businesses/${t.business_id}`}
                                className="text-[10px] text-brand-navy hover:text-brand-olive transition-colors truncate"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t.business.name}
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Quick add in panel */}
            <form onSubmit={handleQuickAddSubmit} className="p-2 border-t border-gray-200 space-y-1">
              <div className="flex gap-1">
                <div className="relative flex items-center flex-shrink-0">
                  <span className={`absolute left-1.5 w-2 h-2 rounded-sm ${getCategoryColor(categories.find(c => c.id === quickAddCategoryId)?.color).dot} pointer-events-none z-10`} />
                  <select
                    value={quickAddCategoryId}
                    onChange={(e) => setQuickAddCategoryId(e.target.value)}
                    className="text-xs pl-5 pr-4 py-1.5 border border-gray-200 bg-white focus:border-brand-navy outline-none cursor-pointer"
                    disabled={adding}
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  ref={quickAddRef}
                  type="text"
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  placeholder={`Add ${categories.find(c => c.id === quickAddCategoryId)?.name.toLowerCase() ?? 'task'}…`}
                  disabled={adding}
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none min-w-0"
                />
                <button
                  type="submit"
                  disabled={adding || !quickAddTitle.trim()}
                  className="text-xs px-2 py-1.5 bg-brand-navy text-white disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
