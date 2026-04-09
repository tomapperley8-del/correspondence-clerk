'use client'

import Link from 'next/link'
import { LogPanel } from './LogPanel'
import { SnoozeMenu } from './SnoozeMenu'
import { getBadgeClass, LEFT_BORDER, ACTION_LABELS, ACTION_COLOURS, formatDateGB } from '../_utils'
import type { UnifiedItem, CorrespondenceItem, ContractItem, BusinessItem } from '../_types'

type ItemRowProps = {
  item: UnifiedItem
  focused: boolean
  logOpen: boolean
  snoozeOpen: boolean
  processing: boolean
  onFocus: () => void
  onDone: () => void
  onSnooze: (days: number) => void
  onSnoozeToggle: () => void
  onLogToggle: () => void
  onLogSave: (markDone: boolean) => void
}

export function ItemRow({
  item, focused, logOpen, snoozeOpen, processing,
  onFocus, onDone, onSnooze, onSnoozeToggle, onLogToggle, onLogSave,
}: ItemRowProps) {
  const isCorr = item.kind === 'correspondence'
  const isContract = item.kind === 'contract'
  const isBusiness = item.kind === 'business'
  const corr = isCorr ? (item as CorrespondenceItem) : null
  const contract = isContract ? (item as ContractItem) : null
  const biz = isBusiness ? (item as BusinessItem) : null

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      className={`outline-none transition-colors ${focused ? 'bg-brand-navy/[0.04]' : 'hover:bg-gray-50/60'} ${LEFT_BORDER[item.badge]}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
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

          {/* Business + contact */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Link
              href={`/businesses/${item.business_id}?from=actions`}
              className="font-semibold text-gray-900 hover:text-brand-navy hover:underline text-sm"
              onClick={e => e.stopPropagation()}
            >
              {item.business_name}
            </Link>
            {corr?.contact_name && (
              <span className="text-xs text-gray-500">
                — {corr.contact_name}{corr.contact_role && ` (${corr.contact_role})`}
              </span>
            )}
          </div>

          {/* Subject */}
          {corr?.subject && (
            <p className="text-sm text-gray-800 mb-0.5">{corr.subject}</p>
          )}

          {/* Direction + snippet */}
          {corr && (corr.direction || corr.snippet) && (
            <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
              {corr.direction === 'received' && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/8 text-brand-navy border border-brand-navy/20">↓ Received</span>
              )}
              {corr.direction === 'sent' && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-brand-olive/10 text-brand-olive border border-brand-olive/20">↑ Sent</span>
              )}
              {corr.snippet && (
                <span className="text-xs text-gray-400 italic">{corr.snippet}</span>
              )}
            </div>
          )}

          {/* Contract details + nudge */}
          {contract && (
            <div className="text-xs text-gray-500 mb-0.5">
              {contract.contract_amount && (
                <span>{contract.contract_currency || '£'}{contract.contract_amount.toLocaleString()} · </span>
              )}
              <span className="text-gray-400 italic">Consider discussing renewal before this date.</span>
            </div>
          )}

          {/* Gone quiet detail + nudge */}
          {biz && (
            <div className="text-xs text-gray-500 mb-0.5">
              Last contact: {formatDateGB(biz.last_contacted_at)} · {biz.entry_count} {biz.entry_count === 1 ? 'entry' : 'entries'}
              <span className="text-gray-400 italic ml-1">— worth a nudge?</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
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

          <button
            onClick={e => { e.stopPropagation(); onLogToggle() }}
            className={`px-3 py-1 text-xs font-medium border transition-colors ${logOpen ? 'bg-brand-navy border-brand-navy text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {item.badge === 'REPLY' ? 'Reply' : 'Log'}
          </button>
        </div>
      </div>

      {logOpen && (
        <LogPanel
          businessId={item.business_id}
          contactId={isCorr ? corr!.contact_id : null}
          showMarkDone={isCorr}
          onSave={onLogSave}
          onCancel={onLogToggle}
        />
      )}
    </div>
  )
}
