'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Task } from '@/app/actions/tasks'
import {
  createTask,
  updateTask,
  deleteTask,
  setPriority,
  clearPriority,
  refreshTaskCommitments,
  createTaskFromCorrespondence,
} from '@/app/actions/tasks'
import { markCorrespondenceDone } from '@/app/actions/correspondence'
import { toast } from '@/lib/toast'
import { formatDateShortGB } from '@/lib/utils'
import { QuickAdd } from './QuickAdd'
import { TaskRow } from './TaskRow'
import { TaskEditModal } from './TaskEditModal'
import { CalendarView } from './CalendarView'
import type { NeedsReplyItem } from '../page'

type ViewMode = 'list' | 'calendar'
type CategoryFilter = 'all' | 'work' | 'personal'
type TimeFilter = 'week' | 'all'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function getSourceBadge(task: Task): string | null {
  if (task.source === 'contract_renewal' && task.business) {
    const b = task.business
    if (b.is_club_card && b.is_advertiser) return 'Club Card + Advertiser'
    if (b.is_club_card) return 'Club Card'
    if (b.is_advertiser) return 'Advertiser'
    return 'Renewal'
  }
  if (task.source === 'follow_up') return 'Follow-up'
  return null
}

function getUrgencyLabel(task: Task): string | null {
  if (task.source === 'contract_renewal' && task.business?.contract_renewal_type) {
    const raw = task.business.contract_renewal_type
    return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ')
  }
  return null
}

type TaskGroups = {
  overdue: Task[]
  today: Task[]
  upcoming: Task[]
  noDate: Task[]
  done: Task[]
}

function groupTasks(tasks: Task[], today: string): TaskGroups {
  const overdue: Task[] = []
  const todayTasks: Task[] = []
  const upcoming: Task[] = []
  const noDate: Task[] = []
  const done: Task[] = []

  for (const t of tasks) {
    if (t.status === 'done') {
      done.push(t)
      continue
    }
    if (!t.due_date) {
      noDate.push(t)
    } else if (t.due_date < today) {
      overdue.push(t)
    } else if (t.due_date === today) {
      todayTasks.push(t)
    } else {
      upcoming.push(t)
    }
  }

  return { overdue, today: todayTasks, upcoming, noDate, done }
}

function getFocusTask(tasks: Task[]): { task: Task; type: 'priority' | 'suggested' } | null {
  const open = tasks.filter((t) => t.status === 'open')
  if (open.length === 0) return null

  const priority = open.find((t) => t.is_priority)
  if (priority) return { task: priority, type: 'priority' }

  const withDate = open.filter((t) => t.due_date).sort((a, b) => {
    const cmp = a.due_date!.localeCompare(b.due_date!)
    if (cmp !== 0) return cmp
    if (a.business_id && !b.business_id) return -1
    if (!a.business_id && b.business_id) return 1
    return 0
  })
  if (withDate.length > 0) return { task: withDate[0], type: 'suggested' }

  return { task: open[0], type: 'suggested' }
}

type BatchedGroup = {
  type: 'single'
  task: Task
} | {
  type: 'batch'
  label: string
  date: string
  tasks: Task[]
}

function batchCrmTasks(tasks: Task[]): BatchedGroup[] {
  const crmByDate = new Map<string, Task[]>()
  const manualTasks: Task[] = []

  for (const t of tasks) {
    if (t.source !== 'manual' && t.due_date) {
      const key = t.due_date
      if (!crmByDate.has(key)) crmByDate.set(key, [])
      crmByDate.get(key)!.push(t)
    } else {
      manualTasks.push(t)
    }
  }

  const allEntries: { date: string | null; item: BatchedGroup }[] = []

  for (const [date, crmTasks] of crmByDate) {
    if (crmTasks.length === 1) {
      allEntries.push({ date, item: { type: 'single', task: crmTasks[0] } })
    } else {
      const ccCount = crmTasks.filter((t) => t.business?.is_club_card && !t.business?.is_advertiser).length
      const adCount = crmTasks.filter((t) => t.business?.is_advertiser && !t.business?.is_club_card).length
      const bothCount = crmTasks.filter((t) => t.business?.is_club_card && t.business?.is_advertiser).length
      const otherCount = crmTasks.length - ccCount - adCount - bothCount

      const parts: string[] = []
      if (ccCount > 0) parts.push(`${ccCount} Club Card renewal${ccCount > 1 ? 's' : ''}`)
      if (adCount > 0) parts.push(`${adCount} Advertiser renewal${adCount > 1 ? 's' : ''}`)
      if (bothCount > 0) parts.push(`${bothCount} CC + Ad renewal${bothCount > 1 ? 's' : ''}`)
      if (otherCount > 0) parts.push(`${otherCount} renewal${otherCount > 1 ? 's' : ''}`)
      const label = parts.join(', ') + ' due ' + formatDateShortGB(date + 'T00:00:00')

      allEntries.push({ date, item: { type: 'batch', label, date, tasks: crmTasks } })
    }
  }

  for (const t of manualTasks) {
    allEntries.push({ date: t.due_date, item: { type: 'single', task: t } })
  }

  allEntries.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })

  return allEntries.map((e) => e.item)
}

