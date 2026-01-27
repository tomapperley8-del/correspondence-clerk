'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const searchQuerySchema = z.string().min(2, 'Search query must be at least 2 characters')

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
  type?: 'Email' | 'Call' | 'Meeting' | ''
  sortBy?: 'relevance' | 'date_newest' | 'date_oldest'
}

/**
 * Full-text search across businesses and correspondence
 * Uses existing tsvector + GIN indexes
 * Prioritizes business name matches over keyword matches
 * Supports filtering by date range, direction, type, and sorting
 */
export async function searchAll(query: string, filters?: SearchFilters) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  if (!query.trim()) {
    return { data: [] }
  }

  const parsed = searchQuerySchema.safeParse(query.trim())
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Search businesses by name (prioritized)
  const { data: businesses, error: businessError } = await supabase
    .from('businesses')
    .select('id, name, category, status')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(10)

  if (businessError) {
    console.error('Business search error:', businessError)
  }

  // Search correspondence using GIN full-text index (search_vector column)
  // Convert query to tsquery format: split words and join with &
  const tsQuery = query.trim().split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(Boolean).join(' & ')

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
      businesses!inner(name),
      contacts!inner(name)
    `
    )
    .textSearch('search_vector', tsQuery)

  // Apply filters
  if (filters?.dateFrom) {
    correspondenceQuery = correspondenceQuery.gte('entry_date', filters.dateFrom)
  }
  if (filters?.dateTo) {
    correspondenceQuery = correspondenceQuery.lte('entry_date', filters.dateTo + 'T23:59:59')
  }
  if (filters?.direction) {
    correspondenceQuery = correspondenceQuery.eq('direction', filters.direction)
  }
  if (filters?.type) {
    correspondenceQuery = correspondenceQuery.eq('type', filters.type)
  }

  // Apply sort
  const sortBy = filters?.sortBy || 'relevance'
  if (sortBy === 'date_newest') {
    correspondenceQuery = correspondenceQuery.order('entry_date', { ascending: false })
  } else if (sortBy === 'date_oldest') {
    correspondenceQuery = correspondenceQuery.order('entry_date', { ascending: true })
  } else {
    // Relevance — textSearch already ranks by relevance, order by date as tiebreaker
    correspondenceQuery = correspondenceQuery.order('entry_date', { ascending: false })
  }

  correspondenceQuery = correspondenceQuery.limit(50)

  const { data: correspondence, error: correspondenceError } = await correspondenceQuery

  if (correspondenceError) {
    console.error('Correspondence search error:', correspondenceError)
  }

  // Transform results into unified format
  const businessResults: SearchResult[] = (businesses || []).map((b) => ({
    type: 'business' as const,
    id: b.id,
    title: b.name,
    snippet: [b.category, b.status].filter(Boolean).join(' • '),
    rank: 1, // Higher priority for business name matches
  }))

  const correspondenceResults: SearchResult[] = (correspondence || []).map((c: any) => {
    const text =
      c.formatted_text_current || c.formatted_text_original || c.raw_text_original || ''
    const snippet = text.length > 150 ? text.substring(0, 150) + '...' : text

    return {
      type: 'correspondence' as const,
      id: c.id,
      title: c.subject || 'Untitled',
      snippet,
      business_id: c.business_id,
      business_name: c.businesses?.name || 'Unknown Business',
      contact_name: c.contacts?.name || 'Unknown Contact',
      entry_date: c.entry_date,
      direction: c.direction,
      correspondence_type: c.type,
      rank: 2, // Lower priority than business matches
    }
  })

  // Combine and sort: businesses first, then correspondence
  const allResults = [...businessResults, ...correspondenceResults].sort((a, b) => {
    const rankA = a.rank ?? 0
    const rankB = b.rank ?? 0
    if (rankA !== rankB) return rankA - rankB
    return 0
  })

  return { data: allResults }
}
