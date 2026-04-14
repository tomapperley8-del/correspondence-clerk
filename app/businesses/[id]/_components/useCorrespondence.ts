'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getCorrespondenceByBusiness, type Correspondence } from '@/app/actions/correspondence'
import { getDisplayNamesForUsers } from '@/app/actions/user-profile'

const PAGE_SIZE = 100

interface UseCorrespondenceOptions {
  businessId: string
}

export function useCorrespondence({ businessId }: UseCorrespondenceOptions) {
  // Data
  const [correspondence, setCorrespondence] = useState<Correspondence[]>([])
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Filter state
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest')
  const [contactFilter, setContactFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'received' | 'sent'>('all')
  const [dateRange, setDateRange] = useState<'1m' | '6m' | '12m' | 'custom'>('12m')
  const [customDateFrom, setCustomDateFrom] = useState<string>('')
  const [customDateTo, setCustomDateTo] = useState<string>('')

  // Pagination
  const [totalCount, setTotalCount] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const filtersInitialized = useRef(false)

  // UI state
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  // Deep-link: track which entry to auto-expand + scroll to (set from URL hash)
  const pendingScrollEntryId = useRef<string | null>(null)

  // Scroll to the target entry once it has been expanded
  useEffect(() => {
    const targetId = pendingScrollEntryId.current
    if (!targetId || !expandedEntries.has(targetId)) return
    const el = document.getElementById(`entry-${targetId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      pendingScrollEntryId.current = null
    }
  }, [expandedEntries])

  // Initial load: read localStorage prefs + fetch correspondence
  useEffect(() => {
    filtersInitialized.current = false

    // Detect deep-link hash (#entry-<uuid>) — must read before any state changes
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    const hashMatch = hash.match(/^#entry-([0-9a-f-]{36})$/)
    const deepLinkEntryId = hashMatch ? hashMatch[1] : null

    const storageKey = `business_${businessId}_view`
    let initialContact = 'all'
    let initialDirection: 'all' | 'received' | 'sent' = 'all'
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const prefs = JSON.parse(saved)
        if (prefs.sortOrder) setSortOrder(prefs.sortOrder)
        if (prefs.contactFilter) { initialContact = prefs.contactFilter; setContactFilter(prefs.contactFilter) }
        if (prefs.directionFilter) { initialDirection = prefs.directionFilter; setDirectionFilter(prefs.directionFilter) }
        if (prefs.dateRange) setDateRange(prefs.dateRange)
        if (prefs.customDateFrom) setCustomDateFrom(prefs.customDateFrom)
        if (prefs.customDateTo) setCustomDateTo(prefs.customDateTo)
      }
    } catch (e) {
      console.error('Error loading view preferences:', e)
    }

    setLoading(true)
    getCorrespondenceByBusiness(businessId, {
      limit: PAGE_SIZE,
      contactId: initialContact,
      direction: initialDirection,
    }).then(async (result) => {
      const data = 'error' in result ? [] : result.data ?? []
      setCorrespondence(data)
      setTotalCount('error' in result ? 0 : result.count ?? 0)
      setLoading(false)
      filtersInitialized.current = true

      // Auto-expand + scroll to deep-linked entry if it's in the loaded set
      if (deepLinkEntryId && data.some(e => e.id === deepLinkEntryId)) {
        pendingScrollEntryId.current = deepLinkEntryId
        setIsArchiveExpanded(true) // ensure archive is visible in case entry is older
        setExpandedEntries(prev => new Set([...prev, deepLinkEntryId]))
      }

      const userIds = [...new Set(data.map(c => c.user_id))]
      if (userIds.length > 0) {
        const displayNamesResult = await getDisplayNamesForUsers(userIds)
        if (displayNamesResult.data) {
          const namesMap: Record<string, string> = {}
          displayNamesResult.data.forEach(item => {
            namesMap[item.id] = item.display_name || ''
          })
          setDisplayNames(namesMap)
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  // Re-fetch when contact/direction filter changes (after initial load)
  useEffect(() => {
    if (!filtersInitialized.current) return
    getCorrespondenceByBusiness(businessId, {
      limit: PAGE_SIZE,
      contactId: contactFilter,
      direction: directionFilter,
    }).then(result => {
      if (!('error' in result)) {
        setCorrespondence(result.data ?? [])
        setTotalCount(result.count ?? 0)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, contactFilter, directionFilter])

  // Save filter preferences to localStorage when they change
  useEffect(() => {
    if (!filtersInitialized.current) return
    const storageKey = `business_${businessId}_view`
    localStorage.setItem(storageKey, JSON.stringify({
      sortOrder, contactFilter, directionFilter, dateRange, customDateFrom, customDateTo,
    }))
  }, [businessId, sortOrder, contactFilter, directionFilter, dateRange, customDateFrom, customDateTo])

  // Refresh correspondence from DB (page 1 with current filters)
  const refreshCorrespondence = useCallback(async () => {
    const result = await getCorrespondenceByBusiness(businessId, {
      limit: PAGE_SIZE,
      contactId: contactFilter,
      direction: directionFilter,
    })
    if (!('error' in result)) {
      setCorrespondence(result.data ?? [])
      setTotalCount(result.count ?? 0)
    }
  }, [businessId, contactFilter, directionFilter])

  // Append next page of correspondence from DB
  const loadMore = useCallback(async () => {
    if (correspondence.length >= totalCount) return
    setIsLoadingMore(true)
    const result = await getCorrespondenceByBusiness(businessId, {
      limit: PAGE_SIZE,
      offset: correspondence.length,
      contactId: contactFilter,
      direction: directionFilter,
    })
    if (!('error' in result)) {
      setCorrespondence(prev => [...prev, ...(result.data ?? [])])
    }
    setIsLoadingMore(false)
  }, [businessId, correspondence, totalCount, contactFilter, directionFilter])

  // Split correspondence into recent/archive/pinned with date filters applied
  const { recentEntries, archiveEntries, pinnedEntries } = useMemo(() => {
    let cutoffDate: Date
    if (dateRange === 'custom' && customDateFrom) {
      cutoffDate = new Date(customDateFrom)
    } else {
      cutoffDate = new Date()
      switch (dateRange) {
        case '1m': cutoffDate.setMonth(cutoffDate.getMonth() - 1); break
        case '6m': cutoffDate.setMonth(cutoffDate.getMonth() - 6); break
        default: cutoffDate.setMonth(cutoffDate.getMonth() - 12); break
      }
    }
    const endDate = dateRange === 'custom' && customDateTo ? new Date(customDateTo) : null

    const sortFn = (a: Correspondence, b: Correspondence) => {
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA
    }

    const recent = correspondence
      .filter(e => {
        const d = new Date(e.entry_date || e.created_at)
        return d >= cutoffDate && (endDate ? d <= endDate : true)
      })
      .sort(sortFn)

    const archive = correspondence
      .filter(e => {
        const d = new Date(e.entry_date || e.created_at)
        if (endDate) return d < cutoffDate || d > endDate
        return d < cutoffDate
      })
      .sort(sortFn)

    const pinned = correspondence
      .filter(e => e.is_pinned)
      .sort((a, b) => new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime())

    return { recentEntries: recent, archiveEntries: archive, pinnedEntries: pinned }
  }, [correspondence, sortOrder, dateRange, customDateFrom, customDateTo])

  // Chronological index for context neighbour lookup (Show Previous / Show Next)
  const chronoIndex = useMemo(() => {
    const sorted = [...correspondence].sort((a, b) =>
      new Date(a.entry_date || a.created_at).getTime() - new Date(b.entry_date || b.created_at).getTime()
    )
    const indexMap = new Map<string, number>()
    sorted.forEach((entry, i) => indexMap.set(entry.id, i))
    return { sorted, indexMap }
  }, [correspondence])

  const getPreviousEntryId = useCallback((entryId: string): string | null => {
    const idx = chronoIndex.indexMap.get(entryId)
    if (idx === undefined || idx === 0) return null
    return chronoIndex.sorted[idx - 1].id
  }, [chronoIndex])

  const getNextEntryId = useCallback((entryId: string): string | null => {
    const idx = chronoIndex.indexMap.get(entryId)
    if (idx === undefined || idx >= chronoIndex.sorted.length - 1) return null
    return chronoIndex.sorted[idx + 1].id
  }, [chronoIndex])

  const isExpandedEntry = useCallback((entryId: string) => expandedEntries.has(entryId), [expandedEntries])

  const handleToggleExpand = useCallback((entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }, [])

  const remainingInDB = Math.max(0, totalCount - correspondence.length)

  return {
    // Data
    correspondence,
    setCorrespondence,
    displayNames,
    loading,
    totalCount,
    remainingInDB,
    isLoadingMore,
    // Filter state
    sortOrder, setSortOrder,
    contactFilter, setContactFilter,
    directionFilter, setDirectionFilter,
    dateRange, setDateRange,
    customDateFrom, setCustomDateFrom,
    customDateTo, setCustomDateTo,
    // Derived sections
    recentEntries,
    archiveEntries,
    pinnedEntries,
    // Archive UI
    isArchiveExpanded,
    setIsArchiveExpanded,
    // Actions
    refreshCorrespondence,
    loadMore,
    getPreviousEntryId,
    getNextEntryId,
    isExpandedEntry,
    handleToggleExpand,
  }
}
