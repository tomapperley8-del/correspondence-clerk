'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBusinesses, type BusinessListItem } from '@/app/actions/businesses'

const RECENT_KEY = 'cmd_k_recent'
const MAX_RECENT = 5

type RecentItem = { id: string; name: string }

function getRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function pushRecent(item: RecentItem) {
  const prev = getRecent().filter((r) => r.id !== item.id)
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...prev].slice(0, MAX_RECENT)))
}

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [businesses, setBusinesses] = useState<BusinessListItem[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent, setRecent] = useState<RecentItem[]>([])
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
    setRecent(getRecent())
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

  // When no query, show recent items at top (deduplicated against filtered)
  const showRecent = !query.trim() && recent.length > 0

  const navigate = useCallback((b: { id: string; name: string }) => {
    pushRecent({ id: b.id, name: b.name })
    setOpen(false)
    router.push(`/businesses/${b.id}`)
  }, [router])

  // Combined list for keyboard navigation: recent (if shown) then filtered
  const navList: { id: string; name: string; membership_type?: string | null; isRecent?: boolean }[] = showRecent
    ? [
        ...recent.map((r) => ({ ...r, isRecent: true })),
        ...filtered.filter((b) => !recent.some((r) => r.id === b.id)),
      ]
    : filtered

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, navList.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && navList[activeIdx]) navigate(navList[activeIdx])
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
        {navList.length > 0 ? (
          <ul>
            {showRecent && (
              <li className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recent</li>
            )}
            {navList.map((b, i) => {
              const isFirstNonRecent = showRecent && !b.isRecent && (i === 0 || navList[i - 1].isRecent)
              return (
                <>
                  {isFirstNonRecent && (
                    <li key={`sep-${b.id}`} className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-100">All</li>
                  )}
                  <li key={b.id}>
                    <button
                      onClick={() => navigate(b)}
                      className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between ${
                        i === activeIdx ? 'bg-blue-50 text-brand-navy' : 'text-gray-800 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-medium">{b.name}</span>
                      {'membership_type' in b && b.membership_type && (
                        <span className="text-xs text-gray-400">{(b.membership_type as string).replace(/_/g, ' ')}</span>
                      )}
                    </button>
                  </li>
                </>
              )
            })}
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
