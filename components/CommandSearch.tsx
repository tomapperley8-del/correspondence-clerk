'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBusinesses, type BusinessListItem } from '@/app/actions/businesses'

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [businesses, setBusinesses] = useState<BusinessListItem[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    setTimeout(() => inputRef.current?.focus(), 50)
    if (businesses.length === 0) {
      getBusinesses().then((r) => {
        if (!('error' in r)) setBusinesses(r.data || [])
      })
    }
  }, [open, businesses.length])

  const filtered = query.trim()
    ? businesses.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : businesses.slice(0, 8)

  const navigate = useCallback((b: BusinessListItem) => {
    setOpen(false)
    router.push(`/businesses/${b.id}`)
  }, [router])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[activeIdx]) navigate(filtered[activeIdx])
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setOpen(false)} />
      <div className="fixed top-24 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 bg-white border-2 border-gray-300 shadow-xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
          onKeyDown={handleKey}
          placeholder="Jump to business… (Esc to close)"
          className="w-full px-4 py-3 text-sm border-b-2 border-gray-300 focus:outline-none"
        />
        {filtered.length > 0 ? (
          <ul>
            {filtered.map((b, i) => (
              <li key={b.id}>
                <button
                  onClick={() => navigate(b)}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between ${
                    i === activeIdx ? 'bg-blue-50 text-[#2C4A6E]' : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">{b.name}</span>
                  {b.membership_type && (
                    <span className="text-xs text-gray-400">{b.membership_type.replace(/_/g, ' ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-3 text-sm text-gray-400">No businesses found</div>
        )}
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex gap-4">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </>
  )
}
