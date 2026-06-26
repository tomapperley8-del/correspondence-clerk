'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Task, TaskCategory } from '@/app/actions/tasks'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'
import { getCategoryColor } from '@/lib/task-colors'

export function TaskEditModal({
  task,
  categories,
  onClose,
  onUpdate,
  onDelete,
  onSetPriority,
  onClearPriority,
}: {
  task: Task
  categories: TaskCategory[]
  onClose: () => void
  onUpdate: (id: string, updates: {
    title?: string
    due_date?: string | null
    due_time?: string | null
    status?: 'open' | 'done'
    category?: 'work' | 'personal'
    notes?: string | null
    task_category_id?: string | null
  }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSetPriority: (id: string) => Promise<void>
  onClearPriority: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [dueTime, setDueTime] = useState(task.due_time ?? '')
  const [category, setCategory] = useState(task.category)
  const [selectedCategoryId, setSelectedCategoryId] = useState(task.task_category_id ?? categories[0]?.id ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const modalRef = useModalKeyboard(true, onClose)

  const selectedCat = categories.find((c) => c.id === selectedCategoryId)
  const catLabel = selectedCat?.name?.toLowerCase() ?? 'task'

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSaving(true)
    setError(null)
    await onUpdate(task.id, {
      title: title.trim(),
      due_date: dueDate || null,
      due_time: dueTime || null,
      category,
      task_category_id: selectedCategoryId || null,
      notes: notes.trim() || null,
    })
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return
    setDeleting(true)
    await onDelete(task.id)
    setDeleting(false)
  }

  const handleToggleStatus = async () => {
    const newStatus = task.status === 'open' ? 'done' : 'open'
    await onUpdate(task.id, { status: newStatus })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-label={`Edit ${catLabel}`}
        className="bg-white border border-gray-200 w-full max-w-lg p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg">Edit {catLabel}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 mb-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {task.business && (
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Link
              href={`/businesses/${task.business_id}`}
              className="text-brand-navy hover:text-brand-olive transition-colors"
            >
              {task.business.name}
            </Link>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
            />
          </div>

          {/* Category selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const col = getCategoryColor(cat.color)
                const isSelected = cat.id === selectedCategoryId
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors border ${
                      isSelected
                        ? `${col.pill} ${col.border}`
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="task-date" className="block text-sm font-medium text-gray-700 mb-1">
                Due date
              </label>
              <input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              />
            </div>
            <div>
              <label htmlFor="task-time" className="block text-sm font-medium text-gray-700 mb-1">
                Time
              </label>
              <input
                id="task-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              />
            </div>
            <div>
              <label htmlFor="task-category" className="block text-sm font-medium text-gray-700 mb-1">
                Work / Personal
              </label>
              <select
                id="task-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as 'work' | 'personal')}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              >
                <option value="work">Work</option>
                <option value="personal">Personal</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="task-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none resize-y"
            />
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`text-sm px-3 py-1.5 border transition-colors ${
                task.status === 'done'
                  ? 'border-brand-olive text-brand-olive hover:bg-brand-olive/10'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {task.status === 'done' ? 'Reopen' : 'Mark done'}
            </button>

            <button
              type="button"
              onClick={() =>
                task.is_priority ? onClearPriority(task.id) : onSetPriority(task.id)
              }
              className={`text-sm px-3 py-1.5 border transition-colors ${
                task.is_priority
                  ? 'border-amber-400 text-amber-600 hover:bg-amber-50'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {task.is_priority ? '★ Remove focus' : '☆ Set focus'}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm px-3 py-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>

          {/* Save/Cancel */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="text-sm px-4 py-2 bg-brand-navy text-white font-medium hover:bg-brand-navy-hover disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
