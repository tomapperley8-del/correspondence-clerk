'use client'

import { useState, useRef } from 'react'

export function QuickAdd({
  onAdd,
  defaultDate,
}: {
  onAdd: (title: string, dueDate: string | null, category: 'work' | 'personal') => Promise<void>
  defaultDate?: string | null
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(defaultDate ?? '')
  const [category, setCategory] = useState<'work' | 'personal'>('work')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setAdding(true)
    await onAdd(title.trim(), dueDate || null, category)
    setTitle('')
    setDueDate(defaultDate ?? '')
    setAdding(false)
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 bg-white border border-gray-200 p-3 shadow-[var(--shadow-sm)]">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a to-do…"
        className="flex-1 text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
        disabled={adding}
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none w-full sm:w-auto"
        disabled={adding}
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as 'work' | 'personal')}
        className="text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none w-full sm:w-auto"
        disabled={adding}
      >
        <option value="work">Work</option>
        <option value="personal">Personal</option>
      </select>
      <button
        type="submit"
        disabled={adding || !title.trim()}
        className="px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy-hover disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {adding ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}
