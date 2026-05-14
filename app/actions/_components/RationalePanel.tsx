'use client'

import Link from 'next/link'
import { ACTION_LABELS, formatDateGB, daysUntilFn } from '../_utils'
import type { UnifiedItem, CorrespondenceItem, ContractItem, CommitmentItem } from '../_types'

// undefined = loading, null = loaded + empty, string = loaded + has content
type RelationshipMemory = string | null | undefined

function getRationaleText(item: UnifiedItem): string {
  const corr = item.kind === 'correspondence' ? (item as CorrespondenceItem) : null
  const contract = item.kind === 'contract' ? (item as ContractItem) : null
  const commitment = item.kind === 'commitment' ? (item as CommitmentItem) : null

  switch (item.badge) {
    case 'REPLY': {
      const days = corr?.daysAgo ?? 0
      const contact = corr?.contact_name
        ? `${corr.contact_name} at ${item.business_name}`
        : item.business_name
      return `You received a message from ${contact} ${days} ${days === 1 ? 'day' : 'days'} ago. No reply sent since.`
    }
    case 'OVERDUE': {
      const daysOverdue = corr?.due_at ? Math.abs(daysUntilFn(corr.due_at)) : 0
      const action = ACTION_LABELS[corr?.action_needed ?? ''] || 'action'
      const dueDate = corr?.due_at ? formatDateGB(corr.due_at) : ''
      return `Flagged as ${action.toLowerCase()}, due ${dueDate}. Now ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue.`
    }
    case 'DUE_TODAY': {
      const action = ACTION_LABELS[corr?.action_needed ?? ''] || 'action'
      return `This ${action.toLowerCase()} is due today.`
    }
    case 'DUE_TOMORROW': {
      const action = ACTION_LABELS[corr?.action_needed ?? ''] || 'action'
      const dueDate = corr?.due_at ? formatDateGB(corr.due_at) : ''
      return `This ${action.toLowerCase()} is due tomorrow (${dueDate}).`
    }
    case 'DUE_SOON': {
      const action = ACTION_LABELS[corr?.action_needed ?? ''] || 'action'
      const days = corr?.due_at ? daysUntilFn(corr.due_at) : 0
      const dueDate = corr?.due_at ? formatDateGB(corr.due_at) : ''
      return `This ${action.toLowerCase()} is due in ${days} days (${dueDate}).`
    }
    case 'FLAG': {
      const dueDate = corr?.due_at
        ? formatDateGB(corr.due_at)
        : corr?.entry_date ? formatDateGB(corr.entry_date) : ''
      return `Flagged for follow-up${dueDate ? ` on ${dueDate}` : ''}.`
    }
    case 'RENEWAL': {
      if (!contract) return 'Contract renewal approaching.'
      const days = daysUntilFn(contract.contract_end)
      const valueStr = contract.contract_amount
        ? ` Value: ${contract.contract_currency || '£'}${contract.contract_amount.toLocaleString()}.`
        : ''
      return `Contract expires ${formatDateGB(contract.contract_end)} — ${days} ${days === 1 ? 'day' : 'days'} away.${valueStr}`
    }
    case 'EXPIRED': {
      if (!contract) return 'Contract has expired.'
      const ago = Math.abs(daysUntilFn(contract.contract_end))
      return `Contract expired ${formatDateGB(contract.contract_end)} — ${ago} ${ago === 1 ? 'day' : 'days'} ago.`
    }
    case 'REMINDER': {
      const dueDate = corr?.due_at ? formatDateGB(corr.due_at) : ''
      return `Reminder set${dueDate ? ` — due ${dueDate}` : ''}.`
    }
    case 'COMMITMENT': {
      return commitment?.content_preview || 'Outstanding commitment noted in a recent insight.'
    }
    default:
      return ''
  }
}

type RationalePanelProps = {
  item: UnifiedItem
  relationshipMemory: RelationshipMemory
  onClose: () => void
  onDone: () => void
  onLog: () => void
  onDraft: () => void
}

export function RationalePanel({ item, relationshipMemory, onClose, onDone, onLog, onDraft }: RationalePanelProps) {
  const isCorr = item.kind === 'correspondence'
  const corr = isCorr ? (item as CorrespondenceItem) : null
  const rationaleText = getRationaleText(item)

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-30 md:hidden"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[380px] bg-white border-l border-gray-200 shadow-xl flex flex-col animate-in slide-in-from-right duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <Link
            href={`/businesses/${item.business_id}?from=actions`}
            className="font-semibold text-gray-900 hover:text-brand-navy hover:underline text-sm truncate flex-1 min-w-0 mr-2"
          >
            {item.business_name}
          </Link>
          <button
            onClick={onClose}
            className="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Why this item is here */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Why it&apos;s here
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{rationaleText}</p>
          </div>

          {/* Source link for correspondence items */}
          {corr?.subject && (
            <div>
              <Link
                href={`/businesses/${item.business_id}?from=actions#entry-${item.id}`}
                className="text-xs text-brand-navy hover:underline"
                onClick={onClose}
              >
                → &ldquo;{corr.subject}&rdquo;
                {corr.entry_date && ` on ${formatDateGB(corr.entry_date)}`}
              </Link>
            </div>
          )}

          {/* Relationship memory */}
          {relationshipMemory === undefined && (
            <p className="text-xs text-gray-300 italic">Loading context…</p>
          )}
          {relationshipMemory && (
            <div className="border-l-2 border-gray-100 pl-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Context</p>
              <p className="text-xs text-gray-500 leading-relaxed">{relationshipMemory}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex items-center gap-2">
          <button
            onClick={onDone}
            className="px-3 py-1.5 text-xs font-semibold bg-brand-olive text-white hover:bg-[#6a8550] transition-colors"
          >
            Done
          </button>
          {isCorr && item.badge === 'REPLY' && (
            <button
              onClick={onDraft}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Draft
            </button>
          )}
          <button
            onClick={onLog}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {item.badge === 'REPLY' ? 'Reply' : 'Log'}
          </button>
          <button
            onClick={onClose}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
