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
  source_domain: string
}

const WP_SOURCES = [
  { domain: 'chiswickcalendar.co.uk', apiBase: 'https://chiswickcalendar.co.uk/wp-json/wp/v2/posts' },
  { domain: 'keepthingslocal.com', apiBase: 'https://keepthingslocal.com/wp-json/wp/v2/posts' },
] as const

const RSS_SOURCES = [
  { domain: 'chiswickw4.com', feedUrl: 'https://www.chiswickw4.com/rss.xml' },
] as const

const NEWSLETTER_SOURCES = [
  { domain: 'chiswickw4.com', archiveUrl: 'https://www.chiswickw4.com/info/arlatest.htm', recentCount: 4 },
] as const

function parseNewsletterUrls(html: string, recentCount: number): { url: string; date: string }[] {
  const urls: { url: string; date: string }[] = []
  const regex = /href="(newsletters\/w4(\d{2})(\d{2})(\d{2})\.htm)"/gi
  let m
  while ((m = regex.exec(html)) !== null) {
    const path = m[1]
    const yy = parseInt(m[2]), mm = parseInt(m[3]), dd = parseInt(m[4])
    const year = 2000 + yy
    const date = new Date(year, mm - 1, dd)
    urls.push({ url: 'https://www.chiswickw4.com/info/' + path, date: date.toISOString().split('T')[0] })
  }
  return urls.slice(0, recentCount)
}

function parseNewsletterArticles(html: string, newsletterDate: string): { title: string; url: string; date: string }[] {
  const articles: { title: string; url: string; date: string }[] = []
  const seen = new Set<string>()
  const regex = /<a\s[^>]*?href\s*=\s*"([^"]+)"[^>]*?>([^<]{10,})<\/a>/gi
  let m
  while ((m = regex.exec(html)) !== null) {
    let url = m[1].trim()
    const title = decodeHtmlEntities(m[2].trim())

    if (url.includes('mailto:')) continue
    if (/\.(jpg|jpeg|gif|png|css|js)$/i.test(url)) continue
    if (url.includes('newsletter') && url.includes('.htm')) continue
    if (/^(click here|read more|sign up|subscribe|home|back|next|previous|chiswickw4)/i.test(title)) continue
    if (title.length > 200) continue

    if (!url.startsWith('http')) {
      if (url.startsWith('/')) url = 'https://www.chiswickw4.com' + url
      else if (url.startsWith('../')) url = 'https://www.chiswickw4.com/info/' + url.replace('../', '')
      else url = 'https://www.chiswickw4.com/info/' + url
    }

    if (seen.has(url)) continue
    seen.add(url)
    articles.push({ title, url, date: newsletterDate })
  }
  return articles
}

async function fetchNewsletterArticles(archiveUrl: string, domain: string, recentCount: number, searchTerm: string): Promise<SearchResult[]> {
  try {
    const archiveRes = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!archiveRes.ok) return []
    const archiveHtml = await archiveRes.text()

    const newsletters = parseNewsletterUrls(archiveHtml, recentCount)
    if (newsletters.length === 0) return []

    const termLower = searchTerm.toLowerCase()
    const results: SearchResult[] = []

    for (const nl of newsletters) {
      try {
        const res = await fetch(nl.url, {
          headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) continue
        const html = await res.text()
        const articles = parseNewsletterArticles(html, nl.date)

        for (const article of articles) {
          if (article.title.toLowerCase().includes(termLower)) {
            results.push({
              title: article.title,
              url: article.url,
              date: article.date,
              source_domain: domain,
            })
          }
        }
      } catch {
        continue
      }
    }

    return results
  } catch {
    return []
  }
}

type RSSItem = {
  title: string
  link: string
  pubDate: string | null
  description: string
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const title = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      ?? itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      ?? ''
    const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''
    const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? null
    const desc = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
      ?? itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1]
      ?? ''
    items.push({
      title: decodeHtmlEntities(title.trim()),
      link: link.trim(),
      pubDate,
      description: decodeHtmlEntities(desc.trim()),
    })
  }
  return items
}

async function fetchRSSFeed(feedUrl: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return []
    const xml = await response.text()
    return parseRSSItems(xml)
  } catch {
    return []
  }
}

function searchRSSItems(items: RSSItem[], searchTerm: string, domain: string, afterDate: string): SearchResult[] {
  const termLower = searchTerm.toLowerCase()
  const afterMs = new Date(afterDate).getTime()
  const results: SearchResult[] = []

  for (const item of items) {
    if (item.pubDate) {
      const itemMs = new Date(item.pubDate).getTime()
      if (!isNaN(itemMs) && itemMs < afterMs) continue
    }

    const titleLower = item.title.toLowerCase()
    const descLower = item.description.toLowerCase()
    if (!titleLower.includes(termLower) && !descLower.includes(termLower)) continue

    let date: string | null = null
    if (item.pubDate) {
      try { date = new Date(item.pubDate).toISOString().split('T')[0] } catch { /* skip */ }
    }

    results.push({
      title: item.title,
      url: item.link,
      date,
      source_domain: domain,
    })
  }

  return results
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

async function searchWPSite(apiBase: string, domain: string, searchTerm: string, afterDate: string): Promise<SearchResult[]> {
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
        `${apiBase}?${params}`,
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
          source_domain: domain,
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

async function searchAllSources(searchTerm: string, afterDate: string): Promise<SearchResult[]> {
  const allResults: SearchResult[] = []
  for (const source of WP_SOURCES) {
    const results = await searchWPSite(source.apiBase, source.domain, searchTerm, afterDate)
    allResults.push(...results)
  }
  for (const source of RSS_SOURCES) {
    const items = await fetchRSSFeed(source.feedUrl)
    const results = searchRSSItems(items, searchTerm, source.domain, afterDate)
    allResults.push(...results)
  }
  for (const source of NEWSLETTER_SOURCES) {
    const results = await fetchNewsletterArticles(source.archiveUrl, source.domain, source.recentCount, searchTerm)
    allResults.push(...results)
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

  const results = await searchAllSources(business.name, afterDate)

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
          source_domain: result.source_domain,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          found_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,url', ignoreDuplicates: true }
      )
    if (!error) newCount++
  }

  revalidatePath(`/businesses/${businessId}`)
  return { found: results.length, new_count: newCount }
}

export type ArticleWithBusiness = BusinessArticle & {
  business_name: string
}

export async function getAllArticles(includeStatuses: ('confirmed' | 'pending')[] = ['confirmed', 'pending']): Promise<ArticleWithBusiness[]> {
  const org_id = await getCurrentUserOrganizationId()
  if (!org_id) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_articles')
    .select('*, business:businesses!business_articles_business_id_fkey(name)')
    .eq('organization_id', org_id)
    .in('status', includeStatuses)
    .order('published_date', { ascending: false, nullsFirst: false })
  return (data ?? []).map((a: Record<string, unknown>) => ({
    ...(a as unknown as BusinessArticle),
    business_name: (a.business as { name: string } | null)?.name ?? 'Unknown',
  }))
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
