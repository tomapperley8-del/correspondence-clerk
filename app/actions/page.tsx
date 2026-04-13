'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useActionsData } from './_hooks/useActionsData'
import { useUnifiedList } from './_hooks/useUnifiedList'
import { useActionsKeyboard } from './_hooks/useActionsKeyboard'
import { useActionHandlers } from './_hooks/useActionHandlers'
import { CollapsibleSection } from './_components/CollapsibleSection'
import { ItemRow } from './_components/ItemRow'
import { QuietRow } from './_components/QuietRow'
import type { BusinessItem, Badge } from './_types'

export default function ActionsPage() {
  const {
    needsReply, goneQuiet, flagged, reminders, contracts,
    loading, error, reload, removeItem,
  } = useActionsData()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [])

  const { unifiedList, sections, urgentSummary } = useUnifiedList(
    needsReply, goneQuiet, flagged, reminders, contracts,
  )

  // Break circular dependency: handlers need clearFocus, keyboard provides setFocusedId
  const clearFocusRef = useRef<(id: string) => void>(() => {})

  const {
    processingId, logOpenId, setLogOpenId,
    snoozeOpenId, setSnoozeOpenId,
    resolutionPendingId,
    handleDone, handleDoneWithResolution, handleResolutionCancel,
    handleSnooze, handleLogSave,
  } = useActionHandlers({
    removeItem,
    onClearFocus: (id) => clearFocusRef.current(id),
  })

  const { focusedId, setFocusedId } = useActionsKeyboard({
    unifiedList,
    handleDone,
    handleSnooze,
    setLogOpenId,
  })

  // Wire focus cleanup — always reflects latest focusedId/setFocusedId
  clearFocusRef.current = (id) => { if (focusedId === id) setFocusedId(null) }

  const allEmpty = unifiedList.length === 0

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
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
          {/* Needs Reply */}
          <CollapsibleSection title="Needs Reply" count={sections.reply.length} subtitle={sections.replySubtitle}>
            {sections.reply.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                resolutionPending={resolutionPendingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onDoneWithResolution={res => handleDoneWithResolution(item, res)}
                onResolutionCancel={() => handleResolutionCancel(item.id)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>

          {/* Actions Due */}
          <CollapsibleSection title="Actions Due" count={sections.actions.length} subtitle={sections.actionsSubtitle}>
            {sections.actions.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                resolutionPending={resolutionPendingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onDoneWithResolution={res => handleDoneWithResolution(item, res)}
                onResolutionCancel={() => handleResolutionCancel(item.id)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>

          {/* Renewals & Contracts */}
          <CollapsibleSection title="Renewals & Contracts" count={sections.renewals.length} defaultExpanded={sections.urgentRenewal} subtitle={sections.renewalSubtitle}>
            {sections.renewals.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                resolutionPending={resolutionPendingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onDoneWithResolution={res => handleDoneWithResolution(item, res)}
                onResolutionCancel={() => handleResolutionCancel(item.id)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>

          {/* Gone Quiet — compact rows */}
          <CollapsibleSection
            title="Gone Quiet"
            count={sections.quiet.length}
            subtitle="businesses not contacted in 60+ days"
          >
            {sections.quiet.map(item => (
              <QuietRow
                key={item.id}
                item={item as BusinessItem & { badge: Badge; urgencyScore: number; badgeLabel: string }}
                logOpen={logOpenId === item.id}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
                onDone={() => handleDone(item)}
              />
            ))}
          </CollapsibleSection>

          {/* Reminders */}
          <CollapsibleSection title="Reminders" count={sections.reminders.length}>
            {sections.reminders.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                resolutionPending={resolutionPendingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onDoneWithResolution={res => handleDoneWithResolution(item, res)}
                onResolutionCancel={() => handleResolutionCancel(item.id)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
