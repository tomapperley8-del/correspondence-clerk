'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Business } from '@/app/actions/businesses'
import { addBusinessToOutreach, addBusinessToContractsFromDetail, removeBusinessFromOutreach, updateOutreachStage, updateBusinessRenewalStage } from '@/app/actions/businesses'
import { formatDateShortGB } from '@/lib/utils'
import { toast } from '@/lib/toast'

const OUTREACH_STAGES: { key: string; label: string }[] = [
  { key: 'identified', label: 'Identified' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'followed_up', label: 'Followed up' },
  { key: 'in_discussion', label: 'In discussion' },
  { key: 'won', label: 'Won' },
  { key: 'invoice_paid', label: 'Invoice paid' },
  { key: 'not_interested', label: 'Not interested' },
]

const RENEWAL_STAGES: { key: string; label: string }[] = [
  { key: 'not_started', label: 'To contact' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'in_discussion', label: 'In discussion' },
  { key: 'agreed', label: 'Agreed' },
  { key: 'invoice_paid', label: 'Invoice paid' },
  { key: 'not_renewing', label: 'Not renewing' },
]

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function getOutreachStageDate(business: Business): string | null {
  const map: Record<string, string | null> = {
    identified: business.outreach_identified_at,
    contacted: business.outreach_contacted_at,
    followed_up: business.outreach_followed_up_at,
    in_discussion: business.outreach_in_discussion_at,
    won: business.outreach_won_at,
    invoice_paid: business.outreach_invoice_paid_at,
  }
  return business.outreach_stage ? (map[business.outreach_stage] ?? null) : null
}

function getRenewalStageDate(business: Business): string | null {
  const map: Record<string, string | null> = {
    not_started: business.renewal_not_started_at,
    contacted: business.renewal_contacted_at,
    in_discussion: business.renewal_in_discussion_at,
    agreed: business.renewal_agreed_at,
    invoice_paid: business.renewal_invoice_paid_at,
  }
  return business.renewal_stage ? (map[business.renewal_stage] ?? null) : null
}

export function PipelineStatusCard({ business }: { business: Business }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const inOutreach = !!business.outreach_stage
  const inContracts = business.is_club_card || business.is_advertiser
  const hasNoPipeline = !inOutreach && !inContracts

  const handleAddToOutreach = async () => {
    setLoading(true)
    const result = await addBusinessToOutreach(business.id)
    if (result.error) toast.error(result.error)
    else toast.success('Added to outreach pipeline')
    router.refresh()
    setLoading(false)
    setShowAddMenu(false)
  }

  const handleAddToContracts = async (type: 'club_card' | 'advertiser') => {
    setLoading(true)
    const result = await addBusinessToContractsFromDetail(business.id, type)
    if (result.error) toast.error(result.error)
    else toast.success(`Added to CC/Advertising pipeline as ${type === 'club_card' ? 'Club Card' : 'Advertiser'}`)
    router.refresh()
    setLoading(false)
    setShowAddMenu(false)
  }

  const handleRemoveFromOutreach = async () => {
    setLoading(true)
    const result = await removeBusinessFromOutreach(business.id)
    if (result.error) toast.error(result.error)
    else toast.success('Removed from outreach')
    router.refresh()
    setLoading(false)
  }

  const handleOutreachStageChange = async (stage: string) => {
    setLoading(true)
    const result = await updateOutreachStage(business.id, stage)
    if (result.error) toast.error(result.error)
    router.refresh()
    setLoading(false)
  }

  const handleRenewalStageChange = async (stage: string) => {
    setLoading(true)
    const result = await updateBusinessRenewalStage(business.id, stage)
    if (result.error) toast.error(result.error)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="border border-gray-200 bg-white p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-brand-dark">Pipeline Status</h3>
        {hasNoPipeline && (
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              disabled={loading}
              className="text-xs px-3 py-1 bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors disabled:opacity-50"
            >
              Add to pipeline
            </button>
            {showAddMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-[var(--shadow-md)] z-10">
                <button
                  onClick={handleAddToOutreach}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-warm transition-colors"
                >
                  Outreach pipeline
                </button>
                <button
                  onClick={() => handleAddToContracts('club_card')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-warm transition-colors border-t border-gray-100"
                >
                  CC/Advertising — Club Card
                </button>
                <button
                  onClick={() => handleAddToContracts('advertiser')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-warm transition-colors border-t border-gray-100"
                >
                  CC/Advertising — Advertiser
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {hasNoPipeline && (
        <p className="text-xs text-gray-400">Not in any pipeline</p>
      )}

      {inOutreach && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Outreach</span>
            <select
              value={business.outreach_stage || 'identified'}
              onChange={(e) => handleOutreachStageChange(e.target.value)}
              disabled={loading}
              className="text-xs border border-gray-200 px-2 py-0.5 bg-white outline-none cursor-pointer"
            >
              {OUTREACH_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {(() => {
              const date = getOutreachStageDate(business)
              const days = daysSince(date)
              return (
                <>
                  {date && <span>Since {formatDateShortGB(date + 'T00:00:00')}</span>}
                  {days !== null && <span className={days > 30 ? 'text-amber-600 font-medium' : ''}>{days} days in stage</span>}
                </>
              )
            })()}
          </div>
          <button
            onClick={handleRemoveFromOutreach}
            disabled={loading}
            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            Remove from outreach
          </button>
          {!inContracts && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 mb-1">Also add to:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddToContracts('club_card')}
                  disabled={loading}
                  className="text-[10px] px-2 py-0.5 border border-gray-200 hover:bg-brand-warm transition-colors disabled:opacity-50"
                >
                  CC/Ad — Club Card
                </button>
                <button
                  onClick={() => handleAddToContracts('advertiser')}
                  disabled={loading}
                  className="text-[10px] px-2 py-0.5 border border-gray-200 hover:bg-brand-warm transition-colors disabled:opacity-50"
                >
                  CC/Ad — Advertiser
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {inContracts && (
        <div className={`space-y-2 ${inOutreach ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              CC/Advertising
              {business.is_club_card && business.is_advertiser ? ' (CC + Ad)' : business.is_club_card ? ' (Club Card)' : ' (Advertiser)'}
            </span>
            {business.renewal_stage && (
              <select
                value={business.renewal_stage}
                onChange={(e) => handleRenewalStageChange(e.target.value)}
                disabled={loading}
                className="text-xs border border-gray-200 px-2 py-0.5 bg-white outline-none cursor-pointer"
              >
                {RENEWAL_STAGES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {(() => {
              const date = getRenewalStageDate(business)
              const days = daysSince(date)
              return (
                <>
                  {date && <span>Since {formatDateShortGB(date + 'T00:00:00')}</span>}
                  {days !== null && <span className={days > 30 ? 'text-amber-600 font-medium' : ''}>{days} days in stage</span>}
                </>
              )
            })()}
          </div>
          {!inOutreach && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={handleAddToOutreach}
                disabled={loading}
                className="text-[10px] px-2 py-0.5 border border-gray-200 hover:bg-brand-warm transition-colors disabled:opacity-50"
              >
                Also add to outreach
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