export function TodosClient({
  initialTasks,
  initialError,
  initialNeedsReply,
}: {
  initialTasks: Task[]
  initialError: string | null
  initialNeedsReply: NeedsReplyItem[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [needsReply, setNeedsReply] = useState<NeedsReplyItem[]>(initialNeedsReply)
  const [view, setView] = useState<ViewMode>('list')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [doneExpanded, setDoneExpanded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('todos_time_filter')
    if (saved === 'week' || saved === 'all') setTimeFilter(saved)
  }, [])

  const handleTimeFilterChange = useCallback((f: TimeFilter) => {
    setTimeFilter(f)
    localStorage.setItem('todos_time_filter', f)
  }, [])

  const today = todayStr()
  const weekEnd = addDays(today, 7)

  const filtered = useMemo(() => {
    let result = tasks
    if (categoryFilter !== 'all') {
      result = result.filter((t) => t.category === categoryFilter)
    }
    if (timeFilter === 'week') {
      result = result.filter((t) => {
        if (t.status === 'done') return true
        if (!t.due_date) return false
        return t.due_date <= weekEnd
      })
    }
    return result
  }, [tasks, categoryFilter, timeFilter, weekEnd])

  const groups = useMemo(() => groupTasks(filtered, today), [filtered, today])

  const focusTask = useMemo(() => getFocusTask(tasks.filter((t) => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    return true
  })), [tasks, categoryFilter])

  const handleCreate = useCallback(
    async (title: string, due_date: string | null, category: 'work' | 'personal') => {
      const result = await createTask({ title, due_date, category })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setTasks((prev) => [result.data!, ...prev])
        toast.success('Task added')
      }
    },
    []
  )

  const handleToggleStatus = useCallback(
    async (task: Task) => {
      const newStatus = task.status === 'open' ? 'done' : 'open'
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null }
            : t
        )
      )
      const result = await updateTask(task.id, { status: newStatus })
      if (result.error) {
        toast.error(result.error)
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      }
    },
    []
  )

  const handleUpdate = useCallback(
    async (id: string, updates: Parameters<typeof updateTask>[1]) => {
      const result = await updateTask(id, updates)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setTasks((prev) => prev.map((t) => (t.id === id ? result.data! : t)))
        toast.success('Task updated')
        setEditingTask(null)
      }
    },
    []
  )

  const handleDelete = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id))
      const result = await deleteTask(id)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else {
        toast.success('Task deleted')
        setEditingTask(null)
      }
    },
    [router]
  )

  const handleSetPriority = useCallback(
    async (id: string) => {
      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          is_priority: t.id === id ? true : t.status === 'open' ? false : t.is_priority,
        }))
      )
      const result = await setPriority(id)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  const handleClearPriority = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, is_priority: false } : t)))
      const result = await clearPriority(id)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  const handleRefreshCRM = useCallback(async () => {
    setRefreshing(true)
    const result = await refreshTaskCommitments()
    setRefreshing(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Refreshed — ${result.count ?? 0} commitment${result.count === 1 ? '' : 's'} added`)
    router.refresh()
  }, [router])

  const handleDateChange = useCallback(
    async (taskId: string, newDate: string) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, due_date: newDate } : t))
      )
      const result = await updateTask(taskId, { due_date: newDate })
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  const handleDismissReply = useCallback(
    async (correspondenceId: string) => {
      setNeedsReply((prev) => prev.filter((r) => r.id !== correspondenceId))
      const result = await markCorrespondenceDone(correspondenceId)
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  const handleCreateTodoFromReply = useCallback(
    async (item: NeedsReplyItem) => {
      const result = await createTaskFromCorrespondence({
        correspondenceId: item.id,
        businessId: item.business_id,
        businessName: item.businesses.name,
        subject: item.subject,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setTasks((prev) => [result.data!, ...prev])
        setNeedsReply((prev) => prev.filter((r) => r.id !== item.id))
        await markCorrespondenceDone(item.id)
        toast.success('To-do created')
      }
    },
    []
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Focus banner — always at very top */}
      <FocusBanner focus={focusTask} onToggle={handleToggleStatus} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1>To-dos</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshCRM}
            disabled={refreshing}
            className="text-sm px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {refreshing ? 'Refreshing…' : 'Refresh from CRM'}
          </button>
        </div>
      </div>

      {initialError && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 mb-6 text-sm text-red-800">
          {initialError}
        </div>
      )}

      {/* Awaiting reply section */}
      {needsReply.length > 0 && (
        <NeedsReplySection
          items={needsReply}
          onDismiss={handleDismissReply}
          onCreateTodo={handleCreateTodoFromReply}
        />
      )}

      {/* View toggle + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex bg-brand-warm border border-gray-200 p-0.5">
            <button
              onClick={() => setView('list')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                view === 'list'
                  ? 'bg-brand-navy text-white'
                  : 'text-gray-600 hover:text-brand-navy'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                view === 'calendar'
                  ? 'bg-brand-navy text-white'
                  : 'text-gray-600 hover:text-brand-navy'
              }`}
            >
              Calendar
            </button>
          </div>

          <div className="flex bg-brand-warm border border-gray-200 p-0.5">
            <button
              onClick={() => handleTimeFilterChange('week')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                timeFilter === 'week'
                  ? 'bg-brand-navy text-white'
                  : 'text-gray-600 hover:text-brand-navy'
              }`}
            >
              This week
            </button>
            <button
              onClick={() => handleTimeFilterChange('all')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                timeFilter === 'all'
                  ? 'bg-brand-navy text-white'
                  : 'text-gray-600 hover:text-brand-navy'
              }`}
            >
              All
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Show:</span>
          {(['all', 'work', 'personal'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 text-sm font-medium transition-colors border ${
                categoryFilter === cat
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-navy hover:text-brand-navy'
              }`}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Quick add */}
      <QuickAdd onAdd={handleCreate} />

      {/* Views */}
      {view === 'list' ? (
        <div className="space-y-6 mt-6">
          {groups.overdue.length > 0 && (
            <BatchedTaskGroup
              label="Overdue"
              labelClass="text-red-700"
              tasks={groups.overdue}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
            />
          )}

          {groups.today.length > 0 && (
            <BatchedTaskGroup
              label="Today"
              labelClass="text-brand-navy"
              tasks={groups.today}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
            />
          )}

          {groups.upcoming.length > 0 && (
            <BatchedTaskGroup
              label="Upcoming"
              labelClass="text-gray-700"
              tasks={groups.upcoming}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
            />
          )}

          {groups.noDate.length > 0 && (
            <BatchedTaskGroup
              label="No date"
              labelClass="text-gray-500"
              tasks={groups.noDate}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
            />
          )}

          {groups.done.length > 0 && (
            <section>
              <button
                onClick={() => setDoneExpanded((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors mb-2"
              >
                <span className="text-xs">{doneExpanded ? '▼' : '▶'}</span>
                Done ({groups.done.length})
              </button>
              {doneExpanded && (
                <div className="divide-y divide-gray-100 opacity-60">
                  {groups.done.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggle={handleToggleStatus}
                      onEdit={setEditingTask}
                      onSetPriority={handleSetPriority}
                      onClearPriority={handleClearPriority}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {filtered.length === 0 && !initialError && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg mb-2">
                {timeFilter === 'week' ? 'Nothing due this week' : 'No to-dos yet'}
              </p>
              <p className="text-sm">
                {timeFilter === 'week'
                  ? 'Switch to "All" to see everything, or add a new task above.'
                  : 'Add one above, or refresh from CRM to pull in commitments.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <CalendarView
          tasks={filtered}
          today={today}
          onToggle={handleToggleStatus}
          onEdit={setEditingTask}
          onQuickAdd={handleCreate}
          onDateChange={handleDateChange}
        />
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onSetPriority={handleSetPriority}
          onClearPriority={handleClearPriority}
        />
      )}
    </div>
  )
}

function NeedsReplySection({
  items,
  onDismiss,
  onCreateTodo,
}: {
  items: NeedsReplyItem[]
  onDismiss: (id: string) => void
  onCreateTodo: (item: NeedsReplyItem) => void
}) {
  const [expanded, setExpanded] = useState(items.length <= 3)

  return (
    <section className="mb-6">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800 transition-colors mb-2"
      >
        <span className="text-xs">{expanded ? '▼' : '▶'}</span>
        Awaiting your reply ({items.length})
      </button>
      {expanded && (
        <div className="border border-red-200 bg-red-50/30 divide-y divide-red-100">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/businesses/${item.business_id}`}
                    className="text-sm font-medium text-brand-navy hover:text-brand-olive transition-colors truncate"
                  >
                    {item.businesses.name}
                  </Link>
                  {item.contact && (
                    <span className="text-xs text-gray-500 truncate">
                      {item.contact.name}{item.contact.role ? ` · ${item.contact.role}` : ''}
                    </span>
                  )}
                </div>
                {item.subject && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{item.subject}</p>
                )}
              </div>
              {item.entry_date && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatDateShortGB(item.entry_date + 'T00:00:00')}
                </span>
              )}
              <button
                onClick={() => onCreateTodo(item)}
                className="text-xs px-2 py-1 border border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 transition-colors flex-shrink-0"
              >
                Create to-do
              </button>
              <button
                onClick={() => onDismiss(item.id)}
                className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                Done
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function FocusBanner({
  focus,
  onToggle,
}: {
  focus: { task: Task; type: 'priority' | 'suggested' } | null
  onToggle: (t: Task) => void
}) {
  if (!focus) {
    return (
      <div className="mb-6 border border-gray-200 bg-brand-warm px-5 py-4">
        <p className="text-sm font-medium text-gray-500">All clear</p>
        <p className="text-sm text-gray-400 mt-0.5">No open tasks right now.</p>
      </div>
    )
  }

  const { task, type } = focus
  const badge = getSourceBadge(task)
  const urgency = getUrgencyLabel(task)

  return (
    <div className={`mb-6 border px-5 py-4 ${
      type === 'priority'
        ? 'border-amber-300 bg-amber-50/60'
        : 'border-gray-200 bg-brand-warm'
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
            type === 'priority' ? 'text-amber-700' : 'text-gray-500'
          }`}>
            {type === 'priority' ? '★ Your focus today' : 'Suggested focus'}
          </p>
          <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            {task.due_date && (
              <span className={`text-xs ${
                task.due_date < todayStr() ? 'text-red-600 font-medium' : 'text-gray-500'
              }`}>
                {formatDateShortGB(task.due_date + 'T00:00:00')}
              </span>
            )}
            {badge && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy">
                {badge}
              </span>
            )}
            {urgency && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600">
                {urgency}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onToggle(task)}
          className="flex-shrink-0 w-8 h-8 border-2 border-gray-300 hover:border-brand-olive hover:bg-brand-olive/10 flex items-center justify-center transition-colors"
          aria-label="Mark as done"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function BatchedTaskGroup({
  label,
  labelClass,
  tasks,
  onToggle,
  onEdit,
  onSetPriority,
  onClearPriority,
}: {
  label: string
  labelClass: string
  tasks: Task[]
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onSetPriority: (id: string) => void
  onClearPriority: (id: string) => void
}) {
  const batched = useMemo(() => batchCrmTasks(tasks), [tasks])

  return (
    <section>
      <h3 className={`text-sm font-semibold mb-2 ${labelClass}`}>
        {label} ({tasks.length})
      </h3>
      <div className="divide-y divide-gray-100">
        {batched.map((group, i) => {
          if (group.type === 'single') {
            return (
              <TaskRow
                key={group.task.id}
                task={group.task}
                onToggle={onToggle}
                onEdit={onEdit}
                onSetPriority={onSetPriority}
                onClearPriority={onClearPriority}
              />
            )
          }
          return (
            <BatchRow
              key={`batch-${group.date}-${i}`}
              group={group}
              onToggle={onToggle}
              onEdit={onEdit}
              onSetPriority={onSetPriority}
              onClearPriority={onClearPriority}
            />
          )
        })}
      </div>
    </section>
  )
}

function BatchRow({
  group,
  onToggle,
  onEdit,
  onSetPriority,
  onClearPriority,
}: {
  group: { label: string; date: string; tasks: Task[] }
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onSetPriority: (id: string) => void
  onClearPriority: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-brand-warm/50 transition-colors text-left"
      >
        <span className="text-xs text-gray-400 flex-shrink-0">{expanded ? '▼' : '▶'}</span>
        <span className="text-sm text-gray-700 font-medium">{group.label}</span>
        <span className="text-xs text-gray-400 ml-auto">{group.tasks.length} tasks</span>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-50 ml-4 border-l-2 border-gray-100">
          {group.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={onToggle}
              onEdit={onEdit}
              onSetPriority={onSetPriority}
              onClearPriority={onClearPriority}
            />
          ))}
        </div>
      )}
    </div>
  )
}
