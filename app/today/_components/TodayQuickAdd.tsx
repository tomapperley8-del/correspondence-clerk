'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { createTask } from '@/app/actions/tasks'
import { addCalendarItem } from '@/app/actions/calendar'
import { getBusinessNames } from '@/app/actions/today'
import { addDays } from '@/lib/today'

// "I'll do this by [date]": the one way a commitment enters the count
// (plan, Decisions 21 Oct, Commitments). Creates a hand-written to-do,
// linked to a business when one is chosen.
// Stage 14a v2: opened by "+ Add" above Today's list; it can also add an item
// for Wednesday's newsletter, attached to a business when one is chosen.

export type AddKind = 'todo' | 'newsletter'

export function TodayQuickAdd({
  today,
  wednesday,
  onAdded,
  onCancel,
}: {
  today: string
  /** The newsletter's next issue date, for newsletter items. */
  wednesday: string
  onAdded: (kind: AddKind) => void
  onCancel?: () => void
}) {
  const [kind, setKind] = useState<AddKind>('todo')
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
    const date = kind === 'newsletter' ? wednesday : due
    const result =
      kind === 'newsletter'
        ? await addCalendarItem({ kind: 'newsletter', title, date: wednesday, business_id: businessId })
        : await createTask({ title: title.trim(), due_date: due || null, business_id: businessId })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    const on = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB') : 'no date'
    toast.success(kind === 'newsletter' ? `Added to the newsletter for ${on}` : `To-do added for ${on}`)
    setTitle('')
    setBusinessName('')
    setDue(addDays(today, 7))
    onAdded(kind)
  }

  return (
    <div className="@container">
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel) {
          e.preventDefault()
          onCancel()
        }
      }}
      className="grid gap-2 grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto_auto_auto] items-end"
    >
      <fieldset className="col-span-2 @3xl:col-span-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">What to add</legend>
        {([['todo', 'A to-do'], ['newsletter', "For Wednesday's newsletter"]] as const).map(([k, label]) => (
          <label key={k} className="inline-flex items-center gap-2 min-h-10 md:min-h-8 cursor-pointer">
            <input type="radio" name="add-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[var(--color-ms-band)]" />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block col-span-2 @3xl:col-span-1">
        <span className="block text-xs font-semibold text-gray-700 mb-1">{kind === 'newsletter' ? 'What goes in' : 'I’ll…'}</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'newsletter' ? 'their autumn menu launch' : 'send the new rate card'}
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
      {kind === 'todo' ? (
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
      ) : (
        <p className="text-xs text-gray-700 self-center">For {new Date(`${wednesday}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
      )}
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="text-sm font-semibold px-4 min-h-10 rounded-sm bg-ms-band text-white hover:bg-ms-band-hover transition-colors duration-200 ease-out disabled:opacity-50"
      >
        {saving ? 'Adding…' : kind === 'newsletter' ? 'Add item' : 'Add to-do'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-sm font-semibold px-3 min-h-10 rounded-sm text-gray-700 hover:bg-black/[0.05]">
          Cancel
        </button>
      )}
    </form>
    </div>
  )
}
