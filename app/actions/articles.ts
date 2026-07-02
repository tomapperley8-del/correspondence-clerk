'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'

export type BusinessArticle = {
  id: string
  organization_id: string
  business_id: string
  url: string
  title: string
  published_date: string | null
  source_domain: string
  status: 'pending' | 'confirmed' | 'rejected'
  found_at: string
  confirmed_at: string | null
}

export async function getArticlesForBusiness(businessId: string): Promise<BusinessArticle[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_articles')
    .select('*')
    .eq('business_id', businessId)
    .in('status', ['pending', 'confirmed'])
    .order('published_date', { ascending: false, nullsFirst: false })
  return (data ?? []) as BusinessArticle[]
}

export async function getPendingArticlesCount(): Promise<number> {
  const org_id = await getCurrentUserOrganizationId()
  if (!org_id) return 0
  const supabase = await createClient()
  const { count } = await supabase
    .from('business_articles')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org_id)
    .eq('status', 'pending')
  return count ?? 0
}

export async function confirmArticle(articleId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('business_articles')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', articleId)
  if (error) return { success: false }
  return { success: true }
}

export async function rejectArticle(articleId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('business_articles')
    .update({ status: 'rejected' })
    .eq('id', articleId)
  if (error) return { success: false }
  return { success: true }
}

type SearchResult = {
  title: string
  url: string
  date: string | null
}

type WPPost = {
  title: { rendered: string }
  link: string
  date: string
  type: string
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

async function searchWPApi(searchTerm: string, afterDate: string): Promise<SearchResult[]> {
  const allResults: SearchResult[] = []
  const perPage = 100

  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({
      search: searchTerm,
      per_page: String(perPage),
      page: String(page),
      after: afterDate,
      orderby: 'date',
      order: 'desc',
      _fields: 'title,link,date,type',
    })

    try {
      const response = await fetch(
        `https://chiswickcalendar.co.uk/wp-json/wp/v2/posts?${params}`,
        {
          headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
          signal: AbortSignal.timeout(15000),
        }
      )

      if (!response.ok) break

      const posts: WPPost[] = await response.json()
      if (posts.length === 0) break

      for (const post of posts) {
        allResults.push({
          title: decodeHtmlEntities(post.title.rendered),
          url: post.link,
          date: post.date ? post.date.split('T')[0] : null,
        })
      }

      const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10)
      if (page >= totalPages) break
    } catch {
      break
    }
  }

  return allResults
}

export async function scanBusinessForArticles(
  businessId: string
): Promise<{ found: number; new_count: number; error?: string }> {
  const org_id = await getCurrentUserOrganizationId()
  if (!org_id) return { found: 0, new_count: 0, error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single()

  if (!business) return { found: 0, new_count: 0, error: 'Business not found' }

  const fiveYearsAgo = new Date()
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
  const afterDate = fiveYearsAgo.toISOString()

  const results = await searchWPApi(business.name, afterDate)

  let newCount = 0
  for (const result of results) {
    const { error } = await supabase
      .from('business_articles')
      .upsert(
        {
          organization_id: org_id,
          business_id: businessId,
          url: result.url,
          title: result.title,
          published_date: result.date,
          source_domain: 'chiswickcalendar.co.uk',
          status: 'pending',
          found_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,url', ignoreDuplicates: true }
      )
    if (!error) newCount++
  }

  revalidatePath(`/businesses/${businessId}`)
  return { found: results.length, new_count: newCount }
}

export async function scanAllBusinessesForArticles(): Promise<{
  scanned: number
  total_found: number
  total_new: number
}> {
  const org_id = await getCurrentUserOrganizationId()
  if (!org_id) return { scanned: 0, total_found: 0, total_new: 0 }

  const supabase = await createClient()
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id')
    .eq('organization_id', org_id)

  if (!businesses || businesses.length === 0) {
    return { scanned: 0, total_found: 0, total_new: 0 }
  }

  let totalFound = 0
  let totalNew = 0

  for (const biz of businesses) {
    const result = await scanBusinessForArticles(biz.id)
    totalFound += result.found
    totalNew += result.new_count
    // Rate limit: wait 1s between businesses to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return { scanned: businesses.length, total_found: totalFound, total_new: totalNew }
}
