'use client'

import { useState } from 'react'
import { markCorrespondenceDone, snoozeCorrespondence } from '@/app/actions/correspondence'
import { toast } from '@/lib/toast'
import type { UnifiedItem } from '../_types'

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

  async function handleDone(item: UnifiedItem) {
    if (item.kind === 'correspondence') {
      setProcessingId(item.id)
      const result = await markCorrespondenceDone(item.id)
      if ('error' in result && result.error) {
        toast.error('Failed to mark done')
      } else {
        removeItem(item.id)
        if (logOpenId === item.id) setLogOpenId(null)
        onClearFocus(item.id)
        toast.success('Marked done')
      }
      setProcessingId(null)
    } else {
      removeItem(item.id)
      onClearFocus(item.id)
      toast.success('Dismissed')
    }
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
    handleDone,
    handleSnooze,
    handleLogSave,
  }
}
