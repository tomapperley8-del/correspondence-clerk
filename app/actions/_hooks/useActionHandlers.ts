'use client'

import { useState } from 'react'
import { markCorrespondenceDone, snoozeCorrespondence } from '@/app/actions/correspondence'
import { setContractRenewalType } from '@/app/actions/businesses'
import { toast } from '@/lib/toast'
import type { UnifiedItem } from '../_types'

// Correspondence action types that warrant a resolution reason before marking done
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
  const [logInitialText, setLogInitialText] = useState<string>('')
  const [draftOpenId, setDraftOpenId] = useState<string | null>(null)
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null)
  // Resolution picker: shown for invoice/waiting_on_them, and for contract items
  const [resolutionPendingId, setResolutionPendingId] = useState<string | null>(null)

  async function handleDone(item: UnifiedItem) {
    if (item.kind === 'correspondence') {
      // invoice/waiting_on_them → prompt for resolution reason
      if (RESOLUTION_ACTIONS.has(item.action_needed) && resolutionPendingId !== item.id) {
        setResolutionPendingId(item.id)
        return
      }
      await _markDone(item, undefined)
    } else if (item.kind === 'contract') {
      // Contract → prompt for renewal outcome
      if (resolutionPendingId !== item.id) {
        setResolutionPendingId(item.id)
        return
      }
      // Fallback if called again without going through picker
      removeItem(item.id)
      onClearFocus(item.id)
    } else {
      // Gone Quiet business — simple client-side dismiss
      removeItem(item.id)
      onClearFocus(item.id)
      toast.success('Dismissed')
    }
  }

  async function handleDoneWithResolution(item: UnifiedItem, resolution: string) {
    setResolutionPendingId(null)
    if (item.kind === 'contract') {
      await _handleContractResolution(item, resolution)
    } else {
      await _markDone(item, resolution)
    }
  }

  function handleResolutionCancel(id: string) {
    setResolutionPendingId(null)
  }

  function handleUseInLog(id: string, draft: string) {
    setDraftOpenId(null)
    setLogInitialText(draft)
    setLogOpenId(id)
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
      if (draftOpenId === item.id) setDraftOpenId(null)
      onClearFocus(item.id)
      toast.success('Marked done')
    }
    setProcessingId(null)
  }

  async function _handleContractResolution(item: UnifiedItem, resolution: string) {
    if (item.kind !== 'contract') return

    if (resolution === 'in_progress') {
      // Renewal is being handled — dismiss from the list for this session.
      // Will reappear on next load until contract_end is updated or it's marked one_off.
      removeItem(item.id)
      onClearFocus(item.id)
      toast.success('Noted — will check back next time')
      return
    }

    // 'one_off' or 'removed' → persist as one_off so it never surfaces again
    setProcessingId(item.id)
    const result = await setContractRenewalType(item.business_id, 'one_off')
    if ('error' in result && result.error) {
      toast.error('Failed to update contract status')
    } else {
      removeItem(item.id)
      onClearFocus(item.id)
      toast.success('Removed from renewals — won\'t show again')
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
    setLogInitialText('')
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
    logInitialText,
    setLogInitialText,
    draftOpenId,
    setDraftOpenId,
    snoozeOpenId,
    setSnoozeOpenId,
    resolutionPendingId,
    handleDone,
    handleDoneWithResolution,
    handleResolutionCancel,
    handleSnooze,
    handleLogSave,
    handleUseInLog,
  }
}
