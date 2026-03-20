'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getOutstandingActions, markCorrespondenceDone } from '@/app/actions/correspondence'
import { formatDateGB, formatDateTimeGB } from '@/lib/utils'

type ActionEntry = {
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

const ACTION_LABELS: Record<string, string> = {
  follow_up: 'Follow-up',
  waiting_on_them: 'Waiting on them',
  invoice: 'Invoice',
  renewal: 'Renewal',
  prospect: 'Prospect',
}

const ACTION_COLOURS: Record<string, string> = {
  follow_up: 'bg-blue-50 border-blue-300 text-blue-800',
  waiting_on_them: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  invoice: 'bg-orange-50 border-orange-400 text-orange-800',
  renewal: 'bg-purple-50 border-purple-400 text-purple-800',
  prospect: 'bg-green-50 border-green-400 text-green-800',
}

export default function ActionsPage() {
  const [actions, setActions] = useState<ActionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [markingDone, setMarkingDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadActions()
  }, [])

  async function loadActions() {
    setLoading(true)
    try {
      const result = await getOutstandingActions()
      if ('error' in result) {
        setError(result.error || 'Failed to load actions')
      } else {
        setActions(result.data as unknown as ActionEntry[])
      }
    } catch {
      setError('Failed to load actions')
    }
    setLoading(false)
  }

  const handleMarkDone = async (id: string) => {
    setMarkingDone(id)
    const result = await markCorrespondenceDone(id)
    if ('error' in result) {
      setError(`Error: ${result.error}`)
    } else {
      setActions((prev) => prev.filter((a) => a.id !== id))
    }
    setMarkingDone(null)
  }

  // Group by action_needed type
  const grouped = actions.reduce<Record<string, ActionEntry[]>>((acc, entry) => {
    const key = entry.action_needed
    if (!acc[key]) acc[key] = []
    acc[key].push(entry)
    return acc
  }, {})

  const actionOrder = ['follow_up', 'invoice', 'renewal', 'waiting_on_them', 'prospect']
  const sortedGroups = actionOrder.filter((k) => grouped[k])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading actions...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Lora, serif' }}>
        Outstanding Actions
      </h1>
      <p className="text-gray-600 text-sm mb-6">
        All correspondence entries marked as needing action.
      </p>

      {error && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {actions.length === 0 && !loading && (
        <div className="bg-gray-50 border-2 border-gray-300 p-8 text-center">
          <p className="text-gray-600">No outstanding actions.</p>
        </div>
      )}

      {sortedGroups.map((actionKey) => (
        <div key={actionKey} className="mb-8">
          <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 border font-semibold ${ACTION_COLOURS[actionKey] || 'bg-gray-100 border-gray-300 text-gray-800'}`}>
              {ACTION_LABELS[actionKey] || actionKey}
            </span>
            <span className="text-gray-500 font-normal text-sm">
              ({grouped[actionKey].length} {grouped[actionKey].length === 1 ? 'entry' : 'entries'})
            </span>
          </h2>

          <div className="space-y-3">
            {grouped[actionKey].map((entry) => {
              const biz = entry.businesses as unknown as { id: string; name: string } | null
              const contact = Array.isArray(entry.contact) ? entry.contact[0] : entry.contact
              const overdue = entry.due_at ? new Date(entry.due_at) < new Date() : false

              return (
                <div key={entry.id} className={`border-2 p-4 ${overdue ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}>
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

                      {entry.subject && (
                        <p className="text-sm text-gray-800 font-medium mb-1">{entry.subject}</p>
                      )}

                      {entry.formatted_text_current && (
                        <p className="text-xs text-gray-600 line-clamp-2 mb-1">
                          {entry.formatted_text_current.substring(0, 200)}
                          {entry.formatted_text_current.length > 200 && '…'}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {entry.entry_date && (
                          <span>Entry: {formatDateTimeGB(entry.entry_date)}</span>
                        )}
                        {entry.due_at && (
                          <span className={overdue ? 'text-red-700 font-semibold' : ''}>
                            Due: {formatDateGB(entry.due_at)}
                            {overdue && ' (overdue)'}
                          </span>
                        )}
                        {entry.direction && (
                          <span className={entry.direction === 'sent' ? 'text-green-700' : 'text-blue-700'}>
                            {entry.direction === 'sent' ? 'Sent' : 'Received'}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={() => handleMarkDone(entry.id)}
                      disabled={markingDone === entry.id}
                      className="bg-green-600 text-white hover:bg-green-700 px-3 py-1 text-xs font-semibold shrink-0"
                    >
                      {markingDone === entry.id ? 'Saving...' : 'Mark Done'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
