'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getUpcomingReminders, markCorrespondenceDone } from '@/app/actions/correspondence'
import { formatDateGB, formatDateTimeGB } from '@/lib/utils'

type ReminderEntry = {
  id: string
  business_id: string
  contact_id: string | null
  subject: string | null
  type: string | null
  direction: string | null
  entry_date: string | null
  due_at: string | null
  action_needed: string
  formatted_text_current: string | null
  businesses: { id: string; name: string } | null
  contact: { name: string; role: string | null } | null
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<ReminderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [markingDone, setMarkingDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadReminders()
  }, [])

  async function loadReminders() {
    setLoading(true)
    try {
      const result = await getUpcomingReminders()
      if ('error' in result) {
        setError(result.error || 'Failed to load reminders')
      } else {
        setReminders(result.data as unknown as ReminderEntry[])
      }
    } catch {
      setError('Failed to load reminders')
    }
    setLoading(false)
  }

  const handleMarkDone = async (id: string) => {
    setMarkingDone(id)
    const result = await markCorrespondenceDone(id)
    if ('error' in result) {
      setError(`Error: ${result.error}`)
    } else {
      setReminders((prev) => prev.filter((r) => r.id !== id))
    }
    setMarkingDone(null)
  }

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      follow_up: 'Follow-up',
      waiting_on_them: 'Waiting on them',
      invoice: 'Invoice',
      renewal: 'Renewal',
      prospect: 'Prospect',
    }
    return labels[action] || action
  }

  const isOverdue = (dueAt: string) => new Date(dueAt) < new Date()

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading reminders...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Lora, serif' }}>
        Reminders
      </h1>
      <p className="text-gray-600 text-sm mb-6">
        Correspondence entries with a due date set.
      </p>

      {error && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {reminders.length === 0 && !loading && (
        <div className="bg-gray-50 border-2 border-gray-300 p-8 text-center">
          <p className="text-gray-600">No reminders set.</p>
          <p className="text-gray-500 text-sm mt-2">
            Set a due date on a correspondence entry to see it here.
          </p>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="space-y-3">
          {reminders.map((reminder) => {
            const overdue = reminder.due_at ? isOverdue(reminder.due_at) : false
            const biz = reminder.businesses as unknown as { id: string; name: string } | null
            const contact = Array.isArray(reminder.contact) ? reminder.contact[0] : reminder.contact

            return (
              <div
                key={reminder.id}
                className={`border-2 p-4 ${overdue ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {biz && (
                        <Link
                          href={`/businesses/${biz.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                        >
                          {biz.name}
                        </Link>
                      )}
                      {contact && (
                        <span className="text-sm text-gray-600">
                          — {contact.name}
                          {contact.role && ` (${contact.role})`}
                        </span>
                      )}
                    </div>

                    {reminder.subject && (
                      <p className="text-sm text-gray-800 font-medium mb-1">{reminder.subject}</p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className={`px-2 py-0.5 border font-medium ${
                        overdue
                          ? 'bg-red-100 border-red-400 text-red-800'
                          : 'bg-blue-50 border-blue-300 text-blue-800'
                      }`}>
                        {actionLabel(reminder.action_needed)}
                      </span>
                      {reminder.due_at && (
                        <span className={overdue ? 'text-red-700 font-semibold' : ''}>
                          Due: {formatDateGB(reminder.due_at)}
                          {overdue && ' (overdue)'}
                        </span>
                      )}
                      {reminder.entry_date && (
                        <span>Entry: {formatDateTimeGB(reminder.entry_date)}</span>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleMarkDone(reminder.id)}
                    disabled={markingDone === reminder.id}
                    className="bg-green-600 text-white hover:bg-green-700 px-3 py-1 text-xs font-semibold shrink-0"
                  >
                    {markingDone === reminder.id ? 'Saving...' : 'Mark Done'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
