'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useInsights } from '@/components/InsightsContext'
import { MarkdownLite } from '@/components/MarkdownLite'
import { getInsightCacheStatus, getUserPresets, getInsightHistory, type CacheStatus, type UserAIPreset, type InsightHistoryEntry } from '@/app/actions/insights'
import { createCorrespondence } from '@/app/actions/correspondence'
import { INSIGHT_METADATA, type InsightType } from '@/lib/ai/insight-prompts'
import { toast } from '@/lib/toast'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_WIDE_TYPES: InsightType[] = [
  'briefing', 'relationship_radar', 'pipeline_pulse', 'state_of_play',
  'reconnect_list', 'buried_gold', 'prospecting_targets', 'data_health_org',
]

const BUSINESS_TYPES: InsightType[] = [
  'call_prep', 'relationship_story', 'outreach_draft', 'what_did_we_agree',
  'next_best_action', 'risk_check', 'full_picture', 'data_health_biz',
]

// Insight types where "Add to Actions" makes sense
const ADD_TO_ACTIONS_TYPES = new Set(['call_prep', 'next_best_action', 'what_did_we_agree', 'outreach_draft', 'risk_check'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardState = {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  content: string | null
  generatedAt: string | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(generatedAt: string | null): string {
  if (!generatedAt) return 'Not yet generated'
  const mins = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 60000)
  if (mins < 1) return 'Generated just now'
  if (mins < 60) return `Generated ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Generated ${hrs}h ago`
  return `Generated ${Math.floor(hrs / 24)}d ago`
}

function formatHistoryDate(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Insight action buttons (per insight type)
// ---------------------------------------------------------------------------

type InsightAction = { label: string; onClick: () => void }

function getInsightActions(
  insightType: string,
  businessId: string | null,
  router: ReturnType<typeof useRouter>,
  content: string | null,
): InsightAction[] {
  switch (insightType) {
    case 'call_prep':
      if (!businessId) return []
      return [{ label: 'Log this call', onClick: () => router.push(`/new-entry?businessId=${businessId}&type=Call`) }]
    case 'what_did_we_agree':
      if (!businessId) return []
      return [{ label: 'View actions', onClick: () => router.push(`/businesses/${businessId}?tab=actions`) }]
    case 'briefing':
      return [{ label: 'View Actions', onClick: () => router.push('/actions') }]
    case 'reconnect_list':
      return [{ label: 'View Reconnect List', onClick: () => router.push('/actions') }]
    case 'outreach_draft':
      if (!content) return []
      return [{
        label: 'Copy to clipboard',
        onClick: () => {
          navigator.clipboard.writeText(content)
            .then(() => toast.success('Copied to clipboard'))
            .catch(() => toast.error('Failed to copy'))
        },
      }]
    case 'relationship_radar':
      return [{ label: 'View Actions', onClick: () => router.push('/actions') }]
    case 'next_best_action':
      if (!businessId) return []
      return [{ label: 'Log this action', onClick: () => router.push(`/new-entry?businessId=${businessId}&type=Note`) }]
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// InsightCard
// ---------------------------------------------------------------------------

function InsightCard({
  insightType,
  businessId,
  cacheStatus,
  cardState,
  onGenerate,
  onExpand,
  isExpanded,
}: {
  insightType: string
  businessId: string | null
  cacheStatus: CacheStatus | null
  cardState: CardState
  onGenerate: (type: string, force?: boolean) => void
  onExpand: (type: string | null) => void
  isExpanded: boolean
}) {
  const router = useRouter()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<InsightHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [viewingEntry, setViewingEntry] = useState<InsightHistoryEntry | null>(null)

  const dispatchType = insightType.startsWith('custom_') ? 'custom' : insightType as InsightType
  const meta = INSIGHT_METADATA[dispatchType]
  const label = meta?.label ?? 'Custom'
  const description = meta?.description ?? ''

  const isLoading = cardState.status === 'loading'
  const hasContent = cardState.status === 'loaded' && cardState.content
  const ageText = cardState.generatedAt
    ? formatAge(cardState.generatedAt)
    : cacheStatus?.generatedAt
    ? formatAge(cacheStatus.generatedAt)
    : 'Not yet generated'

  const isExpired = cacheStatus?.isExpired !== false

  // Staleness dot: green = generated today, amber = 2-7 days, grey = 7+ days, none = never generated
  const stalenessMinutes = cardState.generatedAt
    ? Math.floor((Date.now() - new Date(cardState.generatedAt).getTime()) / 60000)
    : cacheStatus?.ageMinutes ?? null
  const stalenessDot = stalenessMinutes === null
    ? null
    : stalenessMinutes < 60 * 24
    ? 'bg-green-400'
    : stalenessMinutes < 60 * 24 * 7
    ? 'bg-amber-400'
    : 'bg-gray-300'

  // Content snippet: prefer live cardState content, fall back to cached snippet
  const contentSnippet = (cardState.status === 'loaded' && cardState.content)
    ? cardState.content.replace(/[#*_`]/g, '').replace(/\n+/g, ' ').trim().slice(0, 120)
    : cacheStatus?.contentSnippet ?? null

  // Reset history state when card collapses
  useEffect(() => {
    if (!isExpanded) {
      setHistoryOpen(false)
      setViewingEntry(null)
    }
  }, [isExpanded])

  const loadHistory = useCallback(async () => {
    if (history.length > 0) {
      setHistoryOpen(!historyOpen)
      return
    }
    setHistoryLoading(true)
    const result = await getInsightHistory(insightType, businessId, 10)
    if (result.data) {
      // Exclude the current version (first entry will match current content)
      const filtered = result.data.filter(
        (e) => e.generated_at !== cardState.generatedAt
      )
      setHistory(filtered)
    }
    setHistoryLoading(false)
    setHistoryOpen(true)
  }, [insightType, businessId, history.length, historyOpen, cardState.generatedAt])

  if (isExpanded && hasContent) {
    return (
      <div className="border rounded-sm p-4 bg-white col-span-2" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
        <div className="flex items-start justify-between mb-3 gap-2">
          <div>
            <h4 className="font-semibold text-sm text-brand-dark">{label}</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              {viewingEntry ? formatAge(viewingEntry.generated_at) : ageText}
              {viewingEntry && (
                <button
                  onClick={() => setViewingEntry(null)}
                  className="ml-2 text-brand-navy hover:text-brand-dark transition-colors"
                >
                  Back to current
                </button>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="text-xs text-gray-400 hover:text-brand-navy transition-colors disabled:opacity-40"
            >
              {historyLoading ? 'Loading…' : 'View history'}
            </button>
            <button
              onClick={() => onGenerate(insightType, true)}
              disabled={isLoading}
              className="text-xs text-gray-400 hover:text-brand-navy transition-colors disabled:opacity-40"
            >
              Refresh
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onExpand(null)}
              className="text-xs h-6 px-2 text-gray-500 hover:text-gray-800"
            >
              Close
            </Button>
          </div>
        </div>

        {/* History timeline */}
        {historyOpen && (
          <div className="mb-3 pb-3 border-b border-gray-100">
            {history.length === 0 ? (
              <p className="text-xs text-gray-400">No previous versions yet.</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 mb-1.5">
                  {history.length} previous version{history.length !== 1 ? 's' : ''}
                </p>
                {history.map((entry) => {
                  const isViewing = viewingEntry?.id === entry.id
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setViewingEntry(isViewing ? null : entry)}
                      className={`block w-full text-left text-xs px-2 py-1.5 rounded-sm transition-colors ${
                        isViewing
                          ? 'bg-brand-navy text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {formatHistoryDate(entry.generated_at)}
                      <span className="text-gray-400 ml-1">
                        — {entry.content.slice(0, 60).replace(/\n/g, ' ')}…
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="text-sm text-gray-700 leading-relaxed">
          <MarkdownLite text={viewingEntry ? viewingEntry.content : cardState.content!} />
        </div>
        {!viewingEntry && (() => {
          const actions = getInsightActions(insightType, businessId, router, cardState.content)
          const showAddToActions = businessId && ADD_TO_ACTIONS_TYPES.has(insightType) && cardState.content
          if (actions.length === 0 && !showAddToActions) return null
          return (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
              {actions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="text-xs font-medium px-3 py-1.5 rounded-sm bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors"
                >
                  {action.label}
                </button>
              ))}
              {showAddToActions && (
                <button
                  onClick={async () => {
                    const meta = INSIGHT_METADATA[insightType.startsWith('custom_') ? 'custom' : insightType as InsightType]
                    const subject = `[Insight] ${meta?.label ?? insightType}`
                    const snippet = cardState.content!.slice(0, 200)
                    const result = await createCorrespondence({
                      business_id: businessId!,
                      raw_text_original: snippet,
                      subject,
                      type: 'Note',
                      action_needed: 'follow_up',
                    })
                    if ('error' in result && result.error) toast.error('Failed to add to Actions')
                    else toast.success('Added to Actions')
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-sm border border-brand-navy text-brand-navy hover:bg-brand-navy/5 transition-colors"
                >
                  Add to Actions
                </button>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div
      className="border rounded-sm p-3 bg-white flex flex-col gap-2 cursor-pointer hover:border-brand-navy transition-colors"
      style={{ border: '1px solid rgba(0,0,0,0.08)' }}
      onClick={() => hasContent && !isLoading && onExpand(insightType)}
    >
      <div className="flex items-start justify-between gap-1">
        <h4 className="font-semibold text-sm text-brand-dark leading-tight">{label}</h4>
        {stalenessDot && (
          <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${stalenessDot}`} title={ageText} />
        )}
      </div>
      {contentSnippet ? (
        <p className="text-xs text-gray-500 leading-snug line-clamp-2">{contentSnippet}</p>
      ) : (
        <p className="text-xs text-gray-400 leading-snug">{description}</p>
      )}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className={`text-xs ${isExpired ? 'text-gray-400' : 'text-brand-olive'}`}>
          {isLoading ? 'Generating…' : ageText}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onGenerate(insightType)
          }}
          disabled={isLoading}
          className="text-xs font-semibold text-brand-navy hover:text-brand-dark transition-colors disabled:opacity-40 shrink-0"
        >
          {isLoading ? '…' : hasContent ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      {cardState.error && (
        <p className="text-xs text-red-600">{cardState.error}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InsightsPanel
// ---------------------------------------------------------------------------

interface InsightsPanelProps {
  inline?: boolean
}

export function InsightsPanel({ inline = false }: InsightsPanelProps = {}) {
  const { isOpen, close, businessId, businessName } = useInsights()
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})
  const [cacheStatus, setCacheStatus] = useState<Record<string, CacheStatus>>({})
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [presets, setPresets] = useState<UserAIPreset[]>([])

  // Load cache status + presets on open
  const loadCacheStatus = useCallback(async () => {
    const allTypes = [
      ...ORG_WIDE_TYPES,
      ...(businessId ? BUSINESS_TYPES : []),
    ]
    const [status, presetsResult] = await Promise.all([
      getInsightCacheStatus(allTypes, businessId),
      getUserPresets(),
    ])
    setCacheStatus(status)
    if (presetsResult.data) setPresets(presetsResult.data)
  }, [businessId])

  useEffect(() => {
    if (inline || isOpen) {
      loadCacheStatus()
    }
  }, [isOpen, inline, loadCacheStatus])

  // Close on Escape (slide-out mode)
  useEffect(() => {
    if (inline) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close, inline])

  const handleGenerate = useCallback(async (type: string, force = false) => {
    setCardStates((prev) => ({
      ...prev,
      [type]: { status: 'loading', content: prev[type]?.content ?? null, generatedAt: prev[type]?.generatedAt ?? null, error: null },
    }))
    setExpandedCard(null)

    try {
      const body: Record<string, unknown> = { type, force }
      if (businessId) body.businessId = businessId

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }))
        setCardStates((prev) => ({
          ...prev,
          [type]: { status: 'error', content: null, generatedAt: null, error: err.error ?? 'Generation failed' },
        }))
        return
      }

      const data = await res.json()
      setCardStates((prev) => ({
        ...prev,
        [type]: { status: 'loaded', content: data.content, generatedAt: data.generatedAt, error: null },
      }))
      setExpandedCard(type)

      // Update cache status entry
      setCacheStatus((prev) => ({
        ...prev,
        [type]: { generatedAt: data.generatedAt, ageMinutes: 0, isExpired: false, contentSnippet: null },
      }))
    } catch {
      setCardStates((prev) => ({
        ...prev,
        [type]: { status: 'error', content: null, generatedAt: null, error: 'Something went wrong — please try again.' },
      }))
    }
  }, [businessId])

  const getCardState = (type: string): CardState =>
    cardStates[type] ?? { status: 'idle', content: null, generatedAt: null, error: null }

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-brand-paper shrink-0">
        <h2 className="font-[Lora,serif] text-lg font-semibold text-brand-dark">
          Insights
        </h2>
        {!inline && (
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            className="text-gray-500 hover:text-gray-800"
          >
            Close
          </Button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

        {/* Org-Wide section */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Org-Wide
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {ORG_WIDE_TYPES.map((type) => (
              <InsightCard
                key={type}
                insightType={type}
                businessId={null}
                cacheStatus={cacheStatus[type] ?? null}
                cardState={getCardState(type)}
                onGenerate={handleGenerate}
                onExpand={setExpandedCard}
                isExpanded={expandedCard === type}
              />
            ))}
          </div>
        </section>

        {/* Business-Specific section */}
        {businessId && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              For {businessName ?? 'This Business'}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_TYPES.map((type) => (
                <InsightCard
                  key={type}
                  insightType={type}
                  businessId={businessId}
                  cacheStatus={cacheStatus[type] ?? null}
                  cardState={getCardState(type)}
                  onGenerate={handleGenerate}
                  onExpand={setExpandedCard}
                  isExpanded={expandedCard === type}
                />
              ))}
            </div>
          </section>
        )}

        {/* Custom Presets */}
        {presets.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Your Presets
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => {
                const typeKey = `custom_${preset.id}`
                return (
                  <InsightCard
                    key={typeKey}
                    insightType={typeKey}
                    businessId={preset.scope === 'business' ? businessId : null}
                    cacheStatus={cacheStatus[typeKey] ?? null}
                    cardState={getCardState(typeKey)}
                    onGenerate={handleGenerate}
                    onExpand={setExpandedCard}
                    isExpanded={expandedCard === typeKey}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Incomplete profile nudge */}
        <div className="text-xs text-gray-400 text-center pb-2">
          <a href="/settings/organization" className="hover:text-brand-navy transition-colors underline underline-offset-2">
            Complete your AI Context in Settings
          </a>{' '}
          for richer Insights.
        </div>
      </div>
    </div>
  )

  if (inline) {
    return (
      <div className="h-full bg-brand-paper border-l border-gray-200">
        {panelContent}
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Slide-out panel */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-brand-paper z-50 flex flex-col shadow-lg transition-transform duration-200 ease-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
        aria-label="Insights panel"
      >
        {panelContent}
      </div>
    </>
  )
}
