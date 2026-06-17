'use client'

import Link from 'next/link'
import type { Task } from '@/app/actions/tasks'
import { formatDateShortGB } from '@/lib/utils'

export function TaskRow({
  task,
  onToggle,
  onEdit,
  onSetPriority,
  onClearPriority,
  isCRM,
  compact,
}: {
  task: Task
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onSetPriority: (id: string) => void
  onClearPriority: (id: string) => void
  isCRM: boolean
  compact?: boolean
}) {
  const isDone = task.status === 'done'

  return (
    <div
      className={`flex items-center gap-3 py-2.5 px-3 group hover:bg-brand-warm/50 transition-colors ${
        compact ? 'py-1.5 px-2' : ''
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task)}
        className={`flex-shrink-0 w-5 h-5 border-2 flex items-center justify-center transition-colors ${
          isDone
            ? 'bg-brand-olive border-brand-olive text-white'
            : 'border-gray-300 hover:border-brand-navy'
        }`}
        aria-label={isDone ? 'Mark as open' : 'Mark as done'}
      >
        {isDone && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <button
        onClick={() => onEdit(task)}
        className={`flex-1 text-left text-sm min-w-0 ${
          isDone ? 'line-through text-gray-400' : 'text-gray-800'
        }`}
      >
        <span className="block truncate">
          {task.is_priority && !isDone && (
            <span className="text-amber-500 mr-1">★</span>
          )}
          {task.title}
        </span>
      </button>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isCRM && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy">
            CRM
          </span>
        )}

        {task.category === 'personal' && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-purple-50 text-purple-600">
            Personal
          </span>
        )}

        {task.due_date && !compact && (
          <span className={`text-xs whitespace-nowrap ${
            !isDone && task.due_date < new Date().toISOString().slice(0, 10)
              ? 'text-red-600 font-medium'
              : 'text-gray-400'
          }`}>
            {formatDateShortGB(task.due_date + 'T00:00:00')}
          </span>
        )}

        {isCRM && task.business_id && task.business && (
          <Link
            href={`/businesses/${task.business_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-brand-navy hover:text-brand-olive transition-colors truncate max-w-[120px]"
            title={task.business.name}
          >
            {task.business.name}
          </Link>
        )}

        {/* Priority toggle — visible on hover */}
        {!isDone && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              task.is_priority ? onClearPriority(task.id) : onSetPriority(task.id)
            }}
            className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 ${
              task.is_priority
                ? 'text-amber-600 hover:text-amber-800'
                : 'text-gray-400 hover:text-amber-500'
            }`}
            title={task.is_priority ? 'Remove focus' : 'Set as focus'}
          >
            {task.is_priority ? '★' : '☆'}
          </button>
        )}
      </div>
    </div>
  )
}
