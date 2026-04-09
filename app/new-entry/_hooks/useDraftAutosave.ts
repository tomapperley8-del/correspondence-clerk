'use client'
import { useState, useEffect, useRef } from 'react'

const DRAFT_KEY = 'new_entry_draft'

export type DraftFields = {
  rawText: string
  subject: string
  entryType: string
  direction: string
  entryDateOnly: string
  actionNeeded: string
}

export function useDraftAutosave(
  fields: DraftFields,
  onRestore: (draft: DraftFields) => void,
  hasEmailImport: boolean
) {
  const [draftStatus, setDraftStatus] = useState<'saved' | 'restored' | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const restoredRef = useRef(false)

  // Restore on mount (skip if email is being imported)
  useEffect(() => {
    if (hasEmailImport || restoredRef.current) return
    restoredRef.current = true
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (!saved) return
      const draft: DraftFields = JSON.parse(saved)
      if (!draft.rawText) return
      onRestore(draft)
      setDraftStatus('restored')
      setTimeout(() => setDraftStatus(null), 3000)
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save on change, debounced 1s
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!fields.rawText) return
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(fields))
        setDraftStatus('saved')
        setTimeout(() => setDraftStatus(null), 2000)
      } catch { /* ignore */ }
    }, 1000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fields.rawText, fields.subject, fields.entryType, fields.direction, fields.entryDateOnly, fields.actionNeeded])

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
  }

  return { draftStatus, clearDraft }
}
