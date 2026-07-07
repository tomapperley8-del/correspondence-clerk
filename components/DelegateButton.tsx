'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/toast'

const COOLDOWN_MS = 10_000

/**
 * "Delegate to Claude" — drafts an outreach email for a task via /api/delegate-draft.
 * Only render when the task has a linked business.
 */
export function DelegateButton({
  taskId,
  compact,
}: {
  taskId: string
  compact?: boolean
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [result, setResult] = useState<{ correspondenceId: string; businessId: string } | null>(null)
  const lastClickAt = useRef(0)

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    const now = Date.now()
    if (now - lastClickAt.current < COOLDOWN_MS || state === 'loading') return
    lastClickAt.current = now

    setState('loading')
    try {
      const res = await fetch('/api/delegate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setState('error')
        toast.error(data.error ?? 'Drafting failed')
        return
      }
      setResult({ correspondenceId: data.correspondenceId, businessId: data.businessId })
      setState('idle')
      toast.success('Draft ready')
    } catch {
      setState('error')
      toast.error('Drafting failed — check your connection')
    }
  }

  if (result) {
    return (
      <Link
        href={`/businesses/${result.businessId}#entry-${result.correspondenceId}`}
        onClick={(e) => e.stopPropagation()}
        className={`font-medium text-brand-olive hover:text-brand-navy transition-colors whitespace-nowrap ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        Draft ready — View
      </Link>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      title="Claude drafts an email for this task using the business record and correspondence history"
      className={`font-medium border transition-colors whitespace-nowrap ${
        compact ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2.5 py-1'
      } ${
        state === 'loading'
          ? 'border-gray-200 text-gray-400 cursor-wait'
          : state === 'error'
            ? 'border-red-300 text-red-600 hover:bg-red-50'
            : 'border-brand-navy/30 text-brand-navy hover:bg-brand-navy hover:text-white'
      }`}
    >
      {state === 'loading' ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-brand-navy rounded-full animate-spin" aria-hidden="true" />
          Drafting...
        </span>
      ) : state === 'error' ? (
        'Failed — Retry'
      ) : (
        <>✨ Draft</>
      )}
    </button>
  )
}
