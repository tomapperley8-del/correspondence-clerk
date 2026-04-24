'use client'

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { UnifiedItem } from '../_types'

export function useActionsKeyboard({
  unifiedList,
  handleDone,
  handleSnooze,
  setLogOpenId,
  setRationalePanelId,
}: {
  unifiedList: UnifiedItem[]
  handleDone: (item: UnifiedItem) => void
  handleSnooze: (item: UnifiedItem, days: number) => void
  setLogOpenId: Dispatch<SetStateAction<string | null>>
  setRationalePanelId: Dispatch<SetStateAction<string | null>>
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focusedIndex = unifiedList.findIndex(i => i.id === focusedId)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return

    const focused = focusedId ? unifiedList.find(i => i.id === focusedId) : null

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = focusedIndex < unifiedList.length - 1 ? unifiedList[focusedIndex + 1] : unifiedList[0]
      if (next) setFocusedId(next.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = focusedIndex > 0 ? unifiedList[focusedIndex - 1] : unifiedList[unifiedList.length - 1]
      if (prev) setFocusedId(prev.id)
    } else if ((e.key === 'd' || e.key === 'D') && focused) {
      handleDone(focused)
    } else if ((e.key === 's' || e.key === 'S') && focused && focused.kind === 'correspondence') {
      handleSnooze(focused, 7)
    } else if ((e.key === 'l' || e.key === 'L') && focused) {
      setLogOpenId(id => id === focused.id ? null : focused.id)
    } else if (e.key === 'Enter' && focused) {
      e.preventDefault()
      setRationalePanelId(id => id === focused.id ? null : focused.id)
    } else if (e.key === 'Escape') {
      setRationalePanelId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, focusedIndex, unifiedList, handleDone, handleSnooze, setLogOpenId, setRationalePanelId])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { focusedId, setFocusedId }
}
