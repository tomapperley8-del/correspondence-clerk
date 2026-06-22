'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Task, RenewalStage } from '@/app/actions/tasks'
import { formatDateShortGB } from '@/lib/utils'

const STAGES: { key: RenewalStage; label: string; color: string; bg: string; borderColor: string }[] = [
  { key: 'not_started', label: 'Not started', color: 'text-gray-700', bg: 'bg-gray-50', borderColor: 'border-gray-200' },
  { key: 'in_progress', label: 'In progress', color: 'text-blue-700', bg: 'bg-blue-50/50', borderColor: 'border-blue-200' },
  { key: 'agreed', label: 'Agreed', color: 'text-green-700', bg: 'bg-green-50/50', borderColor: 'border-green-200' },
  { key: 'not_renewing', label: 'Not renewing', color: 'text-red-700', bg: 'bg-red-50/30', borderColor: 'border-red-200' },
  { key: 'done', label: 'Renewed', color: 'text-brand-olive', bg: 'bg-brand-olive/5', borderColor: 'border-brand-olive/20' },
]

function getTypeBadge(task: Task): string {
  if (!task.business) return 'Renewal'
  const b = task.business
  if (b.is_club_card && b.is_advertiser) return 'CC + Ad'
  if (b.is_club_card) return 'Club Card'
  if (b.is_advertiser) return 'Advertiser'
  return 'Renewal'
}

type ContractsViewProps = {
  tasks: Task[]
  today: string
  onStageChange: (taskId: string, stage: RenewalStage) => void
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
}

export function ContractsView({ tasks, today, onStageChange, onToggle, onEdit }: ContractsViewProps) {
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline')

  const byStage = useMemo(() => {
    const map: Record<RenewalStage, Task[]> = {
      not_started: [], in_progress: [], agreed: [], not_renewing: [], done: [],
    }
    for (const t of tasks) {
      const stage = (t.renewal_stage as RenewalStage) || 'not_started'
      if (map[stage]) map[stage].push(t)
      else map.not_started.push(t)
    }
    for (const key of Object.keys(map) as RenewalStage[]) {
      map[key].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      })
    }
    return map
  }, [tasks])

  const activeCount = tasks.filter(t => t.status === 'open').length

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{activeCount} active renewal{activeCount !== 1 ? 's' : ''}</p>
        <div className="flex bg-brand-warm border border-gray-200 p-0.5">
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'pipeline' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'pipeline' ? (
        <PipelineView
          byStage={byStage}
          today={today}
          onStageChange={onStageChange}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      ) : (
        <ListView
          tasks={tasks}
          today={today}
          onStageChange={onStageChange}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      )}
    </div>
  )
}

