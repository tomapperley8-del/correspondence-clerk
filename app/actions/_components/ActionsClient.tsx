'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useActionsData, type InitialActionsData } from '../_hooks/useActionsData'
import { useUnifiedList } from '../_hooks/useUnifiedList'
import { useActionsKeyboard } from '../_hooks/useActionsKeyboard'
import { useActionHandlers } from '../_hooks/useActionHandlers'
import { CollapsibleSection } from './CollapsibleSection'
import { ItemRow } from './ItemRow'

export function ActionsClient({ initial }: { initial: InitialActionsData }) {
  const {
    needsReply, flagged, reminders, contracts,
    error, removeItem, restoreItem,
  } = useActionsData(initial)

  const { unifiedList, topPriority, sections, urgentSummary } = useUnifiedList(
    needsReply, flagged, reminders, contracts,
  )

  const clearFocusRef = useRef<(id: string) => void>(() => {})

  const {
    processingId, logOpenId, setLogOpenId,
    logInitialText, setLogInitialText, draftOpenId, setDraftOpenId,
    snoozeOpenId, setSnoozeOpenId,
    resolutionPendingId,
    handleDone, handleDoneWithResolution, handleResolutionCancel,
    handleSnooze, handleLogSave, handleUseInLog,
  } = useActionHandlers({
    removeItem,
    restoreItem,
    onClearFocus: (id) => clearFocusRef.current(id),
  })

  const { focusedId, setFocusedId } = useActionsKeyboard({
    unifiedList,
    handleDone,
    handleSnooze,
    setLogOpenId,
  })

  clearFocusRef.current = (id) => { if (focusedId === id) setFocusedId(null) }

  const allEmpty = unifiedList.length === 0

  function renderItemRow(item: typeof unifiedList[0], priorityNumber?: string) {
    return (
      <ItemRow
        key={`${item.kind}-${item.id}`}
        item={item}
        focused={focusedId === item.id}
        logOpen={logOpenId === item.id}
        draftOpen={draftOpenId === item.id}
        snoozeOpen={snoozeOpenId === item.id}
        processing={processingId === item.id}
        resolutionPending={resolutionPendingId === item.id}
        logInitialText={logOpenId === item.id ? logInitialText : undefined}
        priorityNumber={priorityNumber}
        onFocus={() => setFocusedId(item.id)}
        onDone={() => handleDone(item)}
        onDoneWithResolution={res => handleDoneWithResolution(item, res)}
        onResolutionCancel={() => handleResolutionCancel(item.id)}
        onSnooze={days => handleSnooze(item, days)}
        onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
        onLogToggle={() => { setLogOpenId(id => id === item.id ? null : item.id); setDraftOpenId(null) }}
        onLogSave={markDone => handleLogSave(item, markDone)}
        onDraftToggle={() => { setDraftOpenId(id => id === item.id ? null : item.id); setLogOpenId(null); setLogInitialText('') }}
        onUseInLog={draft => handleUseInLog(item.id, draft)}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Lora, serif' }}>
            Actions
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {allEmpty ? 'Nothing outstanding.' : urgentSummary || 'Nothing urgent right now.'}
          </p>
        </div>
        <div className="text-right text-xs text-gray-400 leading-relaxed hidden sm:block">
          <div className="font-medium text-gray-500 mb-0.5">Keyboard shortcuts</div>
          <div><kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">↑ ↓</kbd> navigate</div>
          <div>
            <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">D</kbd> done &nbsp;
            <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">S</kbd> snooze 7d &nbsp;
            <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">L</kbd> reply / log
          </div>
        </div>
      </div>

      {error && (
        <div className="border-2 border-red-400 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {allEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-olive/10 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-brand-olive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Lora, serif' }}>
            You&apos;re all caught up
          </h2>
          <p className="text-sm text-gray-400 mb-6">Nothing needs your attention right now.</p>
          <Link href="/dashboard" className="text-sm text-brand-navy hover:underline">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <>
          {/* Top Priorities hero block */}
          {topPriority.length > 0 && (
            <div className="border border-gray-200 bg-white mb-4">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="font-semibold text-gray-800 text-sm">
                  {topPriority.length >= 5
                    ? 'Top priorities'
                    : `Top ${topPriority.length} ${topPriority.length === 1 ? 'priority' : 'priorities'}`}
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {topPriority.map((item, i) => renderItemRow(item, String(i + 1)))}
              </div>
            </div>
          )}

          {/* Needs Reply */}
          <CollapsibleSection title="Needs Reply" count={sections.reply.length} subtitle={sections.replySubtitle} initialLimit={10}>
            {sections.reply.map(item => renderItemRow(item))}
          </CollapsibleSection>

          {/* Actions Due (includes reminders) */}
          <CollapsibleSection title="Actions Due" count={sections.actions.length} subtitle={sections.actionsSubtitle}>
            {sections.actions.map(item => renderItemRow(item))}
          </CollapsibleSection>

          {/* Renewals & Contracts */}
          <CollapsibleSection title="Renewals & Contracts" count={sections.renewals.length} subtitle={sections.renewalSubtitle}>
            {sections.renewals.map(item => renderItemRow(item))}
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
