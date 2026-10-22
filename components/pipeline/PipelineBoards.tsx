'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getContractBusinesses,
  getOutreachBusinesses,
  updateBusinessRenewalStage,
  addBusinessToContracts,
  updateOutreachStage,
  addBusinessToOutreach,
  removeBusinessFromOutreach,
  promoteOutreachToContracts,
  updateOutreachStageDate,
  updateRenewalStageDate,
  type ContractBusiness,
  type OutreachBusiness,
} from '@/app/actions/businesses'
import { createContract, updateContract, getContractsByBusiness } from '@/app/actions/contracts'
import { toast } from '@/lib/toast'
import { ContractsView } from './ContractsView'
import { OutreachView } from './OutreachView'

// The renewals and outreach boards (UI overhaul Stage 7): moved here from the
// To-dos Contracts and Outreach tabs, which are retired. Shown by the Renewals
// view's board toggle and the Outreach view in Businesses.

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type RenewalContractFields = {
  contract_start: string
  contract_end: string
  contract_amount: number | null
  contract_currency: string
  billing_frequency: 'monthly' | 'annual'
  membership_type: string
}

export function PipelineBoard({ kind, allBusinessNames }: { kind: 'renewals' | 'outreach'; allBusinessNames: { id: string; name: string }[] }) {
  const router = useRouter()
  const [contractBusinesses, setContractBusinesses] = useState<ContractBusiness[] | null>(null)
  const [outreachBusinesses, setOutreachBusinesses] = useState<OutreachBusiness[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = kind === 'renewals'
      ? getContractBusinesses().then((r) => { if (!cancelled) { if (r.error) setLoadError(r.error); setContractBusinesses(r.data ?? []) } })
      : getOutreachBusinesses().then((r) => { if (!cancelled) { if (r.error) setLoadError(r.error); setOutreachBusinesses(r.data ?? []) } })
    load.catch(() => { if (!cancelled) setLoadError('Could not load the board') })
    return () => { cancelled = true }
  }, [kind])

  const handleStageChange = useCallback(
    async (businessId: string, stage: string) => {
      setContractBusinesses((prev) =>
        (prev ?? []).map((b) => {
          if (b.id !== businessId) return b
          const isRenewed = stage === 'renewed'
          return {
            ...b,
            renewal_stage: isRenewed ? 'not_started' : stage,
            renewal_not_started_at: isRenewed ? todayStr() : stage === 'not_started' ? todayStr() : b.renewal_not_started_at,
            renewal_contacted_at: stage === 'contacted' ? todayStr() : isRenewed ? null : b.renewal_contacted_at,
            renewal_in_discussion_at: stage === 'in_discussion' ? todayStr() : isRenewed ? null : b.renewal_in_discussion_at,
            renewal_agreed_at: stage === 'agreed' ? todayStr() : isRenewed ? null : b.renewal_agreed_at,
            renewal_invoice_paid_at: stage === 'invoice_paid' ? todayStr() : isRenewed ? null : b.renewal_invoice_paid_at,
            renewal_declined_at: stage === 'not_renewing' ? new Date().toISOString() : stage !== 'not_renewing' ? null : b.renewal_declined_at,
          }
        })
      )
      const result = await updateBusinessRenewalStage(businessId, stage)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else if (stage === 'renewed') {
        toast.success('Marked as renewed — moved back to To Contact')
      }
    },
    [router]
  )

  const handleRenew = useCallback(async (businessId: string, contract: RenewalContractFields) => {
    const existingResult = await getContractsByBusiness(businessId)
    if (existingResult.data) {
      const sametype = existingResult.data.filter((c) => c.is_current && c.membership_type === contract.membership_type)
      for (const old of sametype) {
        await updateContract(old.id, businessId, { is_current: false })
      }
    }
    const createResult = await createContract(businessId, { ...contract, is_current: true })
    if (createResult.error) {
      toast.error(createResult.error)
      return
    }
    setContractBusinesses((prev) =>
      (prev ?? []).map((b) => (b.id === businessId ? {
        ...b,
        renewal_stage: 'not_started',
        renewal_contacted_at: null,
        current_contract_start: contract.contract_start,
        current_contract_end: contract.contract_end,
        current_contract_amount: contract.contract_amount,
        current_contract_currency: contract.contract_currency,
      } : b))
    )
    await updateBusinessRenewalStage(businessId, 'renewed')
    toast.success('Contract renewed — moved back to To Contact')
  }, [])

  const handleAddBusinessToContracts = useCallback(
    async (businessId: string, type: 'club_card' | 'advertiser') => {
      const result = await addBusinessToContracts(businessId, type)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Business added to contracts')
        const fresh = await getContractBusinesses()
        if (fresh.data) setContractBusinesses(fresh.data)
      }
    },
    []
  )

  const handleRenewalDateChange = useCallback(
    async (businessId: string, field: string, date: string) => {
      setContractBusinesses((prev) => (prev ?? []).map((b) => (b.id === businessId ? { ...b, [field]: date } : b)))
      const result = await updateRenewalStageDate(businessId, field, date)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  const handleOutreachStageChange = useCallback(
    async (businessId: string, stage: string) => {
      if (stage === 'invoice_paid') {
        setOutreachBusinesses((prev) => (prev ?? []).filter((b) => b.id !== businessId))
        const result = await promoteOutreachToContracts(businessId)
        if (result.error) {
          toast.error(result.error)
          router.refresh()
        } else {
          toast.success('Invoice paid! Moved to the renewals board')
        }
        return
      }
      setOutreachBusinesses((prev) =>
        (prev ?? []).map((b) => (b.id === businessId ? {
          ...b,
          outreach_stage: stage,
          outreach_identified_at: stage === 'identified' ? todayStr() : b.outreach_identified_at,
          outreach_contacted_at: stage === 'contacted' ? todayStr() : b.outreach_contacted_at,
          outreach_followed_up_at: stage === 'followed_up' ? todayStr() : b.outreach_followed_up_at,
          outreach_in_discussion_at: stage === 'in_discussion' ? todayStr() : b.outreach_in_discussion_at,
          outreach_won_at: stage === 'won' ? todayStr() : b.outreach_won_at,
          outreach_invoice_paid_at: stage === 'invoice_paid' ? todayStr() : b.outreach_invoice_paid_at,
          outreach_declined_at: stage === 'not_interested' ? new Date().toISOString() : stage !== 'not_interested' ? null : b.outreach_declined_at,
        } : b))
      )
      const result = await updateOutreachStage(businessId, stage)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  const handleAddOutreachBusiness = useCallback(
    async (businessId: string) => {
      const result = await addBusinessToOutreach(businessId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Added to outreach pipeline')
      if (kind === 'outreach') {
        const fresh = await getOutreachBusinesses()
        if (fresh.data) setOutreachBusinesses(fresh.data)
      }
    },
    [kind]
  )

  const handleRemoveOutreachBusiness = useCallback(
    async (businessId: string) => {
      setOutreachBusinesses((prev) => (prev ?? []).filter((b) => b.id !== businessId))
      const result = await removeBusinessFromOutreach(businessId)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      } else {
        toast.success('Removed from outreach')
      }
    },
    [router]
  )

  const handleOutreachDateChange = useCallback(
    async (businessId: string, field: string, date: string) => {
      setOutreachBusinesses((prev) => (prev ?? []).map((b) => (b.id === businessId ? { ...b, [field]: date } : b)))
      const result = await updateOutreachStageDate(businessId, field, date)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    },
    [router]
  )

  if (loadError) return <p className="text-sm text-red-700">Could not load the board: {loadError}</p>

  if (kind === 'renewals') {
    if (!contractBusinesses) return <p className="text-sm text-gray-500">Loading the board…</p>
    return (
      <ContractsView
        businesses={contractBusinesses}
        today={todayStr()}
        onStageChange={handleStageChange}
        onRenew={handleRenew}
        onAddBusiness={handleAddBusinessToContracts}
        onDateChange={handleRenewalDateChange}
        allBusinessNames={allBusinessNames}
        onMoveToOutreach={(businessId) => { handleAddOutreachBusiness(businessId) }}
      />
    )
  }

  if (!outreachBusinesses) return <p className="text-sm text-gray-500">Loading the board…</p>
  return (
    <OutreachView
      businesses={outreachBusinesses}
      onStageChange={handleOutreachStageChange}
      onAddBusiness={handleAddOutreachBusiness}
      onRemoveBusiness={handleRemoveOutreachBusiness}
      onDateChange={handleOutreachDateChange}
      allBusinessNames={allBusinessNames}
    />
  )
}
