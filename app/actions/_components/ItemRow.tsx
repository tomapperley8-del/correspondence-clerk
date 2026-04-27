'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LogPanel } from './LogPanel'
import { DraftPanel } from './DraftPanel'
import { SnoozeMenu } from './SnoozeMenu'
import { getBadgeClass, LEFT_BORDER, ACTION_LABELS, ACTION_COLOURS, formatDateGB, daysAgoFn, daysUntilFn } from '../_utils'
import type { UnifiedItem, CorrespondenceItem, ContractItem, BusinessItem, CommitmentItem } from '../_types'

// Resolution options for invoice / waiting_on_them correspondence
const RESOLUTION_OPTIONS = [
  { value: 'payment_received', label: 'Payment received' },
  { value: 'cancelled', label: 'Cancelled / wrote off' },
  { value: 'other', label: 'Other' },
]

// Resolution options for contract expiry / renewal items
const CONTRACT_RESOLUTION_OPTIONS = [
  { value: 'in_progress', label: 'Renewal in progress' },
  { value: 'one_off', label: 'One-off — won\'t recur' },
  { value: 'removed', label: 'Removed from scheme' },
]

type ItemRowProps = {
  item: UnifiedItem
  focused: boolean
  logOpen: boolean
  draftOpen: boolean
  snoozeOpen: boolean
  processing: boolean
  resolutionPending: boolean
  logInitialText?: string
  priorityNumber?: string
  rationaleOpen?: boolean
  onFocus: () => void
  onSelect?: () => void
  onDone: () => void
  onDoneWithResolution: (resolution: string) => void
  onResolutionCancel: () => void
  onSnooze: (days: number) => void
  onSnoozeToggle: () => void
  onLogToggle: () => void
  onLogSave: (markDone: boolean) => void
  onDraftToggle: () => void
  onUseInLog: (draft: string) => void
}

