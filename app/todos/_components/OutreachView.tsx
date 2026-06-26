'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import type { OutreachBusiness } from '@/app/actions/businesses'
import { formatDateShortGB } from '@/lib/utils'

type OutreachStage = 'identified' | 'contacted' | 'followed_up' | 'in_discussion' | 'won' | 'not_interested'

const STAGES: { key: OutreachStage; label: string; color: string; bg: string; borderColor: string }[] = [
  { key: 'identified', label: 'Identified', color: 'text-gray-700', bg: 'bg-gray-50', borderColor: 'border-gray-200' },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-700', bg: 'bg-blue-50/50', borderColor: 'border-blue-200' },
  { key: 'followed_up', label: 'Followed up', color: 'text-purple-700', bg: 'bg-purple-50/50', borderColor: 'border-purple-200' },
  { key: 'in_discussion', label: 'In discussion', color: 'text-amber-700', bg: 'bg-amber-50/50', borderColor: 'border-amber-200' },
  { key: 'won', label: 'Won', color: 'text-green-700', bg: 'bg-green-50/50', borderColor: 'border-green-200' },
  { key: 'not_interested', label: 'Not interested', color: 'text-red-700', bg: 'bg-red-50/30', borderColor: 'border-red-200' },
]

function getTypeBadge(b: OutreachBusiness): string | null {
  if (b.is_club_card && b.is_advertiser) return 'CC + Ad'
  if (b.is_club_card) return 'CC'
  if (b.is_advertiser) return 'Ad'
  return null
}

type OutreachViewProps = {
  businesses: OutreachBusiness[]
  onStageChange: (businessId: string, stage: OutreachStage) => void
  onAddBusiness: (businessId: string) => Promise<void>
  onRemoveBusiness: (businessId: string) => Promise<void>
  allBusinessNames: { id: string; name: string }[]
}

export function OutreachView({ businesses, onStageChange, onAddBusiness, onRemoveBusiness, allBusinessNames }: OutreachViewProps) {
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const existingIds = useMemo(() => new Set(businesses.map(b => b.id)), [businesses])

  const filtered = useMemo(() => {
    if (!search) return businesses
    const q = search.toLowerCase()
    return businesses.filter(b => b.name.toLowerCase().includes(q))
  }, [businesses, search])

  const byStage = useMemo(() => {
    const map: Record<OutreachStage, OutreachBusiness[]> = {
      identified: [], contacted: [], followed_up: [], in_discussion: [], won: [], not_interested: [],
    }
    for (const b of filtered) {
      const stage = (b.outreach_stage || 'identified') as OutreachStage
      if (map[stage]) map[stage].push(b)
      else map.identified.push(b)
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
    await onAddBusiness(businessId)
    setAddSearch('')
    setAdding(false)
    setShowAddForm(false)
  }, [onAddBusiness])

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prospects…"
            className="w-full text-sm px-3 py-1.5 border border-gray-200 bg-white focus:border-brand-navy outline-none"
          />
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
          {showAddForm ? 'Cancel' : '+ Add prospect'}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-3 border border-gray-200 bg-white">
          <input
            type="text"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Search for a business to add…"
            className="w-full text-sm px-3 py-1.5 border border-gray-200 bg-brand-paper focus:border-brand-navy outline-none mb-2"
            autoFocus
            disabled={adding}
          />
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
        <OutreachPipeline
          byStage={byStage}
          onStageChange={onStageChange}
          onRemove={onRemoveBusiness}
        />
      ) : (
        <OutreachList
          businesses={filtered}
          onStageChange={onStageChange}
          onRemove={onRemoveBusiness}
        />
      )}
    </div>
  )
}

function OutreachPipeline({
  byStage,
  onStageChange,
  onRemove,
}: {
  byStage: Record<OutreachStage, OutreachBusiness[]>
  onStageChange: (businessId: string, stage: OutreachStage) => void
  onRemove: (businessId: string) => Promise<void>
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<OutreachStage | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDragId(id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, stage: OutreachStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, stage: OutreachStage) => {
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
                <OutreachCard
                  key={b.id}
                  business={b}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  isDragging={dragId === b.id}
                  onRemove={onRemove}
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

function OutreachCard({
  business,
  onDragStart,
  onDragEnd,
  isDragging,
  onRemove,
}: {
  business: OutreachBusiness
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  isDragging: boolean
  onRemove: (businessId: string) => Promise<void>
}) {
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
          className="text-[11px] font-medium text-brand-navy hover:text-brand-olive transition-colors text-left leading-tight"
        >
          {business.name}
        </Link>
        {badge && (
          <span className="text-[8px] font-semibold px-1 py-0.5 bg-brand-navy/10 text-brand-navy flex-shrink-0">
            {badge}
          </span>
        )}
      </div>

      {business.outreach_contacted_at && (
        <p className="text-[9px] text-blue-500">
          Contacted: {formatDateShortGB(business.outreach_contacted_at + 'T00:00:00')}
        </p>
      )}
      {business.outreach_followed_up_at && (
        <p className="text-[9px] text-purple-500">
          Followed up: {formatDateShortGB(business.outreach_followed_up_at + 'T00:00:00')}
        </p>
      )}

      <button
        onClick={() => onRemove(business.id)}
        className="text-[9px] text-gray-400 hover:text-red-500 transition-colors mt-1"
      >
        Remove
      </button>
    </div>
  )
}

function OutreachList({
  businesses,
  onStageChange,
  onRemove,
}: {
  businesses: OutreachBusiness[]
  onStageChange: (businessId: string, stage: OutreachStage) => void
  onRemove: (businessId: string) => Promise<void>
}) {
  return (
    <div className="border border-gray-200 divide-y divide-gray-100">
      <div className="grid grid-cols-[1fr_80px_100px_100px_110px_60px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        <span>Business</span>
        <span>Type</span>
        <span>Contacted</span>
        <span>Followed up</span>
        <span>Stage</span>
        <span></span>
      </div>
      {businesses.map((b) => {
        const badge = getTypeBadge(b)
        const stage = (b.outreach_stage || 'identified') as OutreachStage
        const stageInfo = STAGES.find(s => s.key === stage) ?? STAGES[0]

        return (
          <div key={b.id} className="grid grid-cols-[1fr_80px_100px_100px_110px_60px] gap-2 items-center px-3 py-2.5 hover:bg-brand-warm/50 transition-colors">
            <Link
              href={`/businesses/${b.id}`}
              className="text-sm text-brand-navy hover:text-brand-olive transition-colors truncate font-medium"
            >
              {b.name}
            </Link>

            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/10 text-brand-navy text-center">
              {badge ?? '—'}
            </span>

            <span className="text-xs text-gray-500">
              {b.outreach_contacted_at ? formatDateShortGB(b.outreach_contacted_at + 'T00:00:00') : '—'}
            </span>

            <span className="text-xs text-gray-500">
              {b.outreach_followed_up_at ? formatDateShortGB(b.outreach_followed_up_at + 'T00:00:00') : '—'}
            </span>

            <select
              value={stage}
              onChange={(e) => onStageChange(b.id, e.target.value as OutreachStage)}
              className={`text-[10px] font-medium px-1.5 py-0.5 border border-gray-200 ${stageInfo.bg} ${stageInfo.color} outline-none cursor-pointer`}
            >
              {STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            <button
              onClick={() => onRemove(b.id)}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors text-center"
            >
              Remove
            </button>
          </div>
        )
      })}
      {businesses.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No outreach prospects yet. Click &quot;+ Add prospect&quot; to get started.
        </div>
      )}
    </div>
  )
}
