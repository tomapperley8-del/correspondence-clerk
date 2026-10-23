'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { createTask } from '@/app/actions/tasks'
import { getBusinessNames } from '@/app/actions/today'
import { addDays } from '@/lib/today'

// "I'll do this by [date]": the one way a commitment enters the count
// (plan, Decisions 21 Oct, Commitments). Creates a hand-written to-do,
// linked to a business when one is chosen.

export function TodayQuickAdd({ today, onAdded }: { today: string; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(addDays(today, 7))
  const [businessName, setBusinessName] = useState('')
  const [names, setNames] = useState<{ id: string; name: string }[] | null>(null)
  const [saving, setSaving] = useState(false)

  const loadNames = () => {
    if (names) return
    setNames([])
    getBusinessNames().then(setNames).catch(() => setNames(null))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    let businessId: string | null = null
    const typed = businessName.trim().toLowerCase()
    if (typed) {
      const match = (names ?? []).find((b) => b.name.toLowerCase() === typed)
      if (!match) {
        toast.error('Pick the business from the list, or leave it empty')
        return
      }
      businessId = match.id
    }
    setSaving(true)
    const result = await createTask({ title: title.trim(), due_date: due || null, business_id: businessId })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`To-do added for ${due ? new Date(`${due}T12:00:00Z`).toLocaleDateString('en-GB') : 'no date'}`)
    setTitle('')
    setBusinessName('')
    setDue(addDays(today, 7))
    onAdded()
  }

  return (
    <div className="@container">
    <form onSubmit={submit} className="grid gap-2 grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto_auto] items-end">
      <label className="block col-span-2 @3xl:col-span-1">
        <span className="block text-xs font-semibold text-gray-700 mb-1">I&apos;ll…</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="send the new rate card"
          className="w-full text-sm border border-black/[0.12] rounded-sm px-2.5 min-h-10 bg-white"
          required
        />
      </label>
      <label className="block col-span-2 @3xl:col-span-1">
        <span className="block text-xs font-semibold text-gray-700 mb-1">For a business (optional)</span>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          onFocus={loadNames}
          list="today-business-names"
          placeholder="Start typing a name"
          className="w-full text-sm border border-black/[0.12] rounded-sm px-2.5 min-h-10 bg-white"
        />
        <datalist id="today-business-names">
          {(names ?? []).map((b) => <option key={b.id} value={b.name} />)}
        </datalist>
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 mb-1">By</span>
        <input
          type="date"
          value={due}
          min={today}
          onChange={(e) => setDue(e.target.value)}
          className="text-sm border border-black/[0.12] rounded-sm px-2.5 min-h-10 bg-white"
        />
      </label>
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="text-sm font-semibold px-4 min-h-10 rounded-sm bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors duration-200 ease-out disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add to-do'}
      </button>
    </form>
    </div>
  )
}
