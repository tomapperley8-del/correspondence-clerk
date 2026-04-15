'use client'

import React, { useState, useRef, useEffect } from 'react'
import { type Contact } from '@/app/actions/contacts'

interface CorrespondenceFilterBarProps {
  sortOrder: 'oldest' | 'newest'
  setSortOrder: (v: 'oldest' | 'newest') => void
  contactFilter: string
  setContactFilter: (v: string) => void
  directionFilter: 'all' | 'received' | 'sent'
  setDirectionFilter: (v: 'all' | 'received' | 'sent') => void
  dateRange: '1m' | '6m' | '12m' | 'custom'
  setDateRange: (v: '1m' | '6m' | '12m' | 'custom') => void
  customDateFrom: string
  setCustomDateFrom: (v: string) => void
  customDateTo: string
  setCustomDateTo: (v: string) => void
  contacts: Contact[]
  totalFilteredCount: number
  totalLoadedCount: number
  viewMode: 'all' | 'threads'
  setViewMode: (v: 'all' | 'threads') => void
  threadsCount: number
}


export const CorrespondenceFilterBar = React.memo(function CorrespondenceFilterBar({
  sortOrder,
  setSortOrder,
  contactFilter,
  setContactFilter,
  directionFilter,
  setDirectionFilter,
  dateRange,
  setDateRange,
  customDateFrom,
  setCustomDateFrom,
  customDateTo,
  setCustomDateTo,
  contacts,
  totalFilteredCount,
  totalLoadedCount,
  viewMode,
  setViewMode,
  threadsCount,
}: CorrespondenceFilterBarProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [filterOpen])

  const isFiltered = sortOrder !== 'oldest' || contactFilter !== 'all' || directionFilter !== 'all' || dateRange !== '12m'

  const activeLabel = [
    sortOrder === 'oldest' ? 'Oldest' : 'Newest',
    directionFilter !== 'all' ? (directionFilter === 'received' ? 'Received' : 'Sent') : null,
    dateRange === '1m' ? '1 Month' : dateRange === '6m' ? '6 Months' : dateRange === 'custom' ? 'Custom' : null,
    contactFilter !== 'all' ? (contacts.find(c => c.id === contactFilter)?.name ?? null) : null,
  ].filter(Boolean).join(' · ') || 'Oldest · 12 Months'

  function resetFilters() {
    setSortOrder('oldest')
    setContactFilter('all')
    setDirectionFilter('all')
    setDateRange('12m')
    setCustomDateFrom('')
    setCustomDateTo('')
  }

  function ToggleGroup({ children }: { children: React.ReactNode }) {
    return <div className="flex border border-gray-300">{children}</div>
  }

  function ToggleBtn({
    active, onClick, children,
  }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-3 py-1 text-xs font-medium border-l first:border-l-0 border-gray-300 transition-colors ${
          active ? 'bg-brand-navy text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {children}
      </button>
    )
  }

  return (
    <>
      <div className="border-t-2 border-gray-300 pt-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          {/* Filter & Sort trigger */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(o => !o)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm border-2 transition-colors ${
                filterOpen
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : isFiltered
                  ? 'border-brand-navy/40 bg-brand-navy/5 text-brand-navy'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <span className="font-medium">Filter &amp; Sort</span>
              <span className={`text-[11px] hidden sm:inline ${filterOpen ? 'text-white/75' : 'text-gray-400'}`}>{activeLabel}</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform shrink-0 ${filterOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {filterOpen && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 shadow-lg p-4 min-w-[300px] sm:min-w-[360px]">
                <div className="space-y-3">
                  {/* Sort */}
                  <div role="group" aria-label="Sort order">
                    <span className="text-xs font-semibold text-gray-600 block mb-1.5">Sort</span>
                    <ToggleGroup>
                      <ToggleBtn active={sortOrder === 'oldest'} onClick={() => setSortOrder('oldest')}>Oldest first</ToggleBtn>
                      <ToggleBtn active={sortOrder === 'newest'} onClick={() => setSortOrder('newest')}>Newest first</ToggleBtn>
                    </ToggleGroup>
                  </div>

                  {/* Direction */}
                  <div role="group" aria-label="Direction filter">
                    <span className="text-xs font-semibold text-gray-600 block mb-1.5">Direction</span>
                    <ToggleGroup>
                      <ToggleBtn active={directionFilter === 'all'} onClick={() => setDirectionFilter('all')}>All</ToggleBtn>
                      <ToggleBtn active={directionFilter === 'received'} onClick={() => setDirectionFilter('received')}>Received</ToggleBtn>
                      <ToggleBtn active={directionFilter === 'sent'} onClick={() => setDirectionFilter('sent')}>Sent</ToggleBtn>
                    </ToggleGroup>
                  </div>

                  {/* Date Range */}
                  <div role="group" aria-label="Date range">
                    <span className="text-xs font-semibold text-gray-600 block mb-1.5">Show</span>
                    <ToggleGroup>
                      <ToggleBtn active={dateRange === '1m'} onClick={() => setDateRange('1m')}>1 Month</ToggleBtn>
                      <ToggleBtn active={dateRange === '6m'} onClick={() => setDateRange('6m')}>6 Months</ToggleBtn>
                      <ToggleBtn active={dateRange === '12m'} onClick={() => setDateRange('12m')}>12 Months</ToggleBtn>
                      <ToggleBtn active={dateRange === 'custom'} onClick={() => setDateRange('custom')}>Custom</ToggleBtn>
                    </ToggleGroup>
                  </div>

                  {/* Custom dates */}
                  {dateRange === 'custom' && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label htmlFor="filter-date-from" className="text-xs font-semibold text-gray-600 block mb-1">From</label>
                        <input
                          id="filter-date-from"
                          type="date"
                          value={customDateFrom}
                          onChange={e => setCustomDateFrom(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 text-xs focus:border-brand-navy focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor="filter-date-to" className="text-xs font-semibold text-gray-600 block mb-1">To</label>
                        <input
                          id="filter-date-to"
                          type="date"
                          value={customDateTo}
                          onChange={e => setCustomDateTo(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 text-xs focus:border-brand-navy focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Contact */}
                  {contacts.length > 0 && (
                    <div>
                      <label htmlFor="filter-contact" className="text-xs font-semibold text-gray-600 block mb-1.5">Contact</label>
                      <select
                        id="filter-contact"
                        value={contactFilter}
                        onChange={e => setContactFilter(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 bg-white text-xs focus:border-brand-navy focus:outline-none"
                      >
                        <option value="all">All contacts</option>
                        {contacts.map(contact => (
                          <option key={contact.id} value={contact.id}>{contact.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Reset */}
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => { resetFilters(); setFilterOpen(false) }}
                      className="w-full text-xs text-gray-400 hover:text-brand-navy transition-colors pt-1 border-t border-gray-100 text-left"
                    >
                      Reset to defaults
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Entry count */}
          <p className="text-sm text-gray-500">
            {totalFilteredCount} of {totalLoadedCount} entries
          </p>
        </div>

        {/* View mode toggle */}
        {threadsCount > 0 && (
          <div className="flex items-center gap-2 mb-4" role="group" aria-label="View mode">
            <div className="flex border-2 border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                aria-pressed={viewMode === 'all'}
                className={`px-4 py-1.5 text-sm font-semibold ${viewMode === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setViewMode('threads')}
                aria-pressed={viewMode === 'threads'}
                className={`px-4 py-1.5 text-sm font-semibold border-l-2 border-gray-300 ${viewMode === 'threads' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Threads ({threadsCount})
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
})