function PipelineView({
  byStage,
  today,
  onStageChange,
  onToggle,
  onEdit,
}: {
  byStage: Record<RenewalStage, Task[]>
  today: string
  onStageChange: (taskId: string, stage: RenewalStage) => void
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<RenewalStage | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
    setDragTaskId(taskId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, stage: RenewalStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, stage: RenewalStage) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain') || dragTaskId
    if (taskId) onStageChange(taskId, stage)
    setDragTaskId(null)
    setDragOverStage(null)
  }, [dragTaskId, onStageChange])

  const handleDragEnd = useCallback(() => {
    setDragTaskId(null)
    setDragOverStage(null)
  }, [])

  return (
    <div className="grid grid-cols-5 gap-2 min-h-[400px]">
      {STAGES.map((stage) => {
        const tasks = byStage[stage.key]
        const isDragOver = dragOverStage === stage.key
        return (
          <div
            key={stage.key}
            className={`${stage.bg} border ${isDragOver ? 'border-brand-navy border-2' : stage.borderColor} transition-colors`}
            onDragOver={(e) => handleDragOver(e, stage.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.key)}
          >
            <div className={`px-2.5 py-2 border-b ${stage.borderColor}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${stage.color}`}>
                {stage.label}
              </span>
              <span className="text-[10px] text-gray-400 ml-1">({tasks.length})</span>
            </div>
            <div className="p-1.5 space-y-1.5 max-h-[600px] overflow-y-auto">
              {tasks.map((t) => (
                <ContractCard
                  key={t.id}
                  task={t}
                  today={today}
                  onEdit={onEdit}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={dragTaskId === t.id}
                />
              ))}
              {tasks.length === 0 && (
                <p className="text-[10px] text-gray-400 text-center py-6">
                  Drag here
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ContractCard({
  task,
  today,
  onEdit,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task
  today: string
  onEdit: (task: Task) => void
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  const isOverdue = task.due_date && task.due_date < today && task.status === 'open'
  const badge = getTypeBadge(task)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      className={`bg-white border border-gray-200 p-2 shadow-[var(--shadow-sm)] cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <button
          onClick={() => onEdit(task)}
          className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors text-left leading-tight"
        >
          {task.business?.name || task.title}
        </button>
        <span className="text-[9px] font-semibold px-1 py-0.5 bg-brand-navy/10 text-brand-navy flex-shrink-0">
          {badge}
        </span>
      </div>

      {task.due_date && (
        <p className={`text-[10px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
          {isOverdue ? 'Overdue: ' : 'Due: '}{formatDateShortGB(task.due_date + 'T00:00:00')}
        </p>
      )}

      {task.business?.contract_end && (
        <p className="text-[10px] text-gray-400">
          Expires: {formatDateShortGB(task.business.contract_end + 'T00:00:00')}
        </p>
      )}

      <div className="flex items-center justify-end mt-1.5">
        <Link
          href={`/businesses/${task.business_id}`}
          className="text-[10px] text-gray-400 hover:text-brand-navy transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          View →
        </Link>
      </div>
    </div>
  )
}

function ListView({
  tasks,
  today,
  onStageChange,
  onToggle,
  onEdit,
}: {
  tasks: Task[]
  today: string
  onStageChange: (taskId: string, stage: RenewalStage) => void
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  const sorted = useMemo(() =>
    [...tasks].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    }),
    [tasks]
  )

  return (
    <div className="border border-gray-200 divide-y divide-gray-100">
      {sorted.map((t) => (
        <ContractListRow
          key={t.id}
          task={t}
          today={today}
          onStageChange={onStageChange}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      ))}
      {sorted.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No contract renewals right now.
        </div>
      )}
    </div>
  )
}

function ContractListRow({
  task,
  today,
  onStageChange,
  onToggle,
  onEdit,
}: {
  task: Task
  today: string
  onStageChange: (taskId: string, stage: RenewalStage) => void
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  const isOverdue = task.due_date && task.due_date < today && task.status === 'open'
  const badge = getTypeBadge(task)
  const stage = (task.renewal_stage as RenewalStage) || 'not_started'
  const stageInfo = STAGES.find(s => s.key === stage)!

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-brand-warm/50 transition-colors">
      <button
        onClick={() => onToggle(task)}
        className={`flex-shrink-0 w-5 h-5 border-2 flex items-center justify-center transition-colors ${
          task.status === 'done'
            ? 'bg-brand-olive border-brand-olive text-white'
            : 'border-gray-300 hover:border-brand-navy'
        }`}
      >
        {task.status === 'done' && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <button onClick={() => onEdit(task)} className="flex-1 text-left min-w-0">
        <span className={`text-sm block truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.business?.name || task.title}
        </span>
      </button>

      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy flex-shrink-0">
        {badge}
      </span>

      <select
        value={stage}
        onChange={(e) => onStageChange(task.id, e.target.value as RenewalStage)}
        className={`text-[10px] font-medium px-1.5 py-0.5 border border-gray-200 ${stageInfo.bg} ${stageInfo.color} outline-none cursor-pointer`}
      >
        {STAGES.map(s => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      {task.due_date && (
        <span className={`text-xs whitespace-nowrap flex-shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
          {formatDateShortGB(task.due_date + 'T00:00:00')}
        </span>
      )}

      {task.business_id && (
        <Link
          href={`/businesses/${task.business_id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-brand-navy hover:text-brand-olive transition-colors truncate max-w-[100px] flex-shrink-0"
        >
          {task.business?.name}
        </Link>
      )}
    </div>
  )
}
