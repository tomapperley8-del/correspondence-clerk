'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Task, TaskCategory } from '@/app/actions/tasks'
import {
  createTask,
  updateTask,
  deleteTask,
  setPriority,
  clearPriority,
  refreshTaskCommitments,
  createTaskFromCorrespondence,
} from '@/app/actions/tasks'
import { getCategoryColor } from '@/lib/task-colors'
import { markCorrespondenceDone, type GoneQuietItem } from '@/app/actions/correspondence'
import { updateBusiness, updateBusinessRenewalStage, addBusinessToContracts, updateOutreachStage, addBusinessToOutreach, removeBusinessFromOutreach, promoteOutreachToContracts } from '@/app/actions/businesses'
import type { ContractBusiness, OutreachBusiness } from '@/app/actions/businesses'
import { createContract, updateContract, getContractsByBusiness } from '@/app/actions/contracts'
import { toast } from '@/lib/toast'
import { formatDateShortGB } from '@/lib/utils'
import { QuickAdd } from './QuickAdd'
import { TaskRow } from './TaskRow'
import { TaskEditModal } from './TaskEditModal'
import { CalendarView } from './CalendarView'
import { ContractsView } from './ContractsView'
import { OutreachView } from './OutreachView'
import type { NeedsReplyItem } from '../page'

