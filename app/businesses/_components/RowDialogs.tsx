'use client'

import { useEffect, useState } from 'react'
import type { TableRow } from '@/app/actions/business-table'
import { addCalendarItem, moveCalendarItem } from '@/app/actions/calendar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'

// The two row actions that need a form (Stage 13): the business's notes, and a
// to-do linked to the business (the same to-do as Today's "+ Add to-do", so it
// shows on Today, the calendar, the business page and the desk email). Above
// the full-screen table, hence the raised layer. Stage 13b adds "move": the
// Next to-do cell changes that to-do's date (the calendar's own action).

export type RowDialog = { kind: 'notes' | 'todo' | 'move'; row: TableRow }
type SavedTodo = { id: string; title: string; due_date: string | null }

const field = 'w-full px-3 py-2 text-sm border border-black/10 rounded-sm bg-white focus:outline-none focus:border-brand-navy'
const primary = 'px-4 py-2 text-sm font-semibold bg-brand-navy text-white rounded-sm hover:bg-brand-navy-hover disabled:opacity-50'
const secondary = 'px-4 py-2 text-sm text-gray-700 hover:text-brand-navy'

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

export function RowDialogs({
  dialog,
  onClose,
  onSaveNotes,
  onTodoSaved,
}: {
  dialog: RowDialog | null
  onClose: () => void
  onSaveNotes: (row: TableRow, notes: string | null) => Promise<string | void>
  onTodoSaved?: (row: TableRow, todo: SavedTodo) => void
}) {
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dialog) return
    // Fresh form each time a dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(dialog.row.notes ?? '')
    setTitle('')
    setDate(dialog.kind === 'move' ? dialog.row.next_todo?.due_date ?? londonToday() : londonToday())
    setSaving(false)
  }, [dialog])

  const row = dialog?.row

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!dialog || !row) return
    setSaving(true)
    if (dialog.kind === 'notes') {
      const err = await onSaveNotes(row, notes.trim() ? notes : null)
      setSaving(false)
      if (!err) onClose()
      return
    }
    if (dialog.kind === 'move' && row.next_todo) {
      const todo = row.next_todo
      const moved = await moveCalendarItem(todo.id, date)
      setSaving(false)
      if (moved.error) {
        toast.error(moved.error)
        return
      }
      toast.success(`To-do moved to ${date.split('-').reverse().join('/')}`)
      onTodoSaved?.(row, { id: todo.id, title: todo.title, due_date: date })
      onClose()
      return
    }
    const result = await addCalendarItem({ kind: 'todo', title, date, business_id: row.id })
    setSaving(false)
    if (result.error || !result.id) {
      toast.error(result.error ?? 'Not added')
      return
    }
    toast.success(`To-do added for ${row.name}`)
    onTodoSaved?.(row, { id: result.id, title: title.trim(), due_date: date })
    onClose()
  }

  return (
    <Dialog open={!!dialog} onOpenChange={(o) => !o && onClose()}>
      {dialog && row && (
        <DialogContent className="z-[80] bg-white border border-black/[0.08] rounded-sm shadow-[var(--shadow-lg)]">
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'var(--font-serif)' }} className="text-2xl text-brand-dark">
                {dialog.kind === 'notes' ? `Notes: ${row.name}` : dialog.kind === 'move' ? `Next to-do: ${row.name}` : `Add a to-do: ${row.name}`}
              </DialogTitle>
              <DialogDescription>
                {dialog.kind === 'notes'
                  ? 'Your notes on the business, the same as in Edit business.'
                  : dialog.kind === 'move'
                    ? `${row.next_todo?.title ?? ''}. A new date moves it on Today and the calendar too; tick it off on Today when it is done.`
                    : 'Shows on Today, the calendar and the business page.'}
              </DialogDescription>
            </DialogHeader>
            {dialog.kind === 'notes' ? (
              <label>
                <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
                <textarea
                  autoFocus
                  value={notes}
                  maxLength={5000}
                  rows={6}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(e)
                  }}
                  className={field}
                />
                <span className="block text-xs text-gray-500 mt-1">Ctrl+Enter saves.</span>
              </label>
            ) : dialog.kind === 'move' ? (
              <label>
                <span className="block text-xs font-semibold text-gray-600 mb-1">Date</span>
                <input type="date" autoFocus required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
            ) : (
              <>
                <label>
                  <span className="block text-xs font-semibold text-gray-600 mb-1">What to do</span>
                  <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
                </label>
                <label>
                  <span className="block text-xs font-semibold text-gray-600 mb-1">By</span>
                  <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                </label>
              </>
            )}
            <DialogFooter>
              <button type="button" className={secondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={primary} disabled={saving || (dialog.kind === 'todo' && (!title.trim() || !date)) || (dialog.kind === 'move' && !date)}>
                {saving ? 'Saving…' : dialog.kind === 'notes' ? 'Save notes' : dialog.kind === 'move' ? 'Move to-do' : 'Add to-do'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
