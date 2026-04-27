'use client'

import { useState, useEffect } from 'react'
import {
  getNeedsReply,
  getOutstandingActions,
  getPureReminders,
  getContractExpiries,
  getCommitmentAlerts,
} from '@/app/actions/correspondence'
import { daysAgoFn, makeSnippet, likelyNeedsReply } from '../_utils'
import type { CorrespondenceItem, ContractItem, CommitmentItem, UnifiedItem } from '../_types'

type RawResult<T> = { data?: T[]; error?: string | null }

export type InitialActionsData = {
  needsReply: RawResult<Record<string, unknown>>
  flagged: RawResult<Record<string, unknown>>
  reminders: RawResult<Record<string, unknown>>
  contracts: RawResult<Record<string, unknown>>
  commitments: RawResult<Record<string, unknown>>
}

function mapCorrEntry(e: Record<string, unknown>): CorrespondenceItem {
  const biz = e.businesses as { id: string; name: string } | null
  const contact = (Array.isArray(e.contact) ? e.contact[0] : e.contact) as { name: string; role: string | null } | null
  return {
    kind: 'correspondence',
    id: e.id as string,
    business_id: biz?.id ?? (e.business_id as string),
    business_name: biz?.name ?? '',
    contact_id: e.contact_id as string | null,
    contact_name: contact?.name ?? null,
    contact_role: contact?.role ?? null,
    subject: e.subject as string | null,
    action_needed: e.action_needed as string,
    due_at: e.due_at as string | null,
    entry_date: e.entry_date as string | null,
    direction: e.direction as string | null,
    type: e.type as string | null,
    snippet: makeSnippet(e.formatted_text_current as string | null),
    otherItemsCount: (e.other_items_count as number) ?? 0,
  }
}

function mapNeedsReply(rows: Record<string, unknown>[]): CorrespondenceItem[] {
  return rows
    .map(e => {
      const item = mapCorrEntry(e)
      return { ...item, due_at: null, daysAgo: e.entry_date ? daysAgoFn(e.entry_date as string) : undefined }
    })
    .filter(likelyNeedsReply)
}

function mapCommitmentEntry(e: Record<string, unknown>): CommitmentItem {
  const rawContent = e.content as string | null
  const contentPreview = rawContent
    ? rawContent.replace(/[*_#>`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
    : ''
  return {
    kind: 'commitment',
    id: e.id as string,
    business_id: e.business_id as string,
    business_name: e.business_name as string,
    content_preview: contentPreview,
    generated_at: e.generated_at as string,
  }
}

function getLocalDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('dismissed_insights')
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function persistDismissedInsight(id: string) {
  try {
    const dismissed = getLocalDismissedIds()
    dismissed.add(id)
    localStorage.setItem('dismissed_insights', JSON.stringify([...dismissed]))
  } catch { /* localStorage unavailable */ }
}

function mapContracts(rows: Record<string, unknown>[]): ContractItem[] {
  return rows.map(b => ({
    kind: 'contract' as const,
    id: b.id as string,
    business_id: b.id as string,
    business_name: b.name as string,
    contract_end: b.contract_end as string,
    contract_amount: b.contract_amount as number | null,
    contract_currency: b.contract_currency as string | null,
    last_correspondence_date: b.last_correspondence_date as string | null,
    last_correspondence_snippet: b.last_correspondence_snippet as string | null,
  }))
}

function unwrap<T>(result: RawResult<T>): T[] {
  if (result?.error) return []
  return result?.data ?? []
}

export function useActionsData(initial?: InitialActionsData) {
  const [needsReply, setNeedsReply] = useState<CorrespondenceItem[]>(() =>
    initial ? mapNeedsReply(unwrap(initial.needsReply)) : []
  )
  const [flagged, setFlagged] = useState<CorrespondenceItem[]>(() =>
    initial ? unwrap(initial.flagged).map(mapCorrEntry) : []
  )
  const [reminders, setReminders] = useState<CorrespondenceItem[]>(() =>
    initial ? unwrap(initial.reminders).map(mapCorrEntry) : []
  )
  const [contracts, setContracts] = useState<ContractItem[]>(() =>
    initial ? mapContracts(unwrap(initial.contracts)) : []
  )
  const [commitments, setCommitments] = useState<CommitmentItem[]>(() =>
    initial ? unwrap(initial.commitments).map(mapCommitmentEntry) : []
  )
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState<string | null>(null)

  // Filter out previously dismissed commitment items after hydration
  useEffect(() => {
    const dismissed = getLocalDismissedIds()
    if (dismissed.size > 0) {
      setCommitments(prev => prev.filter(c => !dismissed.has(c.id)))
    }
  }, [])

  async function reload() {
    setLoading(true)
    setError(null)
    const [nrResult, flagResult, remResult, contractResult, commitResult] = await Promise.all([
      getNeedsReply().catch(() => ({ data: [], error: null } as RawResult<Record<string, unknown>>)),
      getOutstandingActions().catch(() => ({ data: [], error: null } as RawResult<Record<string, unknown>>)),
      getPureReminders().catch(() => ({ data: [], error: null } as RawResult<Record<string, unknown>>)),
      getContractExpiries().catch(() => ({ data: [], error: null } as RawResult<Record<string, unknown>>)),
      getCommitmentAlerts().catch(() => ({ data: [], error: null } as RawResult<Record<string, unknown>>)),
    ])

    setNeedsReply(mapNeedsReply(unwrap(nrResult as RawResult<Record<string, unknown>>)))
    setFlagged(unwrap(flagResult as RawResult<Record<string, unknown>>).map(mapCorrEntry))
    setReminders(unwrap(remResult as RawResult<Record<string, unknown>>).map(mapCorrEntry))
    setContracts(mapContracts(unwrap(contractResult as RawResult<Record<string, unknown>>)))
    const dismissed = getLocalDismissedIds()
    setCommitments(
      unwrap(commitResult as RawResult<Record<string, unknown>>)
        .map(mapCommitmentEntry)
        .filter(c => !dismissed.has(c.id))
    )

    setLoading(false)
  }

  function removeItem(id: string) {
    setNeedsReply(prev => prev.filter(i => i.id !== id))
    setFlagged(prev => prev.filter(i => i.id !== id))
    setReminders(prev => prev.filter(i => i.id !== id))
    setContracts(prev => prev.filter(i => i.id !== id))
    setCommitments(prev => prev.filter(i => i.id !== id))
  }

  function restoreItem(item: UnifiedItem) {
    if (item.kind === 'contract') {
      setContracts(prev => [...prev, item as ContractItem])
    } else if (item.kind === 'commitment') {
      setCommitments(prev => [...prev, item as CommitmentItem])
    } else if (item.kind === 'correspondence') {
      const corr = item as CorrespondenceItem
      if (item.badge === 'REPLY') {
        setNeedsReply(prev => [...prev, corr])
      } else if (item.badge === 'REMINDER') {
        setReminders(prev => [...prev, corr])
      } else {
        setFlagged(prev => [...prev, corr])
      }
    }
  }

  return {
    needsReply,
    flagged,
    reminders,
    contracts,
    commitments,
    loading,
    error,
    reload,
    removeItem,
    restoreItem,
  }
}
