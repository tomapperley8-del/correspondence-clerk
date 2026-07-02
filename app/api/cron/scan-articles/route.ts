import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const maxDuration = 300

type WPPost = {
  title: { rendered: string }
  link: string
  date: string
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

async function searchWPApi(searchTerm: string, afterDate: string) {
  const results: { title: string; url: string; date: string | null }[] = []

  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({
      search: searchTerm,
      per_page: '100',
      page: String(page),
      after: afterDate,
      orderby: 'date',
      order: 'desc',
      _fields: 'title,link,date',
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
        results.push({
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

  return results
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()

  const { data: orgs } = await supabase.from('organizations').select('id')
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: 'No organizations' })
  }

  const fiveYearsAgo = new Date()
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
  const afterDate = fiveYearsAgo.toISOString()

  let totalScanned = 0
  let totalNew = 0

  for (const org of orgs) {
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', org.id)

    if (!businesses) continue

    for (const biz of businesses) {
      const results = await searchWPApi(biz.name, afterDate)

      for (const result of results) {
        const { error } = await supabase
          .from('business_articles')
          .upsert(
            {
              organization_id: org.id,
              business_id: biz.id,
              url: result.url,
              title: result.title,
              published_date: result.date,
              source_domain: 'chiswickcalendar.co.uk',
              status: 'pending',
              found_at: new Date().toISOString(),
            },
            { onConflict: 'business_id,url', ignoreDuplicates: true }
          )
        if (!error) totalNew++
      }

      totalScanned++
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log(`[scan-articles] scanned=${totalScanned} new=${totalNew}`)
  return NextResponse.json({ scanned: totalScanned, new_articles: totalNew })
}
