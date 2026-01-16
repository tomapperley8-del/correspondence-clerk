'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { searchAll, type SearchResult } from '@/app/actions/search'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) {
      return
    }

    setIsSearching(true)
    setHasSearched(true)

    const result = await searchAll(query.trim())

    if ('error' in result) {
      alert(`Search error: ${result.error}`)
      setResults([])
    } else {
      setResults(result.data)
    }

    setIsSearching(false)
  }

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
          />
          <Button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="bg-blue-600 text-white hover:bg-blue-700 px-8 py-3 text-lg font-semibold"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>
      </form>

      {/* Results */}
      {hasSearched && (
        <div className="bg-white border-2 border-gray-300 p-6">
          {results.length === 0 ? (
            <p className="text-gray-600 text-sm">
              No results found for &quot;{query}&quot;
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Found {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}
                &quot;
              </p>

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
            </>
          )}
        </div>
      )}
    </div>
  )
}
