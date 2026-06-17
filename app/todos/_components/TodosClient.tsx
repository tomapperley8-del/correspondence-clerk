'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Task } from '@/app/actions/tasks'
import {
  createTask,
  updateTask,
  deleteTask,
  setPriority,
  clearPriority,
  refreshTaskCommitments,
} from '@/app/actions/tasks'
import { toast } from '@/lib/toast'
import { QuickAdd } from './QuickAdd'
import { TaskRow } from './TaskRow'
import { TaskEditModal } from './TaskEditModal'
import { CalendarView } from './CalendarView'

type ViewMode = 'list' | 'calendar'
type CategoryFilter = 'all' | 'work' | 'personal'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function groupTasks(tasks: Task[], today: string) {
  const priority: Task[] = []
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
    if (t.is_priority) {
      priority.push(t)
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

  return { priority, overdue, today: todayTasks, upcoming, noDate, done }
}

export function TodosClient({
  initialTasks,
  initialError,
}: {
  initialTasks: Task[]
  initialError: string | null
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [view, setView] = useState<ViewMode>('list')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [doneExpanded, setDoneExpanded] = useState(false)

  const today = todayStr()

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return tasks
    return tasks.filter((t) => t.category === categoryFilter)
  }, [tasks, categoryFilter])

  const groups = useMemo(() => groupTasks(filtered, today), [filtered, today])

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
      // Optimistic update
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

  const isCRM = (t: Task) => t.source === 'contract_renewal' || t.source === 'follow_up'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

      {/* View toggle + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
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
          {/* Priority task */}
          {groups.priority.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-amber-700">★ Focus</span>
              </div>
              <div className="border-l-[3px] border-amber-400 bg-amber-50/50">
                {groups.priority.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={handleToggleStatus}
                    onEdit={setEditingTask}
                    onSetPriority={handleSetPriority}
                    onClearPriority={handleClearPriority}
                    isCRM={isCRM(t)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Overdue */}
          {groups.overdue.length > 0 && (
            <TaskGroup
              label="Overdue"
              labelClass="text-red-700"
              tasks={groups.overdue}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
              isCRM={isCRM}
            />
          )}

          {/* Today */}
          {groups.today.length > 0 && (
            <TaskGroup
              label="Today"
              labelClass="text-brand-navy"
              tasks={groups.today}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
              isCRM={isCRM}
            />
          )}

          {/* Upcoming */}
          {groups.upcoming.length > 0 && (
            <TaskGroup
              label="Upcoming"
              labelClass="text-gray-700"
              tasks={groups.upcoming}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
              isCRM={isCRM}
            />
          )}

          {/* No date */}
          {groups.noDate.length > 0 && (
            <TaskGroup
              label="No date"
              labelClass="text-gray-500"
              tasks={groups.noDate}
              onToggle={handleToggleStatus}
              onEdit={setEditingTask}
              onSetPriority={handleSetPriority}
              onClearPriority={handleClearPriority}
              isCRM={isCRM}
            />
          )}

          {/* Done (collapsed) */}
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
                      isCRM={isCRM(t)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Empty state */}
          {filtered.length === 0 && !initialError && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg mb-2">No to-dos yet</p>
              <p className="text-sm">Add one above, or refresh from CRM to pull in commitments.</p>
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
          isCRM={isCRM}
        />
      )}

      {/* Edit modal */}
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

function TaskGroup({
  label,
  labelClass,
  tasks,
  onToggle,
  onEdit,
  onSetPriority,
  onClearPriority,
  isCRM,
}: {
  label: string
  labelClass: string
  tasks: Task[]
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onSetPriority: (id: string) => void
  onClearPriority: (id: string) => void
  isCRM: (t: Task) => boolean
}) {
  return (
    <section>
      <h3 className={`text-sm font-semibold mb-2 ${labelClass}`}>
        {label} ({tasks.length})
      </h3>
      <div className="divide-y divide-gray-100">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onToggle={onToggle}
            onEdit={onEdit}
            onSetPriority={onSetPriority}
            onClearPriority={onClearPriority}
            isCRM={isCRM(t)}
          />
        ))}
      </div>
    </section>
  )
}
