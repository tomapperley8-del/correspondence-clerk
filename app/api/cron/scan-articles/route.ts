import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { Resend } from 'resend'

export const maxDuration = 300

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

type WPPost = {
  title: { rendered: string }
  link: string
  date: string
}

async function searchWPApi(apiBase: string, domain: string, searchTerm: string, afterDate: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
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
      const response = await fetch(`${apiBase}?${params}`, {
        headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) break
      const posts: WPPost[] = await response.json()
      if (posts.length === 0) break
      for (const post of posts) {
        results.push({
          title: decodeHtmlEntities(post.title.rendered),
          url: post.link,
          date: post.date ? post.date.split('T')[0] : null,
          source_domain: domain,
        })
      }
      const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10)
      if (page >= totalPages) break
    } catch { break }
  }
  return results
}

type RSSItem = { title: string; link: string; pubDate: string | null; description: string }

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const title = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      ?? itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''
    const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''
    const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? null
    const desc = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
      ?? itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? ''
    items.push({
      title: decodeHtmlEntities(title.trim()),
      link: link.trim(),
      pubDate,
      description: decodeHtmlEntities(desc.trim()),
    })
  }
  return items
}

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

type PreFetchedSource = {
  domain: string
  items: { title: string; url: string; date: string | null; description?: string }[]
}

