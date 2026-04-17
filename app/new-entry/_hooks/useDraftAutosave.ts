'use client'
import { useState, useEffect, useRef } from 'react'

const DRAFT_KEY = 'new_entry_draft'
const DRAFT_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

export type DraftFields = {
  rawText: string
  subject: string
  entryType: string
  direction: string
  entryDateOnly: string
  actionNeeded: string
}

type PersistedDraft = DraftFields & { savedAt: number }

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
      const draft = JSON.parse(saved) as Partial<PersistedDraft>
      if (!draft.rawText) return
      // Expire drafts older than TTL — stale drafts from prior sessions should not
      // silently repopulate the form (stale entryDateOnly + ghost text bug).
      if (!draft.savedAt || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      // Never restore entryDateOnly — it should always default to today.
      // A 3-hour-old draft with yesterday's date should still file to today.
      const { savedAt: _savedAt, entryDateOnly: _entryDateOnly, ...rest } = draft as PersistedDraft
      void _savedAt
      void _entryDateOnly
      onRestore({ ...rest, entryDateOnly: new Date().toISOString().slice(0, 10) } as DraftFields)
      setDraftStatus('restored')
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save on change, debounced 1s
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!fields.rawText) return
    timerRef.current = setTimeout(() => {
      try {
        const payload: PersistedDraft = { ...fields, savedAt: Date.now() }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
        setDraftStatus('saved')
        setTimeout(() => setDraftStatus((s) => (s === 'saved' ? null : s)), 2000)
      } catch { /* ignore */ }
    }, 1000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fields.rawText, fields.subject, fields.entryType, fields.direction, fields.entryDateOnly, fields.actionNeeded])

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setDraftStatus(null)
  }

  return { draftStatus, clearDraft }
}
