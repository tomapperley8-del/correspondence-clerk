'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBusinesses, type Business } from '@/app/actions/businesses'
import { AddBusinessButton } from '@/components/AddBusinessButton'
import { Input } from '@/components/ui/input'

type FilterType = 'all' | 'club-card' | 'advertiser' | 'both' | 'prospect'
type SortType = 'recent' | 'oldest' | 'name-asc' | 'name-desc'

export default function DashboardPage() {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortType>('recent')
  const [showActionNeeded, setShowActionNeeded] = useState(false)
  const [showOverdue, setShowOverdue] = useState(false)

  useEffect(() => {
    async function loadBusinesses() {
      const result = await getBusinesses()
      if ('error' in result) {
        setError(result.error)
      } else {
        setBusinesses(result.data || [])
      }
      setLoading(false)
    }
    loadBusinesses()
  }, [])

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

  // Get unique categories
  const categories = Array.from(
    new Set(businesses.map((b) => b.category).filter(Boolean))
  ).sort()

  // Filter businesses
  let filtered = businesses.filter((business) => {
    // Search filter
    if (searchQuery && !business.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    // Type filter
    if (filterType === 'club-card' && !business.is_club_card) return false
    if (filterType === 'advertiser' && !business.is_advertiser) return false
    if (filterType === 'both' && !(business.is_club_card && business.is_advertiser)) return false
    if (filterType === 'prospect' && (business.is_club_card || business.is_advertiser)) return false

    // Category filter
    if (selectedCategory !== 'all' && business.category !== selectedCategory) return false

    // Action needed filter
    // Note: We don't have action_needed on businesses yet, would need to join with correspondence
    // Skipping for now

    return true
  })

  // Sort businesses
  filtered = [...filtered].sort((a, b) => {
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <AddBusinessButton />
      </div>

      {businesses.length === 0 ? (
        <div className="bg-white border border-gray-300 p-12 text-center">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            No Businesses Yet
          </h2>
          <p className="text-gray-600 mb-6">
            Get started by adding your first business to track correspondence.
          </p>
          <AddBusinessButton />
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
                <FilterButton
                  active={filterType === 'club-card'}
                  onClick={() => setFilterType('club-card')}
                >
                  Club Card Only
                </FilterButton>
                <FilterButton
                  active={filterType === 'advertiser'}
                  onClick={() => setFilterType('advertiser')}
                >
                  Advertiser Only
                </FilterButton>
                <FilterButton
                  active={filterType === 'both'}
                  onClick={() => setFilterType('both')}
                >
                  Both Club Card & Advertiser
                </FilterButton>
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

            {/* Results count */}
            <div className="mt-4 pt-4 border-t-2 border-gray-300">
              <p className="text-sm text-gray-600">
                Showing {filtered.length} of {businesses.length} businesses
              </p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((business) => (
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
                      {new Date(business.last_contacted_at).toLocaleDateString('en-GB')}
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
          )}
        </>
      )}
    </div>
  )
}
