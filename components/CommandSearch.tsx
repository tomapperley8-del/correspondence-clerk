'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBusinesses, type BusinessListItem } from '@/app/actions/businesses'
import { getTasks, type Task } from '@/app/actions/tasks'

const RECENT_KEY = 'cmd_k_recent'
const MAX_RECENT = 5
const CACHE_KEY = 'cmd_k_businesses'
const TASKS_CACHE_KEY = 'cmd_k_tasks'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function setCache<T>(key: string, data: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

function clearBusinessCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY)
    sessionStorage.removeItem(TASKS_CACHE_KEY)
  } catch {}
}

type RecentItem = { id: string; name: string; type?: string }

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

type SearchResult = {
  id: string
  name: string
  type: 'business' | 'task' | 'recent'
  detail?: string
  href: string
}

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [businesses, setBusinesses] = useState<BusinessListItem[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
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
    const invalidate = () => clearBusinessCache()
    document.addEventListener('keydown', handler)
    window.addEventListener('businesses:changed', invalidate)
    return () => {
      document.removeEventListener('keydown', handler)
      window.removeEventListener('businesses:changed', invalidate)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    setRecent(getRecent())
    setTimeout(() => inputRef.current?.focus(), 50)

    const cachedBiz = getCached<BusinessListItem[]>(CACHE_KEY)
    if (cachedBiz) {
      setBusinesses(cachedBiz)
    } else {
      getBusinesses().then((r) => {
        if (!('error' in r)) {
          const data = r.data || []
          setBusinesses(data)
          setCache(CACHE_KEY, data)
        }
      })
    }

    const cachedTasks = getCached<Task[]>(TASKS_CACHE_KEY)
    if (cachedTasks) {
      setTasks(cachedTasks)
    } else {
      getTasks().then((r) => {
        if (!('error' in r)) {
          const data = (r.data || []).filter(t => t.status === 'open')
          setTasks(data)
          setCache(TASKS_CACHE_KEY, data)
        }
      })
    }
  }, [open])

  const results = buildResults(query, businesses, tasks, recent)

  const navigate = useCallback((result: SearchResult) => {
    pushRecent({ id: result.id, name: result.name, type: result.type })
    setOpen(false)
    router.push(result.href)
  }, [router])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); navigate(results[activeIdx]) }
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
          placeholder="Search businesses, tasks… (Esc to close)"
          className="w-full px-4 py-3 text-sm border-b-2 border-gray-300 focus:outline-none"
        />
        {results.length > 0 ? (
          <ul className="max-h-[400px] overflow-y-auto">
            {results.map((r, i) => {
              const showSeparator = i > 0 && results[i - 1].type !== r.type
              return (
                <li key={`${r.type}-${r.id}`}>
                  {(i === 0 || showSeparator) && (
                    <div className={`px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${showSeparator ? 'border-t border-gray-100' : ''}`}>
                      {r.type === 'recent' ? 'Recent' : r.type === 'business' ? 'Businesses' : 'Tasks'}
                    </div>
                  )}
                  <button
                    onClick={() => navigate(r)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 ${
                      i === activeIdx ? 'bg-blue-50 text-brand-navy' : 'text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium block truncate">{r.name}</span>
                      {r.detail && <span className="text-xs text-gray-400 block truncate">{r.detail}</span>}
                    </div>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 flex-shrink-0 ${
                      r.type === 'task' ? 'bg-brand-olive/10 text-brand-olive' : 'bg-brand-navy/10 text-brand-navy'
                    }`}>
                      {r.type === 'task' ? 'Task' : r.type === 'recent' ? '' : 'Business'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="px-4 py-3 text-sm text-gray-400">
            {query ? 'No results found' : 'Start typing to search…'}
          </div>
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

function buildResults(
  query: string,
  businesses: BusinessListItem[],
  tasks: Task[],
  recent: RecentItem[]
): SearchResult[] {
  const q = query.trim().toLowerCase()

  if (!q) {
    const recentResults: SearchResult[] = recent.map(r => ({
      id: r.id,
      name: r.name,
      type: 'recent' as const,
      href: r.type === 'task' ? '/todos' : `/businesses/${r.id}`,
    }))
    const bizResults: SearchResult[] = businesses.slice(0, 6)
      .filter(b => !recent.some(r => r.id === b.id))
      .map(b => ({
        id: b.id,
        name: b.name,
        type: 'business' as const,
        detail: b.membership_type?.replace(/_/g, ' '),
        href: `/businesses/${b.id}`,
      }))
    return [...recentResults, ...bizResults]
  }

  const bizMatches: SearchResult[] = businesses
    .filter(b => b.name.toLowerCase().includes(q))
    .slice(0, 5)
    .map(b => ({
      id: b.id,
      name: b.name,
      type: 'business' as const,
      detail: b.membership_type?.replace(/_/g, ' '),
      href: `/businesses/${b.id}`,
    }))

  const taskMatches: SearchResult[] = tasks
    .filter(t => t.title.toLowerCase().includes(q) || t.business?.name.toLowerCase().includes(q))
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      name: t.title,
      type: 'task' as const,
      detail: t.business?.name || (t.due_date ? `Due ${t.due_date}` : undefined),
      href: '/todos',
    }))

  return [...bizMatches, ...taskMatches]
}
