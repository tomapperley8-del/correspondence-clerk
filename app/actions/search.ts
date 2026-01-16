'use server'

import { createClient } from '@/lib/supabase/server'

export interface SearchResult {
  type: 'business' | 'correspondence'
  id: string
  title: string
  snippet: string
  business_id?: string
  business_name?: string
  contact_name?: string
  entry_date?: string
  rank?: number
}

/**
 * Full-text search across businesses and correspondence
 * Uses existing tsvector + GIN indexes
 * Prioritizes business name matches over keyword matches
 */
export async function searchAll(query: string) {
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

  // Search correspondence using full-text search
  const { data: correspondence, error: correspondenceError } = await supabase
    .from('correspondence')
    .select(
      `
      id,
      subject,
      formatted_text_current,
      formatted_text_original,
      raw_text_original,
      entry_date,
      business_id,
      businesses!inner(name),
      contacts!inner(name)
    `
    )
    .or(
      `subject.ilike.%${query}%,formatted_text_current.ilike.%${query}%,formatted_text_original.ilike.%${query}%,raw_text_original.ilike.%${query}%`
    )
    .order('entry_date', { ascending: false })
    .limit(20)

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
      rank: 2, // Lower priority than business matches
    }
  })

  // Combine and sort: businesses first, then correspondence
  const allResults = [...businessResults, ...correspondenceResults].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return 0
  })

  return { data: allResults }
}
