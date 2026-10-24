/**
 * Reads issues of The Chiswick Calendar Newsletter from Mailchimp's public archive (Stage 16a).
 * Public pages, no login, no API key: the same pages anyone gets from "view in browser". Nothing is
 * sent. The archive lists the latest 20 issues only, so this is read weekly and the store grows.
 */

export const NEWSLETTER_SUBJECT = 'The Chiswick Calendar Newsletter'

/** The Chiswick Calendar's Mailchimp list (u = account, id = audience), from the newsletter's own links. */
export const ARCHIVE_HOME = 'https://us11.campaign-archive.com/home/?u=6a8297e6171166ea052fb1b10&id=fa3bfa32fe'

// Mailchimp's archive refuses requests without a browser-like user agent.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,*/*',
  'Accept-Language': 'en-GB',
}

export interface ArchiveListing {
  url: string // eepurl.com short link
  sentOn: string // YYYY-MM-DD
  title: string
}

export interface NewsletterIssueIn {
  sourceId: string // Mailchimp campaign id (the mc_cid in the issue's links)
  sentAt: string // ISO
  subject: string
  plainText: string
  browserUrl: string | null
}

async function get(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return { html: await res.text(), finalUrl: res.url }
}

/** The issues the archive lists, newest first. */
export async function listArchive(): Promise<ArchiveListing[]> {
  const { html } = await get(ARCHIVE_HOME)
  const out: ArchiveListing[] = []
  const re = /<li class="campaign">\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*<a href="([^"]+)"[^>]*title="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, mm, dd, yyyy, url, title] = m
    out.push({ url, sentOn: `${yyyy}-${mm}-${dd}`, title: decodeEntities(title).trim() })
  }
  if (out.length === 0) throw new Error('the Mailchimp archive page listed no issues (layout changed?)')
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&lsquo;|&#821[67];/g, "'")
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&pound;/g, '£')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
}

/** HTML to text that keeps each link's address, like Mailchimp's own text version: "label (url)". */
export function htmlToTextWithLinks(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
        const text = label.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        return text ? `${text} (${href})` : ` ${href} `
      })
      .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr|\/table)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** One issue's page: the email body only (not Mailchimp's toolbar), as text with links kept. */
export async function fetchArchivedIssue(listing: ArchiveListing): Promise<NewsletterIssueIn> {
  const { html, finalUrl } = await get(listing.url)
  const sourceId =
    new URL(finalUrl).searchParams.get('id') ??
    html.match(/mc_cid=([0-9a-f]{10})/)?.[1] ??
    listing.url
  const start = html.indexOf('id="bodyTable"')
  const body = start >= 0 ? html.slice(html.lastIndexOf('<', start)) : html
  const browserUrl = html.match(/https:\/\/mailchi\.mp\/thechiswickcalendar\/[^"'?\s<]+/)?.[0] ?? listing.url
  return {
    sourceId,
    // The archive gives the day only; noon UTC keeps it on the right London date.
    sentAt: `${listing.sentOn}T12:00:00Z`,
    subject: listing.title,
    plainText: htmlToTextWithLinks(body),
    browserUrl,
  }
}
