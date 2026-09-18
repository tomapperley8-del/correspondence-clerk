'use client'

import { useState } from 'react'
import type { Task } from '@/app/actions/tasks'
import { requestDraft } from '@/app/actions/tasks'
import { toast } from '@/lib/toast'

const OUTLOOK_DRAFTS = 'https://outlook.office.com/mail/drafts'

function formatDateGB(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * The draft control on a task row:
 *
 *  - the drafted email has gone               → "Sent 17 Sept"
 *  - a routine has written it                 → link to it in Outlook Drafts
 *  - the routine chose to hold back           → "Held back to 1 Oct", reason on hover
 *  - Tom has asked for one                    → says so, nothing more to do
 *  - none of those                            → "Ask for a draft"
 *
 * It used to call /api/delegate-draft, which generated the email with the
 * Anthropic API. App AI is off and that account has no credit, so every click
 * was an error. The member care routine writes the email instead, on its next
 * morning run, with the full history and both mailboxes behind it.
 */
export function DelegateButton({
  task,
  compact,
}: {
  task: Task
  compact?: boolean
}) {
  const [requested, setRequested] = useState(task.draft_requested === true)
  const [saving, setSaving] = useState(false)

  const draftAt = task.signal_meta?.draft_at
  const sentAt = task.signal_meta?.draft_sent_at
  const heldUntil = task.signal_meta?.held_until
  const size = compact ? 'text-xs' : 'text-sm'

  if (typeof sentAt === 'string') {
    return (
      <span className={`${size} text-gray-500 whitespace-nowrap`} title={task.signal_meta?.draft_subject ? String(task.signal_meta.draft_subject) : undefined}>
        Sent {formatDateGB(sentAt)}
      </span>
    )
  }

  if (typeof draftAt === 'string') {
    return (
      <a
        href={OUTLOOK_DRAFTS}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title={task.signal_meta?.draft_subject ? String(task.signal_meta.draft_subject) : 'Written by a routine'}
        className={`${size} font-medium text-brand-olive hover:text-brand-navy transition-colors whitespace-nowrap`}
      >
        Draft waiting ({formatDateGB(draftAt)})
      </a>
    )
  }

  // The routine looked at this one and chose not to write it yet. Say so, with
  // its reason, rather than inviting a request for the draft it just declined.
  const held = typeof heldUntil === 'string' && heldUntil >= new Date().toISOString().slice(0, 10) && !requested

  if (requested) {
    return (
      <span className={`${size} text-gray-400 whitespace-nowrap`} title="The member care routine writes it on its next weekday run">
        Draft requested
      </span>
    )
  }

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (saving) return
    setSaving(true)
    const result = await requestDraft(task.id)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setRequested(true)
    toast.success('Asked for a draft. It will be in your Outlook Drafts in the morning.')
  }

  if (held) {
    return (
      <span className={`${size} whitespace-nowrap`}>
        <span
          className="text-amber-700 cursor-help"
          title={task.signal_meta?.held_reason ? String(task.signal_meta.held_reason) : 'Held back by the member care routine'}
        >
          Held back to {formatDateGB(heldUntil as string)}
        </span>
        <button
          onClick={handleClick}
          disabled={saving}
          className="ml-2 text-brand-navy hover:text-brand-olive transition-colors font-medium"
          title="Ask the routine to look again on its next run. It re-reads the history and may still hold back, with its reason."
        >
          {saving ? 'Asking...' : 'Ask again'}
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      title="The member care routine writes this email into your Outlook Drafts on its next run"
      className={`font-medium border transition-colors whitespace-nowrap ${
        compact ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2.5 py-1'
      } ${
        saving
          ? 'border-gray-200 text-gray-400 cursor-wait'
          : 'border-brand-navy/30 text-brand-navy hover:bg-brand-navy hover:text-white'
      }`}
    >
      {saving ? 'Asking...' : 'Ask for a draft'}
    </button>
  )
}