type ViewMode = 'list' | 'calendar' | 'contracts' | 'outreach'
type TimeFilter = 'week' | 'all'

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr() {
  return toLocalDateStr(new Date())
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toLocalDateStr(d)
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
  initialCategories,
  initialError,
  initialNeedsReply,
  initialGoneQuiet,
  initialContractBusinesses,
  initialOutreachBusinesses,
  allBusinessNames,
}: {
  initialTasks: Task[]
  initialCategories: TaskCategory[]
  initialError: string | null
  initialNeedsReply: NeedsReplyItem[]
  initialGoneQuiet: GoneQuietItem[]
  initialContractBusinesses: ContractBusiness[]
  initialOutreachBusinesses: OutreachBusiness[]
  allBusinessNames: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [categories] = useState<TaskCategory[]>(initialCategories)
  const [needsReply, setNeedsReply] = useState<NeedsReplyItem[]>(initialNeedsReply)
  const [goneQuiet, setGoneQuiet] = useState<GoneQuietItem[]>(initialGoneQuiet)
  const [contractBusinesses, setContractBusinesses] = useState<ContractBusiness[]>(initialContractBusinesses)
  const [outreachBusinesses, setOutreachBusinesses] = useState<OutreachBusiness[]>(initialOutreachBusinesses)
  const [view, setView] = useState<ViewMode>('list')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [createdTodoIds, setCreatedTodoIds] = useState<Set<string>>(new Set())
  const [activeCategoryIds, setActiveCategoryIds] = useState<Set<string>>(() => new Set(initialCategories.map((c) => c.id)))

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

  const isContractTask = useCallback((t: Task) => {
    if (t.source === 'contract_renewal') return true
    if (!t.business_id) return false
    const tl = t.title.toLowerCase()
    return /^renewal[: ]/.test(tl) || /^cc (expires|offer)/.test(tl) || /^club card offer/.test(tl)
  }, [])

  const nonContractTasks = useMemo(() =>
    tasks.filter((t) => !isContractTask(t)),
    [tasks, isContractTask]
  )

  const filtered = useMemo(() => {
    let result = nonContractTasks.filter((t) => !t.task_category_id || activeCategoryIds.has(t.task_category_id))
    if (timeFilter === 'week') {
      result = result.filter((t) => {
        if (t.status === 'done') return true
        if (!t.due_date) return false
        return t.due_date <= weekEnd
      })
    }
    return result
  }, [nonContractTasks, timeFilter, weekEnd, activeCategoryIds])

  const allForCalendar = useMemo(() =>
    tasks.filter((t) => !t.task_category_id || activeCategoryIds.has(t.task_category_id)),
    [tasks, activeCategoryIds]
  )

  const groups = useMemo(() => groupTasks(filtered, today), [filtered, today])

  const nrOverdue = useMemo(() =>
    needsReply.filter((r) => r.entry_date && r.entry_date < today),
    [needsReply, today]
  )
  const nrToday = useMemo(() =>
    needsReply.filter((r) => !r.entry_date || r.entry_date >= today),
    [needsReply, today]
  )

  const weekAheadDays = useMemo(() => {
    const days: { date: string; label: string; isToday: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i)
      const dt = new Date(d + 'T00:00:00')
      days.push({
        date: d,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-GB', { weekday: 'short' }),
        isToday: i === 0,
      })
    }
    return days
  }, [today])

  const overdueOpen = useMemo(() =>
    tasks.filter((t) => t.status === 'open' && t.due_date && t.due_date < today && (!t.task_category_id || activeCategoryIds.has(t.task_category_id))),
    [tasks, today, activeCategoryIds]
  )

  const priorityCatNames = useMemo(() => new Set(['call', 'event', 'meeting']), [])

  const weekAheadTasks = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (t.status === 'open' && t.due_date && t.due_date >= today && t.due_date <= weekEnd && (!t.task_category_id || activeCategoryIds.has(t.task_category_id))) {
        if (!map[t.due_date]) map[t.due_date] = []
        map[t.due_date].push(t)
      }
    }
    for (const date of Object.keys(map)) {
      map[date].sort((a, b) => {
        const aP = a.task_category?.name && priorityCatNames.has(a.task_category.name.toLowerCase()) ? 0 : 1
        const bP = b.task_category?.name && priorityCatNames.has(b.task_category.name.toLowerCase()) ? 0 : 1
        return aP - bP
      })
    }
    return map
  }, [tasks, today, weekEnd, priorityCatNames, activeCategoryIds])

  const handleCreate = useCallback(
    async (title: string, due_date: string | null, category: 'work' | 'personal', task_category_id?: string, due_time?: string | null) => {
      const result = await createTask({ title, due_date, due_time: due_time || null, category, task_category_id: task_category_id || null })
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
        setCreatedTodoIds((prev) => new Set([...prev, item.id]))
        setEditingTask(result.data)
      }
    },
    []
  )

  const handleMuteBusiness = useCallback(
    async (businessId: string) => {
      setNeedsReply((prev) => prev.filter((r) => r.business_id !== businessId))
      const result = await updateBusiness(businessId, { mute_replies: true })
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else {
        toast.success('Muted — won\'t appear in awaiting reply')
      }
    },
    [router]
  )

  const handleStageChange = useCallback(
    async (businessId: string, stage: string) => {
      setContractBusinesses((prev) =>
        prev.map((b) => (b.id === businessId ? {
          ...b,
          renewal_stage: stage === 'renewed' ? 'not_started' : stage,
          renewal_contacted_at: stage === 'contacted' ? todayStr() : stage === 'renewed' ? null : b.renewal_contacted_at,
        } : b))
      )
      const result = await updateBusinessRenewalStage(businessId, stage)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else if (stage === 'renewed') {
        toast.success('Marked as renewed — moved back to To Contact')
      }
    },
    [router]
  )

  const handleRenew = useCallback(
    async (businessId: string, contract: { contract_start: string; contract_end: string; contract_amount: number | null; contract_currency: string; billing_frequency: 'monthly' | 'annual'; membership_type: string }) => {
      const existingResult = await getContractsByBusiness(businessId)
      if (existingResult.data) {
        const sametype = existingResult.data.filter(c => c.is_current && c.membership_type === contract.membership_type)
        for (const old of sametype) {
          await updateContract(old.id, businessId, { is_current: false })
        }
      }

      const createResult = await createContract(businessId, {
        contract_start: contract.contract_start,
        contract_end: contract.contract_end,
        contract_amount: contract.contract_amount,
        contract_currency: contract.contract_currency,
        billing_frequency: contract.billing_frequency,
        membership_type: contract.membership_type,
        is_current: true,
      })

      if (createResult.error) {
        toast.error(createResult.error)
        return
      }

      setContractBusinesses((prev) =>
        prev.map((b) => (b.id === businessId ? {
          ...b,
          renewal_stage: 'not_started',
          renewal_contacted_at: null,
          current_contract_start: contract.contract_start,
          current_contract_end: contract.contract_end,
          current_contract_amount: contract.contract_amount,
          current_contract_currency: contract.contract_currency,
        } : b))
      )
      await updateBusinessRenewalStage(businessId, 'renewed')
      toast.success('Contract renewed — moved back to To Contact')
    },
    []
  )

  const handleAddBusinessToContracts = useCallback(
    async (businessId: string, type: 'club_card' | 'advertiser') => {
      const result = await addBusinessToContracts(businessId, type)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Business added to contracts')
        router.refresh()
      }
    },
    [router]
  )

  const handleOutreachStageChange = useCallback(
    async (businessId: string, stage: string) => {
      if (stage === 'invoice_paid') {
        const biz = outreachBusinesses.find(b => b.id === businessId)
        setOutreachBusinesses((prev) => prev.filter((b) => b.id !== businessId))
        if (biz) {
          const isCC = biz.is_club_card || (!biz.is_club_card && !biz.is_advertiser)
          setContractBusinesses((prev) => [...prev, {
            id: biz.id,
            name: biz.name,
            is_club_card: isCC,
            is_advertiser: biz.is_advertiser,
            renewal_stage: 'not_started',
            renewal_contacted_at: null,
            current_contract_end: null,
            current_contract_start: null,
            current_contract_amount: null,
            current_contract_currency: null,
            current_invoice_paid: false,
          }])
        }
        const result = await promoteOutreachToContracts(businessId)
        if (result.error) {
          toast.error(result.error)
          router.refresh()
        } else {
          toast.success('Invoice paid! Moved to CC/Advertising pipeline')
        }
        return
      }
      setOutreachBusinesses((prev) =>
        prev.map((b) => (b.id === businessId ? {
          ...b,
          outreach_stage: stage,
          outreach_contacted_at: stage === 'contacted' ? todayStr() : b.outreach_contacted_at,
          outreach_followed_up_at: stage === 'followed_up' ? todayStr() : b.outreach_followed_up_at,
        } : b))
      )
      const result = await updateOutreachStage(businessId, stage)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router, outreachBusinesses]
  )

  const handleAddOutreachBusiness = useCallback(
    async (businessId: string) => {
      const biz = allBusinessNames.find(b => b.id === businessId)
      if (biz) {
        setOutreachBusinesses((prev) => [...prev, {
          id: biz.id,
          name: biz.name,
          is_club_card: false,
          is_advertiser: false,
          outreach_stage: 'identified',
          outreach_contacted_at: null,
          outreach_followed_up_at: null,
        }])
      }
      const result = await addBusinessToOutreach(businessId)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else {
        toast.success('Added to outreach pipeline')
      }
    },
    [allBusinessNames, router]
  )

  const handleRemoveOutreachBusiness = useCallback(
    async (businessId: string) => {
      setOutreachBusinesses((prev) => prev.filter((b) => b.id !== businessId))
      const result = await removeBusinessFromOutreach(businessId)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else {
        toast.success('Removed from outreach')
      }
    },
    [router]
  )

  // Keyboard shortcuts: D=done, S=snooze 7d, ↑↓=navigate
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const flatTasks = useMemo(() => {
    if (view !== 'list') return []
    const items: Task[] = []
    items.push(...groups.overdue, ...groups.today, ...groups.upcoming, ...groups.noDate)
    return items
  }, [view, groups])

  useEffect(() => {
    if (view !== 'list') return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, flatTasks.length - 1))
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      }
      if (e.key === 'd' && selectedIdx >= 0 && flatTasks[selectedIdx]) {
        e.preventDefault()
        handleToggleStatus(flatTasks[selectedIdx])
      }
      if (e.key === 's' && selectedIdx >= 0 && flatTasks[selectedIdx]) {
        e.preventDefault()
        const task = flatTasks[selectedIdx]
        handleUpdate(task.id, { due_date: addDays(today, 7) })
        toast.success('Snoozed 7 days')
      }
      if (e.key === 'e' && selectedIdx >= 0 && flatTasks[selectedIdx]) {
        e.preventDefault()
        setEditingTask(flatTasks[selectedIdx])
      }
      if (e.key === 'Escape') {
        setSelectedIdx(-1)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [view, flatTasks, selectedIdx, today, handleToggleStatus, handleUpdate])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1>Tasks</h1>
        <button
          onClick={handleRefreshCRM}
          disabled={refreshing}
          className="text-sm px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing…' : 'Refresh CRM'}
        </button>
      </div>

      {initialError && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 mb-4 text-sm text-red-800">
          {initialError}
        </div>
      )}

      {/* Quick add — primary action, always visible at top */}
      <QuickAdd onAdd={handleCreate} categories={categories} />

      {/* Tabs + category filter — single line */}
      <div className="flex items-center justify-between mt-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-1">
          {(['list', 'calendar', 'contracts', 'outreach'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v
                  ? 'text-brand-navy border-b-2 border-brand-navy'
                  : 'text-gray-500 hover:text-brand-navy'
              }`}
            >
              {v === 'list' ? 'List' : v === 'calendar' ? 'Calendar' : v === 'contracts' ? `CC/Advertising (${contractBusinesses.length})` : `Outreach (${outreachBusinesses.length})`}
            </button>
          ))}
          {view === 'list' && (
            <>
              <span className="mx-1.5 w-px h-4 bg-gray-200" />
              <button
                onClick={() => handleTimeFilterChange(timeFilter === 'week' ? 'all' : 'week')}
                className={`px-2 py-1 text-[11px] font-medium transition-colors border ${
                  timeFilter === 'week'
                    ? 'bg-brand-navy/5 text-brand-navy border-brand-navy/20'
                    : 'bg-white text-gray-500 border-gray-200 hover:text-brand-navy'
                }`}
              >
                {timeFilter === 'week' ? 'This week' : 'All dates'}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-end">
          <button
            onClick={() => {
              if (activeCategoryIds.size === categories.length) {
                setActiveCategoryIds(new Set())
              } else {
                setActiveCategoryIds(new Set(categories.map((c) => c.id)))
              }
            }}
            className={`px-1.5 py-0.5 text-[11px] font-medium transition-colors border ${
              activeCategoryIds.size === categories.length
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const col = getCategoryColor(cat.color)
            const isActive = activeCategoryIds.has(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategoryIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(cat.id)) next.delete(cat.id)
                    else next.add(cat.id)
                    return next
                  })
                }}
                className={`px-1.5 py-0.5 text-[11px] font-medium transition-colors border flex items-center gap-1 ${
                  isActive
                    ? `${col.pill} ${col.border}`
                    : 'bg-white text-gray-400 border-gray-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-sm ${isActive ? col.dot : 'bg-gray-300'}`} />
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Week-ahead rail — list view only */}
      {view === 'list' && (
        <div className="mt-3 border border-gray-200 bg-white">
          <div className="flex">
            {overdueOpen.length > 0 && (
              <div className="flex-shrink-0 w-24 border-r border-gray-200 bg-red-50/50">
                <div className="px-2 py-1.5 border-b border-gray-200">
                  <p className="text-[10px] font-semibold text-red-600 uppercase">Overdue</p>
                  <p className="text-xs text-red-500">{overdueOpen.length}</p>
                </div>
                <div className="px-1.5 py-1 space-y-0.5 max-h-[100px] overflow-y-auto">
                  {overdueOpen.slice(0, 5).map((t) => {
                    const col = getCategoryColor(t.task_category?.color)
                    return (
                      <button key={t.id} onClick={() => setEditingTask(t)} className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 truncate ${col.pill}`} title={t.title}>
                        {t.title}
                      </button>
                    )
                  })}
                  {overdueOpen.length > 5 && <span className="text-[9px] text-red-400 px-1">+{overdueOpen.length - 5} more</span>}
                </div>
              </div>
            )}
            {weekAheadDays.map(({ date, label, isToday }) => {
              const dayTasks = weekAheadTasks[date] ?? []
              const dayNum = new Date(date + 'T00:00:00').getDate()
              return (
                <div key={date} className={`flex-1 min-w-0 border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-brand-navy/[0.03]' : ''}`}>
                  <div className="px-2 py-1.5 border-b border-gray-200">
                    <p className={`text-[10px] font-semibold uppercase ${isToday ? 'text-brand-navy' : 'text-gray-500'}`}>{label}</p>
                    <p className={`text-xs ${isToday ? 'text-brand-navy' : 'text-gray-400'}`}>{dayNum}</p>
                  </div>
                  <div className="px-1.5 py-1 space-y-0.5 min-h-[40px] max-h-[100px] overflow-y-auto">
                    {dayTasks.length === 0 && <span className="text-[9px] text-gray-300 block text-center py-2">—</span>}
                    {dayTasks.slice(0, 4).map((t) => {
                      const col = getCategoryColor(t.task_category?.color)
                      return (
                        <button key={t.id} onClick={() => setEditingTask(t)} className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 truncate ${col.pill}`} title={t.title}>
                          {t.title}
                        </button>
                      )
                    })}
                    {dayTasks.length > 4 && <span className="text-[9px] text-gray-400 px-1">+{dayTasks.length - 4}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Views */}
      {view === 'list' && (
        <div className="space-y-6 mt-4">
          {(groups.overdue.length > 0 || nrOverdue.length > 0) && (
            <section>
              <h3 className="text-sm font-semibold mb-2 text-red-700">
                Overdue ({groups.overdue.length + nrOverdue.length})
              </h3>
              <div className="divide-y divide-gray-100">
                {nrOverdue.map((item) => (
                  <NeedsReplyRow
                    key={`nr-${item.id}`}
                    item={item}
                    todoCreated={createdTodoIds.has(item.id)}
                    onDismiss={handleDismissReply}
                    onCreateTodo={handleCreateTodoFromReply}
                    onMute={handleMuteBusiness}
                  />
                ))}
              </div>
              {groups.overdue.length > 0 && (
                <BatchedTaskGroup
                  label=""
                  labelClass=""
                  tasks={groups.overdue}
                  onToggle={handleToggleStatus}
                  onEdit={setEditingTask}
                  onSetPriority={handleSetPriority}
                  onClearPriority={handleClearPriority}
                  selectedTaskId={selectedIdx >= 0 ? flatTasks[selectedIdx]?.id : undefined}
                  hideHeader
                />
              )}
            </section>
          )}

          {(groups.today.length > 0 || nrToday.length > 0) && (
            <section>
              <h3 className="text-sm font-semibold mb-2 text-brand-navy">
                Today ({groups.today.length + nrToday.length})
              </h3>
              <div className="divide-y divide-gray-100">
                {nrToday.map((item) => (
                  <NeedsReplyRow
                    key={`nr-${item.id}`}
                    item={item}
                    todoCreated={createdTodoIds.has(item.id)}
                    onDismiss={handleDismissReply}
                    onCreateTodo={handleCreateTodoFromReply}
                    onMute={handleMuteBusiness}
                  />
                ))}
              </div>
              {groups.today.length > 0 && (
                <BatchedTaskGroup
                  label=""
                  labelClass=""
                  tasks={groups.today}
                  onToggle={handleToggleStatus}
                  onEdit={setEditingTask}
                  onSetPriority={handleSetPriority}
                  onClearPriority={handleClearPriority}
                  selectedTaskId={selectedIdx >= 0 ? flatTasks[selectedIdx]?.id : undefined}
                  hideHeader
                />
              )}
            </section>
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
              selectedTaskId={selectedIdx >= 0 ? flatTasks[selectedIdx]?.id : undefined}
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
              selectedTaskId={selectedIdx >= 0 ? flatTasks[selectedIdx]?.id : undefined}
            />
          )}

          {goneQuiet.length > 0 && (
            <GoneQuietSection
              items={goneQuiet}
              onFollowUp={(item) => {
                handleCreate(
                  `Follow up with ${item.business_name}`,
                  addDays(today, 0),
                  'work'
                )
                setGoneQuiet((prev) => prev.filter((g) => g.business_id !== item.business_id))
              }}
              onDismiss={(businessId) => {
                setGoneQuiet((prev) => prev.filter((g) => g.business_id !== businessId))
              }}
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

          {filtered.length === 0 && needsReply.length === 0 && !initialError && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg mb-2">
                {timeFilter === 'week' ? 'Nothing due this week' : 'No tasks yet'}
              </p>
              <p className="text-sm">
                {timeFilter === 'week'
                  ? 'Switch to "All" to see everything, or add a new task above.'
                  : 'Add one above, or refresh from CRM to pull in commitments.'}
              </p>
            </div>
          )}

          {/* Keyboard shortcut hint */}
          {flatTasks.length > 0 && (
            <div className="text-[10px] text-gray-400 flex gap-3 pt-2">
              <span>↑↓ navigate</span>
              <span>D done</span>
              <span>S snooze</span>
              <span>E edit</span>
              <span>Esc deselect</span>
            </div>
          )}
        </div>
      )}

      {view === 'calendar' && (
        <CalendarView
          tasks={allForCalendar}
          categories={categories}
          today={today}
          onToggle={handleToggleStatus}
          onEdit={setEditingTask}
          onQuickAdd={handleCreate}
          onDateChange={handleDateChange}
        />
      )}

      {view === 'contracts' && (
        <ContractsView
          businesses={contractBusinesses}
          today={today}
          onStageChange={handleStageChange}
          onRenew={handleRenew}
          onAddBusiness={handleAddBusinessToContracts}
          allBusinessNames={allBusinessNames}
          onMoveToOutreach={(businessId) => {
            handleAddOutreachBusiness(businessId)
          }}
        />
      )}

      {view === 'outreach' && (
        <OutreachView
          businesses={outreachBusinesses}
          onStageChange={handleOutreachStageChange}
          onAddBusiness={handleAddOutreachBusiness}
          onRemoveBusiness={handleRemoveOutreachBusiness}
          allBusinessNames={allBusinessNames}
        />
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          categories={categories}
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

function NeedsReplyRow({
  item,
  todoCreated,
  onDismiss,
  onCreateTodo,
  onMute,
}: {
  item: NeedsReplyItem
  todoCreated: boolean
  onDismiss: (id: string) => void
  onCreateTodo: (item: NeedsReplyItem) => void
  onMute: (businessId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-red-50/40">
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-red-50/70 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-red-100 text-red-700 flex-shrink-0">
          Reply
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/businesses/${item.business_id}`}
              className="text-sm font-medium text-brand-navy hover:text-brand-olive transition-colors truncate"
              onClick={(e) => e.stopPropagation()}
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
        <span className="text-[10px] text-gray-400 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
        {todoCreated ? (
          <span className="text-xs px-2 py-1 bg-brand-olive/10 text-brand-olive font-medium flex-shrink-0">
            Task created
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onCreateTodo(item) }}
            className="text-xs px-2 py-1 border border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 transition-colors flex-shrink-0"
          >
            Create task
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onMute(item.business_id) }}
          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Mute this business — never show in awaiting reply"
        >
          Mute
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(item.id) }}
          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          Done
        </button>
      </div>
      {expanded && item.formatted_text_current && (
        <div className="px-4 pb-3 pt-1 border-t border-red-100/50 ml-10">
          <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-white border border-gray-100 p-3 max-h-[300px] overflow-y-auto">
            {item.formatted_text_current}
          </div>
        </div>
      )}
      {expanded && !item.formatted_text_current && (
        <div className="px-4 pb-3 pt-1 border-t border-red-100/50 ml-10">
          <p className="text-xs text-gray-400 italic">No email content available</p>
        </div>
      )}
    </div>
  )
}

function GoneQuietSection({
  items,
  onFollowUp,
  onDismiss,
}: {
  items: GoneQuietItem[]
  onFollowUp: (item: GoneQuietItem) => void
  onDismiss: (businessId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const visible = showAll ? items : items.slice(0, 10)

  if (items.length === 0) return null

  return (
    <section>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors mb-2"
      >
        <span className="text-xs">{expanded ? '▼' : '▶'}</span>
        Gone quiet ({items.length})
      </button>
      {expanded && (
        <div className="border border-gray-200 bg-brand-warm divide-y divide-gray-100">
          {visible.map((item) => (
            <div key={item.business_id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 flex-shrink-0">
                {item.days_since}d
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/businesses/${item.business_id}`}
                  className="text-sm text-brand-navy hover:text-brand-olive transition-colors truncate block"
                >
                  {item.business_name}
                </Link>
                {item.subject && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">Last: {item.subject}</p>
                )}
              </div>
              <button
                onClick={() => onFollowUp(item)}
                className="text-xs px-2 py-1 text-brand-navy hover:bg-brand-navy/5 transition-colors flex-shrink-0"
              >
                Follow up
              </button>
              <button
                onClick={() => onDismiss(item.business_id)}
                className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
          {items.length > 10 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-center py-2 text-xs text-brand-navy hover:bg-brand-navy/5 transition-colors"
            >
              Show all {items.length}
            </button>
          )}
        </div>
      )}
    </section>
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
  hideHeader,
  selectedTaskId,
}: {
  label: string
  labelClass: string
  tasks: Task[]
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onSetPriority: (id: string) => void
  onClearPriority: (id: string) => void
  hideHeader?: boolean
  selectedTaskId?: string
}) {
  const batched = useMemo(() => batchCrmTasks(tasks), [tasks])

  return (
    <section>
      {!hideHeader && (
        <h3 className={`text-sm font-semibold mb-2 ${labelClass}`}>
          {label} ({tasks.length})
        </h3>
      )}
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
                selected={group.task.id === selectedTaskId}
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
