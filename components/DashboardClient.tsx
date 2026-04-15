'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import type { BusinessListItem } from '@/app/actions/businesses'
import type { MembershipType } from '@/app/actions/membership-types'
import { AddBusinessButton } from '@/components/AddBusinessButton'
import { Input } from '@/components/ui/input'
import { formatDateGB } from '@/lib/utils'
import { InsightsPanel } from '@/components/InsightsPanel'
import { useInsights } from '@/components/InsightsContext'

type FilterType = 'all' | 'prospect' | string
type SortType = 'recent' | 'oldest' | 'name-asc' | 'name-desc'

interface DashboardClientProps {
  initialBusinesses: BusinessListItem[]
  initialMembershipTypes: MembershipType[]
  hasContact: boolean
}

export function DashboardClient({ initialBusinesses, initialMembershipTypes, hasContact }: DashboardClientProps) {
  const [businesses] = useState<BusinessListItem[]>(initialBusinesses)
  const [membershipTypes] = useState<MembershipType[]>(initialMembershipTypes)

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

  const { open: openInsights } = useInsights()

  // Onboarding checklist
  const hasBusiness = businesses.length > 0
  const hasEntry = businesses.some((b) => b.last_contacted_at)
  const allDone = hasBusiness && hasContact && hasEntry
  const [checklistDismissed, setChecklistDismissed] = useState(true) // start hidden, read from localStorage

  // Auto-dismiss checklist once all steps complete
  useEffect(() => {
    if (allDone && !checklistDismissed) {
      localStorage.setItem('checklist_dismissed', 'true')
      setChecklistDismissed(true)
    }
  }, [allDone, checklistDismissed])

  // Insights sidebar collapsed state (default collapsed, persisted in localStorage)
  const [insightsSidebarOpen, setInsightsSidebarOpen] = useState(false)

  // New entries badge: tracks which businesses have activity since last visit
  const [hasNewEntries, setHasNewEntries] = useState<Set<string>>(new Set())

  // Compute new entries badges and restore prefs from localStorage on mount
  useEffect(() => {
    const installed = localStorage.getItem('bookmarklet-installed')
    setBookmarkletInstalled(!!installed)

    const dismissed = localStorage.getItem('checklist_dismissed')
    setChecklistDismissed(dismissed === 'true')

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
    } catch {
      // Ignore parse errors
    }

    // Restore insights sidebar preference (defaults to collapsed)
    const sidebarPref = localStorage.getItem('insights_sidebar_expanded')
    if (sidebarPref === 'true') setInsightsSidebarOpen(true)

    // Compute new entries from already-available data
    const newSet = new Set<string>()
    for (const b of initialBusinesses) {
      if (!b.last_contacted_at) continue
      const lastVisited = localStorage.getItem(`last_visited_${b.id}`)
      if (!lastVisited || new Date(b.last_contacted_at) > new Date(lastVisited)) {
        newSet.add(b.id)
      }
    }
    setHasNewEntries(newSet)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Persist filter preferences to localStorage
  useEffect(() => {
    const prefs = { filterType, selectedCategory, sortBy, viewMode }
    localStorage.setItem('dashboard_prefs', JSON.stringify(prefs))
  }, [filterType, selectedCategory, sortBy, viewMode])

  // Get unique categories (memoized)
  const categories = useMemo(() =>
    Array.from(
      new Set(businesses.map((b) => b.category).filter((c): c is string => Boolean(c)))
    ).sort(),
    [businesses]
  )

  // Filter and sort businesses (memoized)
  const filtered = useMemo(() => {
    const result = businesses.filter((business) => {
      if (searchQuery && !business.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      if (filterType === 'prospect' && business.membership_type) return false
      if (filterType !== 'all' && filterType !== 'prospect' && business.membership_type !== filterType) return false
      if (selectedCategory !== 'all' && business.category !== selectedCategory) return false
      return true
    })

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          if (!a.last_contacted_at && !b.last_contacted_at) return 0
          if (!a.last_contacted_at) return 1
          if (!b.last_contacted_at) return -1
          return new Date(b.last_contacted_at).getTime() - new Date(a.last_contacted_at).getTime()
        case 'oldest':
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

  // Pagination calculations
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBusinesses = filtered.slice(startIndex, endIndex)

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
      className={`px-3 py-1 text-sm border transition-colors ${
        active
          ? 'bg-brand-navy text-white border-brand-navy'
          : 'bg-white text-gray-700 border-gray-300 hover:border-brand-navy'
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => openInsights()}
            className="md:hidden px-3 py-1.5 text-sm font-medium text-white rounded-sm transition-colors bg-brand-navy hover:bg-brand-navy-hover"
          >
            Insights
          </button>
          <Link href="/import" className="text-sm text-brand-navy hover:underline">
            Bulk import
          </Link>
          <AddBusinessButton />
        </div>
      </div>

      {/* Onboarding checklist — only for new users (1–5 businesses), hidden once dismissed or all steps done */}
      {!checklistDismissed && businesses.length > 0 && businesses.length <= 5 && (
        <div
          className="mb-6 rounded-sm border px-5 py-4"
          style={{ backgroundColor: '#F0F4F0', borderColor: 'rgba(124,154,94,0.3)' }}
        >
          {allDone ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700 mb-1">You&apos;re set up</p>
                <p className="text-sm text-gray-600 mb-3">
                  As you log correspondence, your{' '}
                  <Link href="/actions" className="text-brand-navy hover:underline font-medium">Actions page</Link>
                  {' '}will automatically surface replies that need sending, flagged follow-ups, contract renewals, and businesses that have gone quiet — all in one prioritised list.
                </p>
                <Link
                  href="/actions"
                  className="inline-block px-4 py-1.5 bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy-hover transition-colors"
                >
                  Go to Actions
                </Link>
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('checklist_dismissed', 'true')
                  setChecklistDismissed(true)
                }}
                className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 mt-0.5"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700 mb-3">Get started</p>
                <ol className="space-y-2">
                  {[
                    { done: hasBusiness, label: 'Add your first business', href: '/dashboard' },
                    { done: hasContact, label: 'Add a contact', href: hasBusiness ? undefined : undefined },
                    { done: hasEntry, label: 'Log your first correspondence entry', href: '/new-entry' },
                  ].map(({ done, label, href }, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span
                        className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                        style={done
                          ? { backgroundColor: '#7C9A5E', borderColor: '#7C9A5E', color: 'white' }
                          : { borderColor: 'rgba(0,0,0,0.2)', color: 'transparent' }
                        }
                      >
                        {done ? '✓' : ''}
                      </span>
                      <span className={done ? 'line-through text-gray-400' : 'text-gray-700'}>
                        {href && !done ? <Link href={href} className="hover:underline">{label}</Link> : label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('checklist_dismissed', 'true')
                  setChecklistDismissed(true)
                }}
                className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 mt-0.5"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bookmarklet Installation Card — only show once there are businesses */}
      {!bookmarkletInstalled && businesses.length > 0 && (
        <div className="border border-brand-navy/20 bg-brand-navy/[0.03] p-5 mb-6 rounded-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Import Emails</h2>
              <p className="text-sm text-gray-600 mb-4">
                Install the Email Import Tool to import emails from Outlook or Gmail with one click.
              </p>
              <Link
                href="/bookmarklet"
                className="inline-block px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy-hover transition-colors"
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
          <h1 className="font-[Lora,serif] text-2xl font-semibold text-brand-dark mb-2">
            Welcome to Correspondence Clerk
          </h1>
          <p className="text-gray-500 text-sm mb-8">Get set up in three steps.</p>
          <ol className="space-y-5 mb-8">
            {[
              'Add your first business and contact',
              'Import an email (bookmarklet) or paste one in',
              'Run your first Insight to see what needs attention',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-navy text-white text-sm font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-gray-700 text-sm leading-relaxed pt-1">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3">
            <Link
              href="/new-entry"
              className="inline-block text-center px-5 py-2.5 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Add your first business
            </Link>
            <Link
              href="/import"
              className="inline-block text-center px-5 py-2.5 border border-brand-navy text-brand-navy text-sm font-medium hover:bg-brand-navy hover:text-white transition-colors"
            >
              Bulk import from Gmail or Outlook
            </Link>
            <Link
              href="/install-bookmarklet"
              className="text-sm text-brand-navy hover:underline text-center"
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
                className="w-full px-4 py-2 border-2 border-gray-300 focus:border-brand-navy"
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
                  className="px-3 py-2 border-2 border-gray-300 bg-white focus:border-brand-navy focus:outline-none"
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
                className="px-3 py-2 border-2 border-gray-300 bg-white focus:border-brand-navy focus:outline-none"
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
                      ? 'bg-brand-navy text-white'
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
                      ? 'bg-brand-navy text-white'
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
                  onClick={() => {
                    localStorage.setItem(`last_visited_${business.id}`, new Date().toISOString())
                    setHasNewEntries((prev) => { const next = new Set(prev); next.delete(business.id); return next })
                  }}
                  className="relative bg-white border-2 border-gray-300 p-6 hover:border-brand-navy hover:bg-blue-50 transition-colors duration-150"
                >
                  {hasNewEntries.has(business.id) && (
                    <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-green-500" title="New activity" />
                  )}
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
                          className="text-brand-navy hover:text-brand-dark hover:underline font-semibold"
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
                            ? 'bg-brand-navy text-white border-brand-navy'
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

      {/* Right: collapsible Insights sidebar */}
      {insightsSidebarOpen ? (
        <div className="hidden md:flex flex-col w-[380px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Insights</span>
            <button
              onClick={() => {
                setInsightsSidebarOpen(false)
                localStorage.setItem('insights_sidebar_expanded', 'false')
              }}
              className="text-gray-400 hover:text-gray-600 text-sm px-1.5 py-0.5 rounded transition-colors"
              title="Collapse Insights"
              aria-label="Collapse Insights sidebar"
            >
              ›
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <InsightsPanel inline />
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-col shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
          <button
            onClick={() => {
              setInsightsSidebarOpen(true)
              localStorage.setItem('insights_sidebar_expanded', 'true')
            }}
            className="flex flex-col items-center justify-center gap-2 w-8 h-full text-gray-400 hover:text-brand-navy hover:bg-gray-50 transition-colors border-l border-gray-100"
            title="Expand Insights"
            aria-label="Expand Insights sidebar"
          >
            <span className="text-xs font-semibold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">Insights</span>
            <span className="text-base">‹</span>
          </button>
        </div>
      )}
      </div>{/* end two-column flex */}
    </div>
  )
}
