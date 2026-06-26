'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import type { ContractBusiness } from '@/app/actions/businesses'
import { formatDateShortGB } from '@/lib/utils'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'

type RenewalStage = 'not_started' | 'contacted' | 'in_discussion' | 'agreed' | 'not_renewing' | 'renewed'

const STAGES: { key: RenewalStage; label: string; color: string; bg: string; borderColor: string }[] = [
  { key: 'not_started', label: 'To contact', color: 'text-gray-700', bg: 'bg-gray-50', borderColor: 'border-gray-200' },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-700', bg: 'bg-blue-50/50', borderColor: 'border-blue-200' },
  { key: 'in_discussion', label: 'In discussion', color: 'text-amber-700', bg: 'bg-amber-50/50', borderColor: 'border-amber-200' },
  { key: 'agreed', label: 'Agreed', color: 'text-green-700', bg: 'bg-green-50/50', borderColor: 'border-green-200' },
  { key: 'not_renewing', label: 'Not renewing', color: 'text-red-700', bg: 'bg-red-50/30', borderColor: 'border-red-200' },
  { key: 'renewed', label: 'Renewed', color: 'text-brand-olive', bg: 'bg-brand-olive/5', borderColor: 'border-brand-olive/20' },
]

function mapLegacyStage(stage: string): RenewalStage {
  if (stage === 'in_progress') return 'contacted'
  if (stage === 'done') return 'renewed'
  if (STAGES.some(s => s.key === stage)) return stage as RenewalStage
  return 'not_started'
}

function getTypeBadge(b: ContractBusiness): string {
  if (b.is_club_card && b.is_advertiser) return 'CC + Ad'
  if (b.is_club_card) return 'Club Card'
  if (b.is_advertiser) return 'Advertiser'
  return ''
}

