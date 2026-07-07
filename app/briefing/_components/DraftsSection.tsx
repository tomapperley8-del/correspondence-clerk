'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RecentDraft } from '@/app/actions/leads'
import { markDraftSent } from '@/app/actions/leads'
import { timeAgo } from '@/lib/lead-meta'
import { toast } from '@/lib/toast'

export function DraftsSection({ initialDrafts }: { initialDrafts: RecentDraft[] }) {
  const [drafts, setDrafts] = useState<RecentDraft[]>(initialDrafts)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function handleMarkSent(draft: RecentDraft) {
    setDrafts(prev => prev.map(d => (d.id === draft.id ? { ...d, draft_status: 'sent' } : d)))
    const result = await markDraftSent(draft.id)
    if (result.error) {
      setDrafts(prev => prev.map(d => (d.id === draft.id ? { ...d, draft_status: 'draft' } : d)))
      toast.error(result.error)
    } else {
      toast.success('Marked as sent')
    }
  }

  async function handleCopy(draft: RecentDraft) {
    const text = draft.formatted_text_current ?? ''
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Draft copied to clipboard')
    } catch {
      toast.error('Could not copy — open the entry instead')
    }
  }

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No drafts yet. Use the Delegate to Claude button on a task to generate one.
      </p>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {drafts.map(draft => {
        const expanded = expandedId === draft.id
        const status = draft.edited_at && draft.draft_status !== 'sent'
          ? 'edited'
          : draft.draft_status
        return (
          <div key={draft.id} className="py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => setExpandedId(expanded ? null : draft.id)}
                  className="text-left w-full"
                  aria-expanded={expanded}
                >
                  <p className="text-sm text-gray-800 truncate">
                    <span className="font-medium">{draft.business?.name ?? 'Unknown business'}</span>
                    {draft.subject && <span className="text-gray-500"> — {draft.subject}</span>}
                  </p>
                </button>
                <p className="text-xs text-gray-400">
                  {timeAgo(draft.created_at)}
                  {draft.task_title && ` · from task: ${draft.task_title}`}
                </p>
              </div>
              <span
                className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 uppercase ${
                  status === 'sent'
                    ? 'bg-green-100 text-green-700'
                    : status === 'edited'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-amber-50 text-amber-700'
                }`}
              >
                {status}
              </span>
            </div>
            {expanded && (
              <div className="mt-2 border border-gray-100 bg-brand-warm/50 p-3">
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{draft.formatted_text_current}</p>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              <button
                onClick={() => setExpandedId(expanded ? null : draft.id)}
                className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
              >
                {expanded ? 'Hide draft' : 'View draft'}
              </button>
              <button
                onClick={() => handleCopy(draft)}
                className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
              >
                Copy
              </button>
              {status !== 'sent' && (
                <button
                  onClick={() => handleMarkSent(draft)}
                  className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
                >
                  Mark as sent
                </button>
              )}
              <Link
                href={`/businesses/${draft.business_id}`}
                className="text-xs font-medium text-gray-400 hover:text-brand-navy transition-colors ml-auto"
              >
                Open in CC →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
