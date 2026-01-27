'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { searchAll, type SearchResult, type SearchFilters } from '@/app/actions/search'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Filter state
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [direction, setDirection] = useState<'received' | 'sent' | ''>('')
  const [type, setType] = useState<'Email' | 'Call' | 'Meeting' | ''>('')
  const [sortBy, setSortBy] = useState<'relevance' | 'date_newest' | 'date_oldest'>('relevance')
  const [showFilters, setShowFilters] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) {
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    setSearchError(null)

    const filters: SearchFilters = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      direction: direction || undefined,
      type: type || undefined,
      sortBy,
    }

    const result = await searchAll(query.trim(), filters)

    if ('error' in result) {
      setSearchError(result.error || 'Search failed')
      setResults([])
    } else {
      setResults(result.data)
    }

    setIsSearching(false)
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setDirection('')
    setType('')
    setSortBy('relevance')
  }

  const hasActiveFilters = dateFrom || dateTo || direction || type || sortBy !== 'relevance'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Search</h1>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-4">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search businesses or correspondence..."
            className="flex-1 px-4 py-3 text-lg"
            aria-label="Search query"
          />
          <Button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="bg-blue-600 text-white hover:bg-blue-700 px-8 py-3 text-lg font-semibold"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {/* Filter Toggle */}
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {hasActiveFilters && ' (active)'}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-gray-600 hover:text-gray-800 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 bg-gray-50 border-2 border-gray-300 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date From */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Direction */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Direction
                </label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as any)}
                  className="w-full px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="">All</option>
                  <option value="received">Received</option>
                  <option value="sent">Sent</option>
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="">All</option>
                  <option value="Email">Email</option>
                  <option value="Call">Call</option>
                  <option value="Meeting">Meeting</option>
                </select>
              </div>
            </div>

            {/* Sort */}
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
              >
                <option value="relevance">Relevance</option>
                <option value="date_newest">Date (newest first)</option>
                <option value="date_oldest">Date (oldest first)</option>
              </select>
            </div>
          </div>
        )}
      </form>

      {/* Pre-search hint */}
      {!hasSearched && (
        <div className="bg-gray-50 border-2 border-gray-300 p-8 text-center">
          <p className="text-gray-600">
            Search across all businesses and correspondence entries.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Use filters to narrow results by date, direction, or type.
          </p>
        </div>
      )}

      {/* Search Error */}
      {searchError && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6" role="alert">
          <p className="text-red-800 text-sm">Search error: {searchError}</p>
        </div>
      )}

      {/* Results */}
      {hasSearched && !searchError && (
        <div className="bg-white border-2 border-gray-300 p-6">
          {/* Result count */}
          <p className="text-sm text-gray-600 mb-4" aria-live="polite">
            {results.length === 0
              ? `No results found for "${query}"`
              : `Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`}
          </p>

          {results.length > 0 && (
            <div className="space-y-4">
              {results.map((result) =>
                result.type === 'business' ? (
                  <Link
                    key={`business-${result.id}`}
                    href={`/businesses/${result.id}`}
                    className="block border-2 border-gray-300 p-4 hover:border-blue-600 hover:bg-blue-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-green-100 px-2 py-1 text-green-800">
                        Business
                      </span>
                      <h3 className="font-semibold text-gray-900">{result.title}</h3>
                    </div>
                    {result.snippet && (
                      <p className="text-sm text-gray-600">{result.snippet}</p>
                    )}
                  </Link>
                ) : (
                  <Link
                    key={`correspondence-${result.id}`}
                    href={`/businesses/${result.business_id}`}
                    className="block border-2 border-gray-300 p-4 hover:border-blue-600 hover:bg-blue-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
                        Correspondence
                      </span>
                      <h3 className="font-semibold text-gray-900">{result.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      {result.business_name} • {result.contact_name}
                      {result.direction && (
                        <span> • {result.direction === 'sent' ? 'Sent' : 'Received'}</span>
                      )}
                      {result.correspondence_type && (
                        <span> • {result.correspondence_type}</span>
                      )}
                      {result.entry_date && (
                        <span>
                          {' '}
                          • {new Date(result.entry_date).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </p>
                    {result.snippet && (
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {result.snippet}
                      </p>
                    )}
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
