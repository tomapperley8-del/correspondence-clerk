'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ProspectLead, ProspectLeadStatus, ProspectMatchType } from '@/app/actions/leads'
import { updateProspectLeadStatus } from '@/app/actions/leads'
import { PROSPECT_COLUMNS, MATCH_TYPE_META, sourceBadgeClass, timeAgo } from '@/lib/lead-meta'
import { toast } from '@/lib/toast'

const DATE_FILTERS = [
  { value: 0, label: 'All time' },
  { value: 1, label: 'Today' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
]

export function ProspectBoard({ initialLeads }: { initialLeads: ProspectLead[] }) {
  const [leads, setLeads] = useState<ProspectLead[]>(initialLeads)
  const [sourceFilter, setSourceFilter] = useState('')
  const [matchFilter, setMatchFilter] = useState('')
  const [daysFilter, setDaysFilter] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ProspectLeadStatus | null>(null)

  const sources = useMemo(() => [...new Set(leads.map(l => l.source_name))].sort(), [leads])

  const filtered = useMemo(() => {
    let list = leads
    if (sourceFilter) list = list.filter(l => l.source_name === sourceFilter)
    if (matchFilter) list = list.filter(l => l.match_type === matchFilter)
    if (daysFilter > 0) {
      const cutoff = Date.now() - daysFilter * 24 * 60 * 60 * 1000
      list = list.filter(l => new Date(l.found_at).getTime() >= cutoff)
    }
    return list
  }, [leads, sourceFilter, matchFilter, daysFilter])

  async function moveTo(id: string, status: ProspectLeadStatus) {
    const lead = leads.find(l => l.id === id)
    if (!lead || lead.status === status) return
    const previous = lead.status
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, status } : l)))
    const result = await updateProspectLeadStatus(id, status)
    if (result.error) {
      setLeads(prev => prev.map(l => (l.id === id ? { ...l, status: previous } : l)))
      toast.error(result.error)
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={matchFilter}
          onChange={e => setMatchFilter(e.target.value)}
          className="border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none"
          aria-label="Filter by match type"
        >
          <option value="">All match types</option>
          {(Object.keys(MATCH_TYPE_META) as ProspectMatchType[]).map(mt => (
            <option key={mt} value={mt}>{MATCH_TYPE_META[mt].label}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none"
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={daysFilter}
          onChange={e => setDaysFilter(Number(e.target.value))}
          className="border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none"
          aria-label="Filter by date range"
        >
          {DATE_FILTERS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {PROSPECT_COLUMNS.map(col => {
          const items = filtered.filter(l => l.status === col.value)
          const isNew = col.value === 'new'
          return (
            <div
              key={col.value}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.value) }}
              onDragLeave={() => setDragOverCol(prev => (prev === col.value ? null : prev))}
              onDrop={e => {
                e.preventDefault()
                setDragOverCol(null)
                const id = e.dataTransfer.getData('text/plain')
                if (id) moveTo(id, col.value)
              }}
              className={`flex-shrink-0 w-64 sm:w-72 border transition-colors ${
                dragOverCol === col.value
                  ? 'border-brand-olive bg-brand-olive/5'
                  : isNew
                    ? 'border-brand-olive/60 bg-brand-olive/[0.04]'
                    : 'border-gray-200 bg-brand-warm/60'
              }`}
            >
              <div className={`flex items-center justify-between px-3 py-2 border-b ${
                isNew ? 'border-brand-olive/40 bg-brand-olive/10' : 'border-gray-200'
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wide ${isNew ? 'text-brand-dark' : 'text-gray-500'}`}>
                  {col.label}
                </span>
                <span className={`min-w-[20px] h-[20px] px-1 text-[11px] font-bold flex items-center justify-center ${
                  isNew && items.length > 0 ? 'bg-brand-olive text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}>
                  {items.length}
                </span>
              </div>
              <div className="p-2 space-y-2 min-h-[60px] max-h-[420px] overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-4">
                    {isNew ? 'Nothing new today' : 'Empty'}
                  </p>
                ) : (
                  items.map(lead => {
                    const expanded = expandedId === lead.id
                    const matchMeta = MATCH_TYPE_META[lead.match_type]
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => e.dataTransfer.setData('text/plain', lead.id)}
                        className="bg-white border border-gray-200 p-2.5 cursor-grab active:cursor-grabbing shadow-[var(--shadow-sm)]"
                      >
                        <button
                          onClick={() => setExpandedId(expanded ? null : lead.id)}
                          className="text-left w-full"
                          aria-expanded={expanded}
                        >
                          <p className="text-xs font-semibold text-gray-800 leading-snug">{lead.business_name}</p>
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 ${matchMeta.badge}`}>
                            {matchMeta.label}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 ${sourceBadgeClass(lead.source_name)}`}>
                            {lead.source_name}
                          </span>
                          {lead.business_category && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600">
                              {lead.business_category}
                            </span>
                          )}
                        </div>
                        {lead.matched_business && (
                          <Link
                            href={`/businesses/${lead.matched_business.id}`}
                            className="inline-block mt-1.5 text-[11px] font-medium text-brand-navy hover:text-brand-olive transition-colors"
                          >
                            View in CC: {lead.matched_business.name} →
                          </Link>
                        )}
                        {!expanded && lead.opportunity_notes && (
                          <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">{lead.opportunity_notes}</p>
                        )}
                        {expanded && (
                          <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                            {lead.snippet && <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{lead.snippet}</p>}
                            {lead.opportunity_notes && (
                              <p className="text-[11px] text-gray-500">
                                <span className="font-semibold text-gray-600">Opportunity: </span>
                                {lead.opportunity_notes}
                              </p>
                            )}
                            {lead.address && <p className="text-[11px] text-gray-500">{lead.address}</p>}
                            {lead.source_url && (
                              <a
                                href={lead.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-[11px] font-medium text-brand-navy hover:text-brand-olive transition-colors"
                              >
                                Open source →
                              </a>
                            )}
                            <p className="text-[10px] text-gray-400">Found {timeAgo(lead.found_at)}</p>
                          </div>
                        )}
                        <div className="mt-2">
                          <select
                            value={lead.status}
                            onChange={e => moveTo(lead.id, e.target.value as ProspectLeadStatus)}
                            className="w-full border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 focus:outline-none"
                            aria-label={`Status for ${lead.business_name}`}
                          >
                            {PROSPECT_COLUMNS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
