'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Task } from '@/app/actions/tasks'
import { updateTask } from '@/app/actions/tasks'
import { formatDateShortGB } from '@/lib/utils'
import { toast } from '@/lib/toast'

export function TasksSection({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  async function markDone(task: Task) {
    setTasks(prev => prev.filter(t => t.id !== task.id))
    const result = await updateTask(task.id, { status: 'done' })
    if (result.error) {
      setTasks(prev => [task, ...prev])
      toast.error(result.error)
    } else {
      toast.success('Task done')
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400">Nothing due today. Enjoy the quiet.</p>
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="divide-y divide-gray-100">
      {tasks.map(task => {
        const overdue = task.due_date !== null && task.due_date < today
        return (
          <div key={task.id} className="flex items-center gap-3 py-2.5">
            <button
              onClick={() => markDone(task)}
              className="flex-shrink-0 w-5 h-5 border-2 border-gray-300 hover:border-brand-navy flex items-center justify-center transition-colors"
              aria-label={`Mark ${task.title} as done`}
              title="Mark as done"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 truncate">
                {task.is_priority && <span className="text-amber-500 mr-1">★</span>}
                {task.title}
              </p>
              <p className="text-xs text-gray-400">
                {task.due_date && (
                  <span className={overdue ? 'text-red-600 font-medium' : ''}>
                    {overdue ? 'Overdue · ' : ''}
                    {task.due_time ? `${task.due_time} ` : ''}
                    {formatDateShortGB(task.due_date + 'T00:00:00')}
                  </span>
                )}
                {task.business && (
                  <>
                    {task.due_date ? ' · ' : ''}
                    <Link
                      href={`/businesses/${task.business_id}`}
                      className="text-brand-navy hover:text-brand-olive transition-colors"
                    >
                      {task.business.name}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
