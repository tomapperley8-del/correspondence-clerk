'use client'

import React from 'react'
import { type Contact } from '@/app/actions/contacts'
import { ExportDropdown } from '@/components/ExportDropdown'

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
  exportProps: { businessId: string; businessName?: string; contactId?: string }
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
  exportProps,
}: CorrespondenceFilterBarProps) {
  return (
    <>
      {/* Feature #4: Correspondence View Controls */}
      <div className="border-t-2 border-gray-300 pt-4 mb-6">
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-4 items-start mb-3">
          {/* Date Range */}
          <div className="sm:order-3">
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Show:
            </label>
            <div className="flex border-2 border-gray-300">
              <button
                type="button"
                onClick={() => setDateRange('1m')}
                className={`px-3 py-1 text-sm font-medium ${
                  dateRange === '1m'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                1 Month
              </button>
              <button
                type="button"
                onClick={() => setDateRange('6m')}
                className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                  dateRange === '6m'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                6 Months
              </button>
              <button
                type="button"
                onClick={() => setDateRange('12m')}
                className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                  dateRange === '12m'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                12 Months
              </button>
              <button
                type="button"
                onClick={() => setDateRange('custom')}
                className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                  dateRange === 'custom'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Custom Date Range Inputs */}
          {dateRange === 'custom' && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  From:
                </label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="px-2 py-1 border-2 border-gray-300 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  To:
                </label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="px-2 py-1 border-2 border-gray-300 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Sort Order */}
          <div className="sm:order-1">
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Sort:
            </label>
            <div className="flex border-2 border-gray-300">
              <button
                type="button"
                onClick={() => setSortOrder('oldest')}
                className={`px-3 py-1 text-sm font-medium ${
                  sortOrder === 'oldest'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Oldest First
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('newest')}
                className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                  sortOrder === 'newest'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Newest First
              </button>
            </div>
          </div>

          {/* Contact Filter */}
          <div className="sm:order-4">
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Contact:
            </label>
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className="px-3 py-1 border-2 border-gray-300 bg-white text-sm focus:border-brand-navy focus:outline-none"
            >
              <option value="all">All Contacts</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </div>

          {/* Direction Filter */}
          <div className="sm:order-2">
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Direction:
            </label>
            <div className="flex border-2 border-gray-300">
              <button
                type="button"
                onClick={() => setDirectionFilter('all')}
                className={`px-3 py-1 text-sm font-medium ${
                  directionFilter === 'all'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter('received')}
                className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                  directionFilter === 'received'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Received
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter('sent')}
                className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                  directionFilter === 'sent'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Sent
              </button>
            </div>
          </div>
        </div>

        {/* Entry Count and Reset */}
        <div className="flex justify-between items-center text-sm">
          <p className="text-gray-600">
            Showing {totalFilteredCount} of {totalLoadedCount} entries
          </p>
          {(sortOrder !== 'oldest' || contactFilter !== 'all' || directionFilter !== 'all' || dateRange !== '12m') && (
            <button
              type="button"
              onClick={() => {
                setSortOrder('oldest')
                setContactFilter('all')
                setDirectionFilter('all')
                setDateRange('12m')
                setCustomDateFrom('')
                setCustomDateTo('')
              }}
              className="text-brand-navy hover:text-brand-dark hover:underline"
            >
              Reset to default view
            </button>
          )}
        </div>
      </div>

      {/* View mode toggle */}
      {threadsCount > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex border-2 border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-4 py-1.5 text-sm font-semibold ${viewMode === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setViewMode('threads')}
              className={`px-4 py-1.5 text-sm font-semibold border-l-2 border-gray-300 ${viewMode === 'threads' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Threads ({threadsCount})
            </button>
          </div>
        </div>
      )}
    </>
  )
})