function daysRemaining(contractEnd: string | null, today: string): number | null {
  if (!contractEnd) return null
  const end = new Date(contractEnd + 'T00:00:00')
  const now = new Date(today + 'T00:00:00')
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

type TypeFilter = 'all' | 'club_card' | 'advertiser'

type RenewalContractFields = {
  contract_start: string
  contract_end: string
  contract_amount: number | null
  contract_currency: string
  billing_frequency: 'monthly' | 'annual'
  membership_type: string
}

type ContractsViewProps = {
  businesses: ContractBusiness[]
  today: string
  onStageChange: (businessId: string, stage: RenewalStage) => void
  onRenew: (businessId: string, contract: RenewalContractFields) => Promise<void>
  onAddBusiness: (businessId: string, type: 'club_card' | 'advertiser') => Promise<void>
  allBusinessNames: { id: string; name: string }[]
  onMoveToOutreach?: (businessId: string) => void
}

export function ContractsView({ businesses, today, onStageChange, onRenew, onAddBusiness, allBusinessNames, onMoveToOutreach }: ContractsViewProps) {
  const [renewingBusiness, setRenewingBusiness] = useState<ContractBusiness | null>(null)
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addType, setAddType] = useState<'club_card' | 'advertiser'>('club_card')
  const [adding, setAdding] = useState(false)

  const existingIds = useMemo(() => new Set(businesses.map(b => b.id)), [businesses])

  const filtered = useMemo(() => {
    let result = businesses
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(b => b.name.toLowerCase().includes(q))
    }
    if (typeFilter === 'club_card') result = result.filter(b => b.is_club_card)
    if (typeFilter === 'advertiser') result = result.filter(b => b.is_advertiser)
    return result
  }, [businesses, search, typeFilter])

  const byStage = useMemo(() => {
    const map: Record<RenewalStage, ContractBusiness[]> = {
      not_started: [], contacted: [], in_discussion: [], agreed: [], not_renewing: [], renewed: [],
    }
    for (const b of filtered) {
      const stage = mapLegacyStage(b.renewal_stage || 'not_started')
      map[stage].push(b)
    }
    return map
  }, [filtered])

  const addCandidates = useMemo(() => {
    if (!addSearch || addSearch.length < 2) return []
    const q = addSearch.toLowerCase()
    return allBusinessNames
      .filter(b => !existingIds.has(b.id) && b.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [allBusinessNames, existingIds, addSearch])

  const handleAdd = useCallback(async (businessId: string) => {
    setAdding(true)
    await onAddBusiness(businessId, addType)
    setAddSearch('')
    setAdding(false)
    setShowAddForm(false)
  }, [onAddBusiness, addType])

  const handleStageChangeOrRenew = useCallback((businessId: string, stage: RenewalStage) => {
    if (stage === 'renewed') {
      const biz = businesses.find(b => b.id === businessId)
      if (biz) setRenewingBusiness(biz)
      return
    }
    onStageChange(businessId, stage)
  }, [businesses, onStageChange])

  const handleRenewSubmit = useCallback(async (fields: RenewalContractFields) => {
    if (!renewingBusiness) return
    await onRenew(renewingBusiness.id, fields)
    setRenewingBusiness(null)
  }, [renewingBusiness, onRenew])

  const ccCount = businesses.filter(b => b.is_club_card).length
  const adCount = businesses.filter(b => b.is_advertiser).length

  return (
    <div className="mt-4">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search businesses…"
            className="w-full text-sm px-3 py-1.5 border border-gray-200 bg-white focus:border-brand-navy outline-none"
          />
        </div>

        <div className="flex bg-brand-warm border border-gray-200 p-0.5 text-xs">
          {([['all', `All (${businesses.length})`], ['club_card', `CC (${ccCount})`], ['advertiser', `Ad (${adCount})`]] as [TypeFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-2.5 py-1 font-medium transition-colors ${
                typeFilter === key ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex bg-brand-warm border border-gray-200 p-0.5 text-xs">
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              viewMode === 'pipeline' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              viewMode === 'list' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
            }`}
          >
            List
          </button>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs px-3 py-1.5 bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add business'}
        </button>
      </div>

      {/* Add business form */}
      {showAddForm && (
        <div className="mb-4 p-3 border border-gray-200 bg-white">
          <div className="flex gap-2 items-center mb-2">
            <input
              type="text"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Search for a business to add…"
              className="flex-1 text-sm px-3 py-1.5 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              autoFocus
              disabled={adding}
            />
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as 'club_card' | 'advertiser')}
              className="text-sm px-2 py-1.5 border border-gray-200 bg-white outline-none"
              disabled={adding}
            >
              <option value="club_card">Club Card</option>
              <option value="advertiser">Advertiser</option>
            </select>
          </div>
          {addCandidates.length > 0 && (
            <div className="border border-gray-200 divide-y divide-gray-100 max-h-[200px] overflow-y-auto">
              {addCandidates.map(b => (
                <button
                  key={b.id}
                  onClick={() => handleAdd(b.id)}
                  disabled={adding}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-warm transition-colors disabled:opacity-50"
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {addSearch.length >= 2 && addCandidates.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No matching businesses found</p>
          )}
        </div>
      )}

      {viewMode === 'pipeline' ? (
        <PipelineView
          byStage={byStage}
          today={today}
          onStageChange={handleStageChangeOrRenew}
          onMoveToOutreach={onMoveToOutreach}
        />
      ) : (
        <ListView
          businesses={filtered}
          today={today}
          onStageChange={handleStageChangeOrRenew}
        />
      )}

      {renewingBusiness && (
        <RenewalContractModal
          business={renewingBusiness}
          onSubmit={handleRenewSubmit}
          onClose={() => setRenewingBusiness(null)}
        />
      )}
    </div>
  )
}

function PipelineView({
  byStage,
  today,
  onStageChange,
  onMoveToOutreach,
}: {
  byStage: Record<RenewalStage, ContractBusiness[]>
  today: string
  onStageChange: (businessId: string, stage: RenewalStage) => void
  onMoveToOutreach?: (businessId: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<RenewalStage | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDragId(id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, stage: RenewalStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, stage: RenewalStage) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId
    if (id) onStageChange(id, stage)
    setDragId(null)
    setDragOverStage(null)
  }, [dragId, onStageChange])

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setDragOverStage(null)
  }, [])

  return (
    <div className="overflow-x-auto pb-2">
    <div className="grid gap-2 min-h-[400px]" style={{ gridTemplateColumns: 'repeat(6, minmax(150px, 1fr))' }}>
      {STAGES.map((stage) => {
        const items = byStage[stage.key]
        const isDragOver = dragOverStage === stage.key
        return (
          <div
            key={stage.key}
            className={`${stage.bg} border ${isDragOver ? 'border-brand-navy border-2' : stage.borderColor} transition-colors`}
            onDragOver={(e) => handleDragOver(e, stage.key)}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, stage.key)}
          >
            <div className={`px-2 py-1.5 border-b ${stage.borderColor}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${stage.color}`}>
                {stage.label}
              </span>
              <span className="text-[10px] text-gray-400 ml-1">({items.length})</span>
            </div>
            <div className="p-1 space-y-1 max-h-[600px] overflow-y-auto">
              {items.map((b) => (
                <BusinessCard
                  key={b.id}
                  business={b}
                  today={today}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={dragId === b.id}
                  onMoveToOutreach={stage.key === 'not_renewing' ? onMoveToOutreach : undefined}
                />
              ))}
              {items.length === 0 && (
                <p className="text-[10px] text-gray-400 text-center py-6">Drag here</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}

function BusinessCard({
  business,
  today,
  onDragStart,
  onDragEnd,
  isDragging,
  onMoveToOutreach,
}: {
  business: ContractBusiness
  today: string
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  isDragging: boolean
  onMoveToOutreach?: (businessId: string) => void
}) {
  const days = daysRemaining(business.current_contract_end, today)
  const isExpired = days !== null && days < 0
  const badge = getTypeBadge(business)
  const stage = mapLegacyStage(business.renewal_stage)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, business.id)}
      onDragEnd={onDragEnd}
      className={`bg-white border border-gray-200 p-2 shadow-[var(--shadow-sm)] cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <Link
          href={`/businesses/${business.id}`}
          className="text-[11px] font-medium text-brand-navy hover:text-brand-olive transition-colors text-left leading-tight"
        >
          {business.name}
        </Link>
        <span className="text-[8px] font-semibold px-1 py-0.5 bg-brand-navy/10 text-brand-navy flex-shrink-0">
          {badge}
        </span>
      </div>

      {business.current_contract_end && (
        <p className={`text-[10px] ${isExpired ? 'text-red-600 font-semibold' : days !== null && days <= 30 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
          {isExpired
            ? `Expired: ${formatDateShortGB(business.current_contract_end + 'T00:00:00')}`
            : `Expires: ${formatDateShortGB(business.current_contract_end + 'T00:00:00')}`}
        </p>
      )}
      {!business.current_contract_end && (
        <p className="text-[10px] text-gray-300 italic">No contract date</p>
      )}

      {business.renewal_contacted_at && stage !== 'not_started' && (
        <p className="text-[9px] text-blue-500 mt-0.5">
          Contacted: {formatDateShortGB(business.renewal_contacted_at + 'T00:00:00')}
        </p>
      )}

      {onMoveToOutreach && (
        <button
          onClick={(e) => { e.stopPropagation(); onMoveToOutreach(business.id) }}
          className="text-[9px] text-brand-navy hover:text-brand-olive transition-colors mt-1 font-medium"
        >
          Move to outreach →
        </button>
      )}
    </div>
  )
}

function ListView({
  businesses,
  today,
  onStageChange,
}: {
  businesses: ContractBusiness[]
  today: string
  onStageChange: (businessId: string, stage: RenewalStage) => void
}) {
  const sorted = useMemo(() =>
    [...businesses].sort((a, b) => {
      if (!a.current_contract_end && !b.current_contract_end) return a.name.localeCompare(b.name)
      if (!a.current_contract_end) return 1
      if (!b.current_contract_end) return -1
      return a.current_contract_end.localeCompare(b.current_contract_end)
    }),
    [businesses]
  )

  return (
    <div className="border border-gray-200 divide-y divide-gray-100">
      <div className="grid grid-cols-[1fr_80px_100px_110px_60px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        <span>Business</span>
        <span>Type</span>
        <span>Contract ends</span>
        <span>Stage</span>
        <span></span>
      </div>
      {sorted.map((b) => (
        <BusinessListRow
          key={b.id}
          business={b}
          today={today}
          onStageChange={onStageChange}
        />
      ))}
      {sorted.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No businesses match your search.
        </div>
      )}
    </div>
  )
}

function BusinessListRow({
  business,
  today,
  onStageChange,
}: {
  business: ContractBusiness
  today: string
  onStageChange: (businessId: string, stage: RenewalStage) => void
}) {
  const days = daysRemaining(business.current_contract_end, today)
  const isExpired = days !== null && days < 0
  const badge = getTypeBadge(business)
  const stage = mapLegacyStage(business.renewal_stage)
  const stageInfo = STAGES.find(s => s.key === stage)!

  return (
    <div className="grid grid-cols-[1fr_80px_100px_110px_60px] gap-2 items-center px-3 py-2.5 hover:bg-brand-warm/50 transition-colors">
      <Link
        href={`/businesses/${business.id}`}
        className="text-sm text-brand-navy hover:text-brand-olive transition-colors truncate font-medium"
      >
        {business.name}
      </Link>

      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy text-center">
        {badge}
      </span>

      <span className={`text-xs whitespace-nowrap ${isExpired ? 'text-red-600 font-medium' : business.current_contract_end ? 'text-gray-500' : 'text-gray-300 italic'}`}>
        {business.current_contract_end ? formatDateShortGB(business.current_contract_end + 'T00:00:00') : 'Not set'}
      </span>

      <select
        value={stage}
        onChange={(e) => onStageChange(business.id, e.target.value as RenewalStage)}
        className={`text-[10px] font-medium px-1.5 py-0.5 border border-gray-200 ${stageInfo.bg} ${stageInfo.color} outline-none cursor-pointer`}
      >
        {STAGES.map(s => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      <Link
        href={`/businesses/${business.id}`}
        className="text-[10px] text-gray-400 hover:text-brand-navy transition-colors text-center"
      >
        View →
      </Link>
    </div>
  )
}

function RenewalContractModal({
  business,
  onSubmit,
  onClose,
}: {
  business: ContractBusiness
  onSubmit: (fields: RenewalContractFields) => Promise<void>
  onClose: () => void
}) {
  const modalRef = useModalKeyboard(true, onClose)
  const defaultType = business.is_club_card ? 'club_card' : 'advertiser'
  const [membershipType, setMembershipType] = useState(defaultType)
  const [contractStart, setContractStart] = useState('')
  const [contractEnd, setContractEnd] = useState('')
  const [amount, setAmount] = useState(business.current_contract_amount?.toString() ?? '')
  const [currency, setCurrency] = useState(business.current_contract_currency ?? 'GBP')
  const [frequency, setFrequency] = useState<'monthly' | 'annual'>('annual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isBoth = business.is_club_card && business.is_advertiser

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contractStart || !contractEnd) {
      setError('Start and end dates are required')
      return
    }
    if (contractEnd <= contractStart) {
      setError('End date must be after start date')
      return
    }
    setSaving(true)
    setError(null)
    await onSubmit({
      contract_start: contractStart,
      contract_end: contractEnd,
      contract_amount: amount ? parseFloat(amount) : null,
      contract_currency: currency,
      billing_frequency: frequency,
      membership_type: membershipType,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-label="New contract details"
        className="bg-white border border-gray-200 w-full max-w-md p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Renew — {business.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">Enter the new contract details before marking as renewed.</p>

        {error && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 mb-4 text-sm text-red-800">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isBoth ? (
            <div>
              <label htmlFor="renew-type" className="block text-sm font-medium text-gray-700 mb-1">Contract type</label>
              <select
                id="renew-type"
                value={membershipType}
                onChange={(e) => setMembershipType(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              >
                <option value="club_card">Club Card</option>
                <option value="advertiser">Advertiser</option>
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {business.is_club_card ? 'Club Card' : 'Advertiser'} contract
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="renew-start" className="block text-sm font-medium text-gray-700 mb-1">Contract start</label>
              <input
                id="renew-start"
                type="date"
                value={contractStart}
                onChange={(e) => setContractStart(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="renew-end" className="block text-sm font-medium text-gray-700 mb-1">Contract end</label>
              <input
                id="renew-end"
                type="date"
                value={contractEnd}
                onChange={(e) => setContractEnd(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="renew-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                id="renew-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              />
            </div>
            <div>
              <label htmlFor="renew-currency" className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                id="renew-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              >
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label htmlFor="renew-frequency" className="block text-sm font-medium text-gray-700 mb-1">Billing</label>
              <select
                id="renew-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'monthly' | 'annual')}
                className="w-full text-sm px-3 py-2 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none"
              >
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm px-4 py-2 bg-brand-olive text-white font-medium hover:bg-brand-olive/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Mark as renewed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
