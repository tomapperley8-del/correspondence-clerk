'use client'

import { useState } from 'react'
import {
  getNeedsReply,
  getGoneQuiet,
  getOutstandingActions,
  getPureReminders,
  getContractExpiries,
} from '@/app/actions/correspondence'
import { daysAgoFn, makeSnippet, likelyNeedsReply } from '../_utils'
import type { CorrespondenceItem, BusinessItem, ContractItem } from '../_types'

export function useActionsData() {
  const [needsReply, setNeedsReply] = useState<CorrespondenceItem[]>([])
  const [goneQuiet, setGoneQuiet] = useState<BusinessItem[]>([])
  const [flagged, setFlagged] = useState<CorrespondenceItem[]>([])
  const [reminders, setReminders] = useState<CorrespondenceItem[]>([])
  const [contracts, setContracts] = useState<ContractItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    }
  }

  async function reload() {
    setLoading(true)
    setError(null)
    const [nrResult, gqResult, flagResult, remResult, contractResult] = await Promise.all([
      getNeedsReply(),
      getGoneQuiet(),
      getOutstandingActions(),
      getPureReminders(),
      getContractExpiries(),
    ])

    if ('error' in nrResult && nrResult.error) { setError(nrResult.error); setLoading(false); return }
    if ('error' in gqResult && gqResult.error) { setError(gqResult.error); setLoading(false); return }
    if ('error' in flagResult && flagResult.error) { setError(flagResult.error); setLoading(false); return }
    if ('error' in remResult && remResult.error) { setError(remResult.error); setLoading(false); return }
    const contractData = contractResult && !('error' in contractResult) ? contractResult.data || [] : []

    setNeedsReply(
      (nrResult.data || []).map((e: Record<string, unknown>) => {
        const item = mapCorrEntry(e)
        return { ...item, due_at: null, daysAgo: e.entry_date ? daysAgoFn(e.entry_date as string) : undefined }
      }).filter(likelyNeedsReply)
    )

    setGoneQuiet(
      (gqResult.data || []).map((b: Record<string, unknown>) => {
        const countArr = b.correspondence as [{ count: number }] | undefined
        return {
          kind: 'business' as const,
          id: b.id as string,
          business_id: b.id as string,
          business_name: b.name as string,
          last_contacted_at: b.last_contacted_at as string,
          entry_count: countArr?.[0]?.count ?? 0,
        }
      })
    )

    setFlagged((flagResult.data || []).map(mapCorrEntry))
    setReminders((remResult.data || []).map(mapCorrEntry))

    setContracts(
      contractData.map((b: Record<string, unknown>) => ({
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
    )

    setLoading(false)
  }

  function removeItem(id: string) {
    setNeedsReply(prev => prev.filter(i => i.id !== id))
    setFlagged(prev => prev.filter(i => i.id !== id))
    setReminders(prev => prev.filter(i => i.id !== id))
    setGoneQuiet(prev => prev.filter(i => i.id !== id))
    setContracts(prev => prev.filter(i => i.id !== id))
  }

  return {
    needsReply,
    goneQuiet,
    flagged,
    reminders,
    contracts,
    loading,
    error,
    reload,
    removeItem,
  }
}
