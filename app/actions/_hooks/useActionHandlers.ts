'use client'

import { useState } from 'react'
import { markCorrespondenceDone, snoozeCorrespondence } from '@/app/actions/correspondence'
import { toast } from '@/lib/toast'
import type { UnifiedItem } from '../_types'

// Action types that warrant a resolution reason before marking done
const RESOLUTION_ACTIONS = new Set(['invoice', 'waiting_on_them'])

export function useActionHandlers({
  removeItem,
  onClearFocus,
}: {
  removeItem: (id: string) => void
  onClearFocus: (id: string) => void
}) {
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [logOpenId, setLogOpenId] = useState<string | null>(null)
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null)
  // Resolution picker: shown for invoice/waiting_on_them before marking done
  const [resolutionPendingId, setResolutionPendingId] = useState<string | null>(null)

  async function handleDone(item: UnifiedItem) {
    if (item.kind === 'correspondence') {
      const actionNeeded = item.action_needed
      // For invoice/waiting_on_them, prompt for resolution reason first
      if (RESOLUTION_ACTIONS.has(actionNeeded) && resolutionPendingId !== item.id) {
        setResolutionPendingId(item.id)
        return
      }
      // Proceed with done (resolution may be passed separately via handleDoneWithResolution)
      await _markDone(item, undefined)
    } else {
      removeItem(item.id)
      onClearFocus(item.id)
      toast.success('Dismissed')
    }
  }

  async function handleDoneWithResolution(item: UnifiedItem, resolution: string) {
    setResolutionPendingId(null)
    await _markDone(item, resolution)
  }

  function handleResolutionCancel(id: string) {
    setResolutionPendingId(null)
    // Also mark done without a resolution if they dismissed
    // (no-op: just close picker, leave item visible)
  }

  async function _markDone(item: UnifiedItem, resolution?: string) {
    if (item.kind !== 'correspondence') return
    setProcessingId(item.id)
    const result = await markCorrespondenceDone(item.id, resolution)
    if ('error' in result && result.error) {
      toast.error('Failed to mark done')
    } else {
      removeItem(item.id)
      if (logOpenId === item.id) setLogOpenId(null)
      onClearFocus(item.id)
      toast.success('Marked done')
    }
    setProcessingId(null)
  }

  async function handleSnooze(id: string, days: number) {
    setSnoozeOpenId(null)
    setProcessingId(id)
    const result = await snoozeCorrespondence(id, days)
    if ('error' in result && result.error) {
      toast.error('Failed to snooze')
    } else {
      removeItem(id)
      onClearFocus(id)
      const label = days === 3 ? '3 days' : days === 7 ? '1 week' : '1 month'
      toast.success(`Snoozed for ${label}`)
    }
    setProcessingId(null)
  }

  function handleLogSave(item: UnifiedItem, markDone: boolean) {
    removeItem(item.id)
    setLogOpenId(null)
    onClearFocus(item.id)
    toast.success('Logged')
    if (markDone && item.kind === 'correspondence') {
      markCorrespondenceDone(item.id)
    }
  }

  return {
    processingId,
    logOpenId,
    setLogOpenId,
    snoozeOpenId,
    setSnoozeOpenId,
    resolutionPendingId,
    handleDone,
    handleDoneWithResolution,
    handleResolutionCancel,
    handleSnooze,
    handleLogSave,
  }
}