async function preFetchRSS(): Promise<PreFetchedSource[]> {
  const results: PreFetchedSource[] = []
  for (const source of RSS_SOURCES) {
    try {
      const res = await fetch(source.feedUrl, {
        headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const items = parseRSSItems(xml)
      results.push({
        domain: source.domain,
        items: items.map(i => ({
          title: i.title,
          url: i.link,
          date: i.pubDate ? (() => { try { return new Date(i.pubDate).toISOString().split('T')[0] } catch { return null } })() : null,
          description: i.description,
        })),
      })
    } catch { /* skip */ }
  }
  return results
}

async function preFetchNewsletters(): Promise<PreFetchedSource[]> {
  const results: PreFetchedSource[] = []
  for (const source of NEWSLETTER_SOURCES) {
    try {
      const archiveRes = await fetch(source.archiveUrl, {
        headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!archiveRes.ok) continue
      const archiveHtml = await archiveRes.text()
      const newsletters = parseNewsletterUrls(archiveHtml, source.recentCount)
      const allArticles: { title: string; url: string; date: string | null }[] = []
      for (const nl of newsletters) {
        try {
          const res = await fetch(nl.url, {
            headers: { 'User-Agent': 'CorrespondenceClerk/1.0' },
            signal: AbortSignal.timeout(15000),
          })
          if (!res.ok) continue
          const html = await res.text()
          allArticles.push(...parseNewsletterArticles(html, nl.date))
        } catch { continue }
      }
      results.push({ domain: source.domain, items: allArticles })
    } catch { /* skip */ }
  }
  return results
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchBusinessInItems(
  businessName: string,
  items: { title: string; url: string; date: string | null; description?: string }[],
  domain: string,
  afterDate: string
): SearchResult[] {
  const pattern = new RegExp('\\b' + escapeRegex(businessName.toLowerCase()) + '\\b', 'i')
  const afterMs = new Date(afterDate).getTime()
  const results: SearchResult[] = []
  for (const item of items) {
    if (item.date) {
      const itemMs = new Date(item.date).getTime()
      if (!isNaN(itemMs) && itemMs < afterMs) continue
    }
    if (pattern.test(item.title) || (item.description && pattern.test(item.description))) {
      results.push({ title: item.title, url: item.url, date: item.date, source_domain: domain })
    }
  }
  return results
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function sendArticleNotification(
  email: string,
  displayName: string | null,
  newArticles: { businessName: string; title: string; url: string; source_domain: string }[]
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[scan-articles] Dev mode — would notify:', email, `${newArticles.length} new articles`)
    return
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@correspondenceclerk.com'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://correspondence-clerk.vercel.app'
  const name = displayName || 'there'

  const sourceBadge: Record<string, { label: string; bg: string; fg: string }> = {
    'chiswickcalendar.co.uk': { label: 'CC', bg: '#2C4A6E', fg: '#fff' },
    'keepthingslocal.com': { label: 'KTL', bg: '#6B7A3D', fg: '#fff' },
    'chiswickw4.com': { label: 'W4', bg: '#7C3AED', fg: '#fff' },
  }

  const rows = newArticles.slice(0, 20).map(a => {
    const badge = sourceBadge[a.source_domain] || { label: a.source_domain, bg: '#64748b', fg: '#fff' }
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
        <span style="display:inline-block;background:${badge.bg};color:${badge.fg};font-size:10px;font-weight:600;padding:2px 6px;border-radius:2px;margin-right:8px;">${badge.label}</span>
        <strong style="color:#1E293B;font-size:13px;">${escapeHtml(a.businessName)}</strong>
      </td>
    </tr>
    <tr>
      <td style="padding:0 12px 12px;">
        <a href="${a.url}" style="color:#2C4A6E;font-size:13px;text-decoration:none;">${escapeHtml(a.title)}</a>
      </td>
    </tr>`
  }).join('')

  const moreNote = newArticles.length > 20
    ? `<p style="color:#64748b;font-size:12px;text-align:center;margin:8px 0;">…and ${newArticles.length - 20} more</p>`
    : ''

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:Inter,sans-serif;font-size:14px;background:#FAFAF8;padding:24px;">
      <div style="background:#1E293B;padding:16px 24px;border-radius:4px 4px 0 0;">
        <span style="color:#fff;font-family:Georgia,serif;font-size:20px;font-weight:bold;">Correspondence Clerk</span>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid rgba(0,0,0,0.06);border-top:none;">
        <p style="color:#334155;margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
        <p style="color:#334155;margin:0 0 20px;">The weekly article scan found <strong>${newArticles.length} new article${newArticles.length === 1 ? '' : 's'}</strong> mentioning your businesses:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;">
          ${rows}
        </table>
        ${moreNote}
        <hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:24px 0;">
        <p style="text-align:center;">
          <a href="${baseUrl}/articles" style="background:#2C4A6E;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;">View all articles</a>
        </p>
      </div>
    </div>`

  const text = `Hi ${name},\n\nThe weekly article scan found ${newArticles.length} new article${newArticles.length === 1 ? '' : 's'} mentioning your businesses:\n\n${
    newArticles.slice(0, 20).map(a => `[${a.source_domain}] ${a.businessName}: ${a.title}\n${a.url}`).join('\n\n')
  }${newArticles.length > 20 ? `\n\n…and ${newArticles.length - 20} more` : ''}\n\nView all: ${baseUrl}/articles`

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: `Correspondence Clerk <${fromEmail}>`,
    to: email,
    subject: `${newArticles.length} new article${newArticles.length === 1 ? '' : 's'} found about your businesses`,
    html,
    text,
  })
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

  const [rssData, newsletterData] = await Promise.all([preFetchRSS(), preFetchNewsletters()])

  let totalScanned = 0
  let totalNew = 0

  for (const org of orgs) {
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', org.id)

    if (!businesses) continue

    const newArticlesForNotification: { businessName: string; title: string; url: string; source_domain: string }[] = []

    for (const biz of businesses) {
      const allResults: SearchResult[] = []

      for (const source of WP_SOURCES) {
        const results = await searchWPApi(source.apiBase, source.domain, biz.name, afterDate)
        allResults.push(...results)
      }

      for (const prefetched of rssData) {
        allResults.push(...matchBusinessInItems(biz.name, prefetched.items, prefetched.domain, afterDate))
      }
      for (const prefetched of newsletterData) {
        allResults.push(...matchBusinessInItems(biz.name, prefetched.items, prefetched.domain, afterDate))
      }

      for (const result of allResults) {
        const { data, error } = await supabase
          .from('business_articles')
          .upsert(
            {
              organization_id: org.id,
              business_id: biz.id,
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
          .select('id')
        if (!error && data && data.length > 0) {
          totalNew++
          newArticlesForNotification.push({
            businessName: biz.name,
            title: result.title,
            url: result.url,
            source_domain: result.source_domain,
          })
        }
      }

      totalScanned++
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    if (newArticlesForNotification.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, display_name')
          .eq('organization_id', org.id)

        if (profiles) {
          for (const profile of profiles) {
            const { data: authData } = await supabase.auth.admin.getUserById(profile.id)
            const email = authData?.user?.email
            if (email) {
              await sendArticleNotification(email, profile.display_name, newArticlesForNotification)
            }
          }
        }
      } catch (err) {
        console.error('[scan-articles] Failed to send notification:', err)
      }
    }
  }

  console.log(`[scan-articles] scanned=${totalScanned} new=${totalNew}`)
  return NextResponse.json({ scanned: totalScanned, new_articles: totalNew })
}
