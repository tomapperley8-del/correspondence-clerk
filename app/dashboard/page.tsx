'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getBusinesses, type BusinessListItem } from '@/app/actions/businesses'
import { getActiveMembershipTypes, type MembershipType } from '@/app/actions/membership-types'
import { AddBusinessButton } from '@/components/AddBusinessButton'
import { Input } from '@/components/ui/input'
import { formatDateGB } from '@/lib/utils'
import { ChatPanel } from '@/components/ChatPanel'

type FilterType = 'all' | 'prospect' | string
type SortType = 'recent' | 'oldest' | 'name-asc' | 'name-desc'

export default function DashboardPage() {
  const [businesses, setBusinesses] = useState<BusinessListItem[]>([])
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortType>('recent')

  // View mode: grid or list
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 12 // 4 rows of 3 cards

  // Check if bookmarklet is installed
  const [bookmarkletInstalled, setBookmarkletInstalled] = useState(false)

  useEffect(() => {
    async function loadData() {
      const [businessesResult, typesResult] = await Promise.all([
        getBusinesses(),
        getActiveMembershipTypes(),
      ])
      if ('error' in businessesResult) {
        setError(businessesResult.error || 'An error occurred')
      } else {
        setBusinesses(businessesResult.data || [])
      }
      setMembershipTypes('error' in typesResult ? [] : typesResult.data || [])
      setLoading(false)
    }
    loadData()
  }, [])

  // Reset to page 1 when filters/search change and would result in empty page
  useEffect(() => {
    const filtered = businesses.filter((business) => {
      if (searchQuery && !business.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      if (filterType === 'prospect' && business.membership_type) return false
      if (filterType !== 'all' && filterType !== 'prospect' && business.membership_type !== filterType) return false
      if (selectedCategory !== 'all' && business.category !== selectedCategory) return false
      return true
    })

    const totalPages = Math.ceil(filtered.length / itemsPerPage)
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [searchQuery, filterType, selectedCategory, businesses, currentPage, itemsPerPage])

  useEffect(() => {
    const installed = localStorage.getItem('bookmarklet-installed')
    setBookmarkletInstalled(!!installed)

    // Restore dashboard preferences from localStorage
    try {
      const savedPrefs = localStorage.getItem('dashboard_prefs')
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs)
        if (prefs.filterType) setFilterType(prefs.filterType)
        if (prefs.selectedCategory) setSelectedCategory(prefs.selectedCategory)
        if (prefs.sortBy) setSortBy(prefs.sortBy)
        if (prefs.viewMode) setViewMode(prefs.viewMode)
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [])

  // Persist filter preferences to localStorage
  useEffect(() => {
    const prefs = { filterType, selectedCategory, sortBy, viewMode }
    localStorage.setItem('dashboard_prefs', JSON.stringify(prefs))
  }, [filterType, selectedCategory, sortBy, viewMode])

  // Get unique categories (memoized) - must be before early returns to respect hooks rules
  const categories = useMemo(() =>
    Array.from(
      new Set(businesses.map((b) => b.category).filter((c): c is string => Boolean(c)))
    ).sort(),
    [businesses]
  )

  // Filter and sort businesses (memoized to prevent recalculation on unrelated state changes)
  // Must be before early returns to respect hooks rules
  const filtered = useMemo(() => {
    // Filter businesses
    let result = businesses.filter((business) => {
      // Search filter
      if (searchQuery && !business.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Type filter
      if (filterType === 'prospect' && business.membership_type) return false
      if (filterType !== 'all' && filterType !== 'prospect' && business.membership_type !== filterType) return false

      // Category filter
      if (selectedCategory !== 'all' && business.category !== selectedCategory) return false

      return true
    })

    // Sort businesses
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          // Most recently contacted first
          if (!a.last_contacted_at && !b.last_contacted_at) return 0
          if (!a.last_contacted_at) return 1
          if (!b.last_contacted_at) return -1
          return new Date(b.last_contacted_at).getTime() - new Date(a.last_contacted_at).getTime()

        case 'oldest':
          // Least recently contacted first
          if (!a.last_contacted_at && !b.last_contacted_at) return 0
          if (!a.last_contacted_at) return 1
          if (!b.last_contacted_at) return -1
          return new Date(a.last_contacted_at).getTime() - new Date(b.last_contacted_at).getTime()

        case 'name-asc':
          return a.name.localeCompare(b.name)

        case 'name-desc':
          return b.name.localeCompare(a.name)

        default:
          return 0
      }
    })
  }, [businesses, searchQuery, filterType, selectedCategory, sortBy])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3">
          <p className="text-red-800">Error loading businesses: {error}</p>
        </div>
      </div>
    )
  }

  // Pagination calculations
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBusinesses = filtered.slice(startIndex, endIndex)

  const shouldAutoSend = businesses.some(b => b.last_contacted_at !== null)

  const FilterButton = ({
    active,
    onClick,
    children,
  }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
  }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm border-2 transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
      }`}
    >
      {children}
    </button>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-6 items-start">
      {/* Left: business list */}
      <div className="flex-1 min-w-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <AddBusinessButton />
      </div>

      {/* Bookmarklet Installation Card */}
      {!bookmarkletInstalled && (
        <div className="bg-blue-50 border-2 border-blue-600 p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                📧 Import Emails
              </h2>
              <p className="text-gray-700 mb-4">
                Install the Email Import Tool to import emails from Outlook or Gmail with one click.
              </p>
              <Link
                href="/bookmarklet"
                className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 border-2 border-blue-600"
              >
                Install Email Import Tool
              </Link>
            </div>
            <button
              onClick={() => {
                setBookmarkletInstalled(true)
                localStorage.setItem('bookmarklet-installed', 'true')
              }}
              className="text-gray-500 hover:text-gray-700"
              title="Dismiss this message"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded p-10 max-w-lg mx-auto mt-8 shadow-[var(--shadow-md,0_2px_8px_rgba(0,0,0,0.08))]">
          <h1 className="font-[Lora,serif] text-2xl font-semibold text-[#1E293B] mb-2">
            Welcome to Correspondence Clerk
          </h1>
          <p className="text-gray-500 text-sm mb-8">Get set up in three steps.</p>
          <ol className="space-y-5 mb-8">
            {[
              'Add your first business and contact',
              'Import an email (bookmarklet) or paste one in',
              'Ask "what do I need to do today" in the Daily Briefing',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#2C4A6E] text-white text-sm font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-gray-700 text-sm leading-relaxed pt-1">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3">
            <Link
              href="/new-entry"
              className="inline-block text-center px-5 py-2.5 bg-[#2C4A6E] text-white text-sm font-medium hover:bg-[#1E293B] transition-colors"
            >
              Add your first business
            </Link>
            <Link
              href="/install-bookmarklet"
              className="text-sm text-[#2C4A6E] hover:underline text-center"
            >
              Install the email import tool
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Search and Filters */}
          <div className="bg-white border-2 border-gray-300 p-4 mb-6">
            {/* Search Bar */}
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Search businesses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:border-blue-600"
              />
            </div>

            {/* Filter Type */}
            <div className="mb-4">
              <label className="text-sm font-semibold text-gray-900 block mb-2">
                Filter by Type:
              </label>
              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={filterType === 'all'}
                  onClick={() => setFilterType('all')}
                >
                  All Businesses
                </FilterButton>
                {membershipTypes.map((t) => (
                  <FilterButton
                    key={t.value}
                    active={filterType === t.value}
                    onClick={() => setFilterType(t.value)}
                  >
                    {t.label}
                  </FilterButton>
                ))}
                <FilterButton
                  active={filterType === 'prospect'}
                  onClick={() => setFilterType('prospect')}
                >
                  Prospects Only
                </FilterButton>
              </div>
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <div className="mb-4">
                <label className="text-sm font-semibold text-gray-900 block mb-2">
                  Filter by Category:
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border-2 border-gray-300 bg-white focus:border-blue-600 focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort By */}
            <div>
              <label className="text-sm font-semibold text-gray-900 block mb-2">
                Sort by:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="px-3 py-2 border-2 border-gray-300 bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="recent">Most Recently Contacted</option>
                <option value="oldest">Least Recently Contacted</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </select>
            </div>

            {/* Results count and view toggle */}
            <div className="mt-4 pt-4 border-t-2 border-gray-300 flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Showing {filtered.length} of {businesses.length} businesses
                {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
              </p>
              <div className="flex border-2 border-gray-300">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1 text-sm font-medium ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label="Grid view"
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label="List view"
                >
                  List
                </button>
              </div>
            </div>
          </div>

          {/* Business Grid */}
          {filtered.length === 0 ? (
            <div className="bg-white border-2 border-gray-300 p-8 text-center">
              <p className="text-gray-600">
                No businesses match your current filters.
              </p>
            </div>
          ) : (
            <>
            {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedBusinesses.map((business) => (
                <Link
                  key={business.id}
                  href={`/businesses/${business.id}`}
                  className="bg-white border-2 border-gray-300 p-6 hover:border-blue-600 hover:bg-blue-50 transition-colors duration-150"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {business.name}
                  </h3>

                  {(business.category || business.status) && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {business.category && (
                        <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">
                          {business.category}
                        </span>
                      )}
                      {business.status && (
                        <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">
                          {business.status}
                        </span>
                      )}
                    </div>
                  )}

                  {(business.is_club_card || business.is_advertiser) && (
                    <div className="flex gap-2 mb-3">
                      {business.is_club_card && (
                        <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
                          Club Card
                        </span>
                      )}
                      {business.is_advertiser && (
                        <span className="text-xs bg-green-100 px-2 py-1 text-green-800">
                          Advertiser
                        </span>
                      )}
                    </div>
                  )}

                  {business.last_contacted_at && (
                    <p className="text-sm text-gray-600 mt-3">
                      Last contacted:{' '}
                      {formatDateGB(business.last_contacted_at)}
                    </p>
                  )}

                  {!business.last_contacted_at && (
                    <p className="text-sm text-gray-500 mt-3 italic">
                      No correspondence yet
                    </p>
                  )}
                </Link>
              ))}
            </div>
            ) : (
            /* List View */
            <div className="bg-white border-2 border-gray-300">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-left px-4 py-3 text-sm font-bold text-gray-900">Name</th>
                    <th className="text-left px-4 py-3 text-sm font-bold text-gray-900 hidden md:table-cell">Category</th>
                    <th className="text-left px-4 py-3 text-sm font-bold text-gray-900 hidden md:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-sm font-bold text-gray-900 hidden lg:table-cell">Type</th>
                    <th className="text-left px-4 py-3 text-sm font-bold text-gray-900">Last Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBusinesses.map((business) => (
                    <tr key={business.id} className="border-b border-gray-200 hover:bg-blue-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/businesses/${business.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                        >
                          {business.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                        {business.category || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                        {business.status || '-'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex gap-1">
                          {business.is_club_card && (
                            <span className="text-xs bg-blue-100 px-2 py-0.5 text-blue-800">CC</span>
                          )}
                          {business.is_advertiser && (
                            <span className="text-xs bg-green-100 px-2 py-0.5 text-green-800">Ad</span>
                          )}
                          {!business.is_club_card && !business.is_advertiser && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {business.last_contacted_at
                          ? formatDateGB(business.last_contacted_at)
                          : <span className="italic text-gray-400">None</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                {/* Page numbers */}
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-4 py-2 border-2 ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            )}
            </>
          )}
        </>
      )}
      </div>{/* end left column */}

      {/* Right: inline Daily Briefing */}
      <div className="hidden md:flex flex-col w-[380px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
        <ChatPanel inline suggestedPrompt={shouldAutoSend ? 'what do i need to do today' : undefined} businessCount={businesses.length} />
      </div>
      </div>{/* end two-column flex */}
    </div>
  )
}