export function ItemRow({
  item, focused, logOpen, draftOpen, snoozeOpen, processing, resolutionPending,
  logInitialText, priorityNumber, rationaleOpen,
  onFocus, onSelect, onDone, onDoneWithResolution, onResolutionCancel,
  onSnooze, onSnoozeToggle, onLogToggle, onLogSave,
  onDraftToggle, onUseInLog,
}: ItemRowProps) {
  const [snippetExpanded, setSnippetExpanded] = useState(false)
  const isCorr = item.kind === 'correspondence'
  const isContract = item.kind === 'contract'
  const isBusiness = item.kind === 'business'
  const isCommitment = item.kind === 'commitment'
  const corr = isCorr ? (item as CorrespondenceItem) : null
  const contract = isContract ? (item as ContractItem) : null
  const biz = isBusiness ? (item as BusinessItem) : null
  const commitment = isCommitment ? (item as CommitmentItem) : null

  // Compact timestamp chip — derived from existing fields, no new fetches
  let timestampChip: string | null = null
  if (item.badge === 'REPLY' && corr?.daysAgo != null) {
    timestampChip = `Received ${corr.daysAgo}d ago`
  } else if (item.badge === 'OVERDUE' && corr?.due_at) {
    timestampChip = `${daysAgoFn(corr.due_at)}d overdue`
  } else if (item.badge === 'DUE_TODAY') {
    timestampChip = 'Due today'
  } else if (item.badge === 'DUE_TOMORROW') {
    timestampChip = 'Due tomorrow'
  } else if (item.badge === 'DUE_SOON' && corr?.due_at) {
    timestampChip = `Due in ${daysUntilFn(corr.due_at)}d`
  } else if (item.badge === 'FLAG' && corr?.entry_date) {
    timestampChip = `${daysAgoFn(corr.entry_date)}d ago`
  } else if (item.badge === 'RENEWAL' && contract?.contract_end) {
    timestampChip = `Expires in ${daysUntilFn(contract.contract_end)}d`
  } else if (item.badge === 'EXPIRED' && contract?.contract_end) {
    timestampChip = `Expired ${daysAgoFn(contract.contract_end)}d ago`
  } else if (item.badge === 'REMINDER' && corr?.due_at) {
    const d = daysUntilFn(corr.due_at)
    timestampChip = d <= 0 ? 'Due today' : `Due in ${d}d`
  } else if (item.badge === 'COMMITMENT' && commitment?.generated_at) {
    timestampChip = `Generated ${daysAgoFn(commitment.generated_at)}d ago`
  }

  // Which picker to show when resolutionPending
  const showCorrPicker = resolutionPending && isCorr && corr && RESOLUTION_OPTIONS.length > 0
  const showContractPicker = resolutionPending && isContract

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={() => { onFocus(); onSelect?.() }}
      className={`outline-none ${focused ? 'bg-brand-navy/[0.04]' : 'hover:bg-gray-50/60'} ${LEFT_BORDER[item.badge]}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {priorityNumber && (
          <span className="shrink-0 w-5 text-right text-sm font-semibold text-gray-300 leading-6 select-none">
            {priorityNumber}.
          </span>
        )}
        <div className="flex-1 min-w-0">
          {/* Badge + action type inline */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-sm ${getBadgeClass(item)}`}>
              {item.badgeLabel}
            </span>
            {corr?.action_needed && corr.action_needed !== 'none' && (
              <span className={`inline-block px-1.5 py-0.5 border text-[10px] font-semibold rounded-sm ${ACTION_COLOURS[corr.action_needed] || 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                {ACTION_LABELS[corr.action_needed] || corr.action_needed}
              </span>
            )}
          </div>

          {/* Business + contact + timestamp */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Link
                href={`/businesses/${item.business_id}?from=actions${item.kind === 'correspondence' ? `#entry-${item.id}` : ''}`}
                className="font-semibold text-gray-900 hover:text-brand-navy hover:underline text-base"
                onClick={e => e.stopPropagation()}
              >
                {item.business_name}
              </Link>
              {corr?.contact_name && (
                <span className="text-sm text-gray-500">
                  · {corr.contact_name}{corr.contact_role && ` · ${corr.contact_role}`}
                </span>
              )}
            </div>
            {timestampChip && (
              <span className="shrink-0 text-xs text-gray-400">{timestampChip}</span>
            )}
          </div>

          {/* Subject */}
          {corr?.subject && (
            <p className="text-sm text-gray-600 italic mb-0.5">{corr.subject}</p>
          )}

          {/* Direction + snippet */}
          {corr && (corr.direction || corr.snippet) && (
            <div className="mb-0.5">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                {corr.direction === 'received' && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/8 text-brand-navy border border-brand-navy/20">↓ Received</span>
                )}
                {corr.direction === 'sent' && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-brand-olive/10 text-brand-olive border border-brand-olive/20">↑ Sent</span>
                )}
              </div>
              {corr.snippet && (
                <p
                  className={`text-xs text-gray-400 italic leading-relaxed ${snippetExpanded ? '' : 'line-clamp-2'}`}
                  onClick={e => { e.stopPropagation(); setSnippetExpanded(v => !v) }}
                  title={snippetExpanded ? undefined : 'Click to expand'}
                >
                  {corr.snippet}
                </p>
              )}
            </div>
          )}

          {/* Contract details */}
          {contract && (
            <div className="text-xs text-gray-500 mb-0.5">
              {contract.contract_amount && (
                <span className="mr-1">{contract.contract_currency || '£'}{contract.contract_amount.toLocaleString()} ·</span>
              )}
              {contract.last_correspondence_date && contract.last_correspondence_snippet ? (
                <span>
                  Last contact: {formatDateGB(contract.last_correspondence_date)} ·{' '}
                  <span className="italic text-gray-400">&ldquo;{contract.last_correspondence_snippet}&rdquo;</span>
                </span>
              ) : (
                item.badge === 'EXPIRED'
                  ? <span className="text-red-600 italic">Contract has expired — consider renewing or removing.</span>
                  : <span className="text-gray-400 italic">Consider discussing renewal before this date.</span>
              )}
            </div>
          )}

          {/* Commitment preview */}
          {commitment?.content_preview && (
            <p className="text-xs text-gray-500 italic line-clamp-2 mb-0.5">
              &ldquo;{commitment.content_preview}&rdquo;
            </p>
          )}

          {/* Hidden siblings indicator */}
          {corr && (corr.otherItemsCount ?? 0) > 0 && (
            <Link
              href={`/businesses/${item.business_id}?from=actions`}
              onClick={e => e.stopPropagation()}
              className="text-xs text-gray-400 hover:text-brand-navy transition-colors"
            >
              + {corr.otherItemsCount} more {corr.otherItemsCount === 1 ? 'item' : 'items'} →
            </Link>
          )}

          {/* Gone quiet detail */}
          {biz && (
            <div className="text-xs text-gray-500 mb-0.5">
              Last contact: {formatDateGB(biz.last_contacted_at)} · {biz.entry_count} {biz.entry_count === 1 ? 'entry' : 'entries'}
              <span className="text-gray-400 italic ml-1">— worth a nudge?</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onSelect && (
            <button
              onClick={e => { e.stopPropagation(); onSelect() }}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${rationaleOpen ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}
            >
              Why
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDone() }}
            disabled={processing}
            className="px-3 py-1 text-xs font-semibold bg-brand-olive text-white hover:bg-[#6a8550] transition-colors disabled:opacity-50"
          >
            {processing ? '…' : 'Done'}
          </button>

          {isCorr && (
            <SnoozeMenu
              open={snoozeOpen}
              onToggle={() => { onFocus(); onSnoozeToggle() }}
              onSnooze={onSnooze}
              disabled={processing}
            />
          )}

          {item.badge === 'REPLY' && isCorr && (
            <button
              onClick={e => { e.stopPropagation(); onDraftToggle() }}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${draftOpen ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              Draft
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onLogToggle() }}
            className={`px-3 py-1 text-xs font-medium border transition-colors ${logOpen ? 'bg-brand-navy border-brand-navy text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {item.badge === 'REPLY' ? 'Reply' : 'Log'}
          </button>
        </div>
      </div>

      {/* Resolution picker — invoice / waiting_on_them */}
      {showCorrPicker && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100 bg-amber-50/60">
          <p className="text-xs font-medium text-gray-700 mb-2">How was this resolved?</p>
          <div className="flex items-center gap-2 flex-wrap">
            {RESOLUTION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={e => { e.stopPropagation(); onDoneWithResolution(opt.value) }}
                disabled={processing}
                className="px-3 py-1 text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-brand-navy hover:text-white hover:border-brand-navy transition-colors disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={e => { e.stopPropagation(); onResolutionCancel() }}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Contract resolution picker */}
      {showContractPicker && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100 bg-amber-50/60">
          <p className="text-xs font-medium text-gray-700 mb-2">How do you want to handle this contract?</p>
          <div className="flex items-center gap-2 flex-wrap">
            {CONTRACT_RESOLUTION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={e => { e.stopPropagation(); onDoneWithResolution(opt.value) }}
                disabled={processing}
                className="px-3 py-1 text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-brand-navy hover:text-white hover:border-brand-navy transition-colors disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={e => { e.stopPropagation(); onResolutionCancel() }}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {draftOpen && isCorr && (
        <DraftPanel
          correspondenceId={item.id}
          onUseInLog={onUseInLog}
          onClose={onDraftToggle}
        />
      )}

      {logOpen && (
        <LogPanel
          businessId={item.business_id}
          contactId={isCorr ? corr!.contact_id : null}
          showMarkDone={isCorr}
          initialText={logInitialText}
          onSave={onLogSave}
          onCancel={onLogToggle}
        />
      )}
    </div>
  )
}
