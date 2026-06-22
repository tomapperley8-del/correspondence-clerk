'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import type { Task, RenewalStage } from '@/app/actions/tasks'
import { formatDateShortGB } from '@/lib/utils'

const STAGES: { key: RenewalStage; label: string; color: string; bg: string }[] = [
  { key: 'not_started', label: 'Not started', color: 'text-gray-700', bg: 'bg-gray-50' },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-700', bg: 'bg-blue-50' },
  { key: 'awaiting_reply', label: 'Awaiting reply', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'agreed', label: 'Agreed', color: 'text-green-700', bg: 'bg-green-50' },
  { key: 'done', label: 'Renewed', color: 'text-brand-olive', bg: 'bg-brand-olive/5' },
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
      not_started: [], contacted: [], awaiting_reply: [], agreed: [], done: [],
    }
    for (const t of tasks) {
      const stage = t.renewal_stage || 'not_started'
      map[stage].push(t)
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
  return (
    <div className="grid grid-cols-5 gap-3">
      {STAGES.map((stage) => {
        const tasks = byStage[stage.key]
        return (
          <div key={stage.key} className={`${stage.bg} border border-gray-200 min-h-[200px]`}>
            <div className={`px-3 py-2 border-b border-gray-200 ${stage.color}`}>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {stage.label}
              </span>
              <span className="text-xs text-gray-400 ml-1.5">({tasks.length})</span>
            </div>
            <div className="p-2 space-y-2">
              {tasks.map((t) => (
                <ContractCard
                  key={t.id}
                  task={t}
                  today={today}
                  currentStage={stage.key}
                  onStageChange={onStageChange}
                  onToggle={onToggle}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </div>
        )
      })}
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

function ContractCard({
  task,
  today,
  currentStage,
  onStageChange,
  onToggle,
  onEdit,
}: {
  task: Task
  today: string
  currentStage: RenewalStage
  onStageChange: (taskId: string, stage: RenewalStage) => void
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  const isOverdue = task.due_date && task.due_date < today && task.status === 'open'
  const badge = getTypeBadge(task)
  const stageIdx = STAGES.findIndex(s => s.key === currentStage)
  const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null

  return (
    <div className="bg-white border border-gray-200 p-2.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <button onClick={() => onEdit(task)} className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors text-left leading-tight">
          {task.business?.name || task.title}
        </button>
        <span className="text-[9px] font-semibold px-1 py-0.5 bg-brand-navy/10 text-brand-navy flex-shrink-0">
          {badge}
        </span>
      </div>

      {task.due_date && (
        <p className={`text-[10px] mb-1.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
          {isOverdue ? 'Overdue: ' : 'Due: '}{formatDateShortGB(task.due_date + 'T00:00:00')}
        </p>
      )}

      {task.business?.contract_end && (
        <p className="text-[10px] text-gray-400 mb-1.5">
          Expires: {formatDateShortGB(task.business.contract_end + 'T00:00:00')}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2">
        {nextStage && task.status === 'open' && (
          <button
            onClick={() => onStageChange(task.id, nextStage.key)}
            className={`text-[10px] px-1.5 py-0.5 border font-medium transition-colors ${nextStage.color} border-current/20 hover:opacity-80`}
          >
            → {nextStage.label}
          </button>
        )}
        {currentStage === 'done' && task.status === 'open' && (
          <button
            onClick={() => onToggle(task)}
            className="text-[10px] px-1.5 py-0.5 border border-brand-olive/30 text-brand-olive font-medium hover:bg-brand-olive/10 transition-colors"
          >
            Complete
          </button>
        )}
        <Link
          href={`/businesses/${task.business_id}`}
          className="text-[10px] text-gray-400 hover:text-brand-navy transition-colors ml-auto"
        >
          View →
        </Link>
      </div>
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
  const stage = task.renewal_stage || 'not_started'
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
