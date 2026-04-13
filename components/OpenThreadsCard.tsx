'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { OpenThread } from '@/app/actions/correspondence'

const THREAD_TYPE_LABELS: Record<OpenThread['thread_type'], string> = {
  sent_invoice:          'Invoice unpaid',
  received_commitment:   'Awaiting their follow-up',
  meeting_call_followup: 'No follow-up after meeting/call',
  interest_signal:       'Unanswered enquiry',
}

const THREAD_TYPE_COLOURS: Record<OpenThread['thread_type'], string> = {
  sent_invoice:          'bg-orange-50 border-orange-300 text-orange-800',
  received_commitment:   'bg-amber-50 border-amber-300 text-amber-800',
  meeting_call_followup: 'bg-brand-navy/[0.07] border-brand-navy/25 text-brand-navy',
  interest_signal:       'bg-emerald-50 border-emerald-300 text-emerald-800',
}

function formatDaysAgo(days: number): string {
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return '1 week ago'
  if (weeks < 5) return `${weeks} weeks ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

type Props = {
  threads: OpenThread[]
  /** When true, shows business name in each row (org-wide view) */
  showBusinessName?: boolean
}

export function OpenThreadsCard({ threads, showBusinessName = false }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(true)

  if (dismissed || threads.length === 0) return null

  return (
    <div className="border border-amber-200 bg-amber-50/40 mb-4" style={{ borderRadius: '3px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200/60">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          <svg className={`w-3.5 h-3.5 text-amber-600 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-xs font-semibold text-amber-800">
            {threads.length} open {threads.length === 1 ? 'thread' : 'threads'} detected
          </span>
          <span className="text-[10px] text-amber-600">— no action flagged but may need attention</span>
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700 transition-colors text-xs"
          aria-label="Dismiss open threads"
        >
          Dismiss
        </button>
      </div>

      {/* Thread list */}
      {expanded && (
        <ul className="divide-y divide-amber-100">
          {threads.map(thread => (
            <li key={thread.entry_id} className="px-4 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold border rounded-sm ${THREAD_TYPE_COLOURS[thread.thread_type]}`}>
                    {THREAD_TYPE_LABELS[thread.thread_type]}
                  </span>
                  <span className="text-[10px] text-gray-400">{formatDaysAgo(thread.days_since)}</span>
                </div>
                {showBusinessName && (
                  <Link
                    href={`/businesses/${thread.business_id}`}
                    className="text-sm font-semibold text-gray-900 hover:text-brand-navy hover:underline"
                  >
                    {thread.business_name}
                  </Link>
                )}
                {thread.subject && (
                  <p className="text-xs text-gray-700 mt-0.5">{thread.subject}</p>
                )}
                {thread.snippet && (
                  <p className="text-xs text-gray-400 italic mt-0.5">{thread.snippet}</p>
                )}
              </div>
              <Link
                href={`/businesses/${thread.business_id}#${thread.entry_id}`}
                className="shrink-0 text-xs text-brand-navy hover:underline font-medium"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
