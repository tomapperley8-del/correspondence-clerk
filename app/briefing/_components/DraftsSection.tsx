'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RoutineDraft } from '@/app/actions/leads'
import { timeAgo } from '@/lib/lead-meta'

const OUTLOOK_DRAFTS = 'https://outlook.office.com/mail/drafts'

const KIND_LABEL: Record<string, string> = {
  renewal: 'Renewal',
  overdue: 'Payment chaser',
  checkin: 'Check-in',
  outreach: 'New business',
}

const KIND_STYLE: Record<string, string> = {
  renewal: 'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-700',
  checkin: 'bg-blue-50 text-blue-700',
  outreach: 'bg-green-50 text-green-700',
}

function formatDateGB(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function DraftsSection({ initialDrafts }: { initialDrafts: RoutineDraft[] }) {
  const [showHeld, setShowHeld] = useState(false)
  const [showSent, setShowSent] = useState(false)

  const written = initialDrafts.filter(d => d.outcome === 'drafted' && !d.sent_at)
  const sent = initialDrafts.filter(d => d.outcome === 'drafted' && d.sent_at)
  const held = initialDrafts.filter(d => d.outcome === 'skipped')

  if (initialDrafts.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Nothing yet. The member care routine writes renewal, payment and check-in drafts on weekday mornings.
      </p>
    )
  }

  return (
    <div>
      {written.length > 0 && (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Waiting in your Outlook Drafts, ready to read and send.{' '}
            <a
              href={OUTLOOK_DRAFTS}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-navy hover:text-brand-olive transition-colors"
            >
              Open Outlook Drafts →
            </a>
          </p>
          <div className="divide-y divide-gray-100">
            {written.map(draft => (
              <div key={draft.id} className="py-2.5">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 uppercase ${KIND_STYLE[draft.kind] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {KIND_LABEL[draft.kind] ?? draft.kind}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{draft.business?.name ?? 'Unknown business'}</span>
                      {draft.subject && <span className="text-gray-500"> — {draft.subject}</span>}
                    </p>
                    {draft.reason && <p className="text-xs text-gray-500 mt-0.5">{draft.reason}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {timeAgo(draft.created_at)}
                      {draft.recipient && ` · to ${draft.recipient}`}
                      {draft.bump_count > 0 && (
                        <span className="text-amber-700">
                          {' '}· still waiting, moved back to the top {draft.bump_count === 1 ? 'once' : `${draft.bump_count} times`}
                        </span>
                      )}
                    </p>
                  </div>
                  {draft.business_id && (
                    <Link
                      href={`/businesses/${draft.business_id}`}
                      className="flex-shrink-0 text-xs font-medium text-gray-400 hover:text-brand-navy transition-colors"
                    >
                      Open in CC →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {written.length === 0 && (
        <p className="text-sm text-gray-400">Nothing waiting in Outlook. Everything the routines wrote has been sent.</p>
      )}

      {sent.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowSent(!showSent)}
            className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
            aria-expanded={showSent}
          >
            {showSent ? 'Hide' : 'Show'} {sent.length} sent
            {sent.some(d => d.replied_at) && `, ${sent.filter(d => d.replied_at).length} answered`}
          </button>
          {showSent && (
            <div className="divide-y divide-gray-100 mt-2">
              {sent.map(draft => (
                <div key={draft.id} className="py-2 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{draft.business?.name ?? 'Unknown business'}</span>
                      <span className="text-gray-400"> · {KIND_LABEL[draft.kind] ?? draft.kind}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sent {formatDateGB(draft.sent_at as string)}
                      {draft.replied_at && ` · they replied ${formatDateGB(draft.replied_at)}`}
                    </p>
                  </div>
                  {draft.replied_at && (
                    <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 uppercase bg-green-100 text-green-700">
                      Replied
                    </span>
                  )}
                  {draft.business_id && (
                    <Link
                      href={`/businesses/${draft.business_id}`}
                      className="flex-shrink-0 text-xs font-medium text-gray-400 hover:text-brand-navy transition-colors"
                    >
                      Open in CC →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {held.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowHeld(!showHeld)}
            className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
            aria-expanded={showHeld}
          >
            {showHeld ? 'Hide' : 'Show'} {held.length} considered and held back
          </button>
          {showHeld && (
            <div className="divide-y divide-gray-100 mt-2">
              {held.map(draft => (
                <div key={draft.id} className="py-2">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">{draft.business?.name ?? 'Unknown business'}</span>
                    <span className="text-gray-400"> · {KIND_LABEL[draft.kind] ?? draft.kind}</span>
                  </p>
                  {draft.reason && <p className="text-xs text-gray-500 mt-0.5">{draft.reason}</p>}
                  {draft.snooze_until && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Back on the list {formatDateGB(draft.snooze_until)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
