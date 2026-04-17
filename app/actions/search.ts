'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { checkRateLimit, rateLimitError } from '@/lib/rate-limit'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

const searchQuerySchema = z.string().min(2, 'Search query must be at least 2 characters')

// Result caps — kept modest so broad queries can't flood the client/server.
const MAX_CORRESPONDENCE_RESULTS = 50
const SNIPPET_SOURCE_CAP = 400  // characters pulled per row before truncation
const SNIPPET_LENGTH = 150

export interface SearchResult {
  type: 'business' | 'correspondence'
  id: string
  title: string
  snippet: string
  business_id?: string
  business_name?: string
  contact_name?: string
  entry_date?: string
  direction?: string
  correspondence_type?: string
  rank?: number
}

export interface SearchFilters {
  dateFrom?: string
  dateTo?: string
  direction?: 'received' | 'sent' | ''
  type?: 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note' | ''
  sortBy?: 'relevance' | 'date_newest' | 'date_oldest'
}

// Type for the joined correspondence query result
interface CorrespondenceSearchResult {
  id: string
  subject: string | null
  formatted_text_current: string | null
  formatted_text_original: string | null
  raw_text_original: string | null
  entry_date: string | null
  direction: 'received' | 'sent' | null
  type: 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note' | null
  business_id: string
  businesses: { name: string } | null
  contacts: { name: string } | null
}

function hasActiveFilters(filters?: SearchFilters): boolean {
  if (!filters) return false
  return !!(filters.dateFrom || filters.dateTo || filters.direction || filters.type)
}

function toCorrespondenceResult(c: CorrespondenceSearchResult, rank: number): SearchResult {
  const text =
    c.formatted_text_current || c.formatted_text_original || c.raw_text_original || ''
  const snippet = text.length > SNIPPET_LENGTH ? text.substring(0, SNIPPET_LENGTH) + '...' : text
  return {
    type: 'correspondence' as const,
    id: c.id,
    title: c.subject || 'Untitled',
    snippet,
    business_id: c.business_id,
    business_name: c.businesses?.name || 'Unknown Business',
    contact_name: c.contacts?.name || undefined,
    entry_date: c.entry_date ?? undefined,
    direction: c.direction ?? undefined,
    correspondence_type: c.type ?? undefined,
    rank,
  }
}

/**
 * Full-text search across businesses and correspondence.
 * Supports filtering by date range, direction, type, and sorting.
 * Also supports "browse mode" — when the query is empty, filters alone (e.g.
 * a date range) drive the result set.
 */
export async function searchAll(query: string, filters?: SearchFilters) {
  // Rate limit: 30 requests per minute for search
  const rateLimit = await checkRateLimit({ limit: 30, windowMs: 60000, endpoint: 'search' })
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.resetIn)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const trimmed = query.trim()

  // Browse mode: no query, but filters present — list recent correspondence
  // matching the filters, ordered by date. Used by "what happened this week?".
  if (!trimmed) {
    if (!hasActiveFilters(filters)) return { data: [] }

    // Smaller select list than the full-text branch — snippets only, no
    // raw_text blobs. Keeps the payload small for broad browses.
    const columns = `
      id,
      subject,
      formatted_text_current,
      formatted_text_original,
      raw_text_original,
      entry_date,
      direction,
      type,
      business_id,
      businesses(name),
      contacts(name)
    `

    let q = supabase
      .from('correspondence')
      .select(columns)
      .eq('organization_id', orgId)

    if (filters?.dateFrom) q = q.gte('entry_date', filters.dateFrom)
    if (filters?.dateTo) q = q.lte('entry_date', filters.dateTo + 'T23:59:59')
    if (filters?.direction) q = q.eq('direction', filters.direction)
    if (filters?.type) q = q.eq('type', filters.type)

    const ascending = filters?.sortBy === 'date_oldest'
    q = q.order('entry_date', { ascending }).limit(MAX_CORRESPONDENCE_RESULTS)

    const { data, error } = await q
    if (error) {
      console.error('Browse search error:', error)
      return { error: error.message }
    }

    const results = ((data ?? []) as unknown as CorrespondenceSearchResult[]).map((c) =>
      toCorrespondenceResult(c, 2)
    )
    return { data: results }
  }

  const parsed = searchQuerySchema.safeParse(trimmed)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Search businesses by name (prioritized)
  const { data: businesses, error: businessError } = await supabase
    .from('businesses')
    .select('id, name, category, status')
    .eq('organization_id', orgId)
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(10)

  if (businessError) {
    console.error('Business search error:', businessError)
  }

  // Search correspondence using GIN full-text index (search_vector column).
  // Pull only a capped slice of text per row so overly broad queries can't
  // blow up the response payload and hang the client.
  let correspondenceQuery = supabase
    .from('correspondence')
    .select(
      `
      id,
      subject,
      formatted_text_current,
      formatted_text_original,
      raw_text_original,
      entry_date,
      direction,
      type,
      business_id,
      businesses(name),
      contacts(name)
    `
    )
    .eq('organization_id', orgId)
    .textSearch('search_vector', trimmed, { type: 'websearch' })

  if (filters?.dateFrom) correspondenceQuery = correspondenceQuery.gte('entry_date', filters.dateFrom)
  if (filters?.dateTo) correspondenceQuery = correspondenceQuery.lte('entry_date', filters.dateTo + 'T23:59:59')
  if (filters?.direction) correspondenceQuery = correspondenceQuery.eq('direction', filters.direction)
  if (filters?.type) correspondenceQuery = correspondenceQuery.eq('type', filters.type)

  const sortBy = filters?.sortBy || 'relevance'
  if (sortBy === 'date_newest') {
    correspondenceQuery = correspondenceQuery.order('entry_date', { ascending: false })
  } else if (sortBy === 'date_oldest') {
    correspondenceQuery = correspondenceQuery.order('entry_date', { ascending: true })
  } else {
    correspondenceQuery = correspondenceQuery.order('entry_date', { ascending: false })
  }

  correspondenceQuery = correspondenceQuery.limit(MAX_CORRESPONDENCE_RESULTS)

  const { data: correspondence, error: correspondenceError } = await correspondenceQuery

  if (correspondenceError) {
    console.error('Correspondence search error:', correspondenceError)
  }

  // Cap per-row text length before returning, so unusually long entries can't
  // bloat the server action response.
  const capText = (c: CorrespondenceSearchResult): CorrespondenceSearchResult => ({
    ...c,
    formatted_text_current: c.formatted_text_current?.slice(0, SNIPPET_SOURCE_CAP) ?? null,
    formatted_text_original: c.formatted_text_original?.slice(0, SNIPPET_SOURCE_CAP) ?? null,
    raw_text_original: c.raw_text_original?.slice(0, SNIPPET_SOURCE_CAP) ?? null,
  })

  const businessResults: SearchResult[] = (businesses || []).map((b) => ({
    type: 'business' as const,
    id: b.id,
    title: b.name,
    snippet: [b.category, b.status].filter(Boolean).join(' • '),
    rank: 1,
  }))

  const correspondenceResults: SearchResult[] = ((correspondence ?? []) as unknown as CorrespondenceSearchResult[])
    .map(capText)
    .map((c) => toCorrespondenceResult(c, 2))

  const allResults = [...businessResults, ...correspondenceResults].sort((a, b) => {
    const rankA = a.rank ?? 0
    const rankB = b.rank ?? 0
    if (rankA !== rankB) return rankA - rankB
    return 0
  })

  return { data: allResults }
}
