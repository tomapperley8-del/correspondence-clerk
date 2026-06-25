'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import type { ContractBusiness } from '@/app/actions/businesses'
import { formatDateShortGB } from '@/lib/utils'

type RenewalStage = 'not_started' | 'in_progress' | 'agreed' | 'not_renewing' | 'done'

const STAGES: { key: RenewalStage; label: string; color: string; bg: string; borderColor: string }[] = [
  { key: 'not_started', label: 'Not started', color: 'text-gray-700', bg: 'bg-gray-50', borderColor: 'border-gray-200' },
  { key: 'in_progress', label: 'In progress', color: 'text-blue-700', bg: 'bg-blue-50/50', borderColor: 'border-blue-200' },
  { key: 'agreed', label: 'Agreed', color: 'text-green-700', bg: 'bg-green-50/50', borderColor: 'border-green-200' },
  { key: 'not_renewing', label: 'Not renewing', color: 'text-red-700', bg: 'bg-red-50/30', borderColor: 'border-red-200' },
  { key: 'done', label: 'Renewed', color: 'text-brand-olive', bg: 'bg-brand-olive/5', borderColor: 'border-brand-olive/20' },
]

function getTypeBadge(b: ContractBusiness): string {
  if (b.is_club_card && b.is_advertiser) return 'CC + Ad'
  if (b.is_club_card) return 'Club Card'
  if (b.is_advertiser) return 'Advertiser'
  return ''
}

type TypeFilter = 'all' | 'club_card' | 'advertiser'

type ContractsViewProps = {
  businesses: ContractBusiness[]
  today: string
  onStageChange: (businessId: string, stage: RenewalStage) => void
  onAddBusiness: (businessId: string, type: 'club_card' | 'advertiser') => Promise<void>
  allBusinessNames: { id: string; name: string }[]
}

export function ContractsView({ businesses, today, onStageChange, onAddBusiness, allBusinessNames }: ContractsViewProps) {
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('list')
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
      not_started: [], in_progress: [], agreed: [], not_renewing: [], done: [],
    }
    for (const b of filtered) {
      const stage = (b.renewal_stage as RenewalStage) || 'not_started'
      if (map[stage]) map[stage].push(b)
      else map.not_started.push(b)
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
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              viewMode === 'list' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-2.5 py-1 font-medium transition-colors ${
              viewMode === 'pipeline' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-brand-navy'
            }`}
          >
            Pipeline
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

      {viewMode === 'list' ? (
        <ListView
          businesses={filtered}
          today={today}
          onStageChange={onStageChange}
        />
      ) : (
        <PipelineView
          byStage={byStage}
          today={today}
          onStageChange={onStageChange}
        />
      )}
    </div>
  )
}

function PipelineView({
  byStage,
  today,
  onStageChange,
}: {
  byStage: Record<RenewalStage, ContractBusiness[]>
  today: string
  onStageChange: (businessId: string, stage: RenewalStage) => void
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
    <div className="grid grid-cols-5 gap-2 min-h-[400px]">
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
            <div className={`px-2.5 py-2 border-b ${stage.borderColor}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${stage.color}`}>
                {stage.label}
              </span>
              <span className="text-[10px] text-gray-400 ml-1">({items.length})</span>
            </div>
            <div className="p-1.5 space-y-1.5 max-h-[600px] overflow-y-auto">
              {items.map((b) => (
                <BusinessCard
                  key={b.id}
                  business={b}
                  today={today}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={dragId === b.id}
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
  )
}

function BusinessCard({
  business,
  today,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  business: ContractBusiness
  today: string
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  const isExpired = business.contract_end && business.contract_end < today
  const badge = getTypeBadge(business)

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
          className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors text-left leading-tight"
        >
          {business.name}
        </Link>
        <span className="text-[9px] font-semibold px-1 py-0.5 bg-brand-navy/10 text-brand-navy flex-shrink-0">
          {badge}
        </span>
      </div>

      {business.contract_end && (
        <p className={`text-[10px] ${isExpired ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
          {isExpired ? 'Expired: ' : 'Expires: '}{formatDateShortGB(business.contract_end + 'T00:00:00')}
        </p>
      )}
      {!business.contract_end && (
        <p className="text-[10px] text-gray-300 italic">No contract date</p>
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
      if (!a.contract_end && !b.contract_end) return a.name.localeCompare(b.name)
      if (!a.contract_end) return 1
      if (!b.contract_end) return -1
      return a.contract_end.localeCompare(b.contract_end)
    }),
    [businesses]
  )

  return (
    <div className="border border-gray-200 divide-y divide-gray-100">
      <div className="grid grid-cols-[1fr_80px_100px_100px_60px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500">
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
  const isExpired = business.contract_end && business.contract_end < today
  const badge = getTypeBadge(business)
  const stage = (business.renewal_stage as RenewalStage) || 'not_started'
  const stageInfo = STAGES.find(s => s.key === stage)!

  return (
    <div className="grid grid-cols-[1fr_80px_100px_100px_60px] gap-2 items-center px-3 py-2.5 hover:bg-brand-warm/50 transition-colors">
      <Link
        href={`/businesses/${business.id}`}
        className="text-sm text-brand-navy hover:text-brand-olive transition-colors truncate font-medium"
      >
        {business.name}
      </Link>

      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy text-center">
        {badge}
      </span>

      <span className={`text-xs whitespace-nowrap ${isExpired ? 'text-red-600 font-medium' : business.contract_end ? 'text-gray-500' : 'text-gray-300 italic'}`}>
        {business.contract_end ? formatDateShortGB(business.contract_end + 'T00:00:00') : 'Not set'}
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
