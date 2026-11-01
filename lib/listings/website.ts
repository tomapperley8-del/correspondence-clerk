// Reads the public What's On calendar on chiswickcalendar.co.uk (The Events Calendar's REST
// API, /wp-json/tribe/events/v1). Free, no key, never writes to the website.
// The API's `author` is one shared login on every event, so it can't tell who listed one.

import { normaliseTitle, titleScore, titleWords, type EventLink } from './parse'

const SITE = 'https://chiswickcalendar.co.uk'
const API = `${SITE}/wp-json/tribe/events/v1/events`
const USER_AGENT = 'CorrespondenceClerk/1.0'

export type WebEvent = {
  id: number
  title: string
  url: string
  published_at: string | null
  starts_at: string | null
}

type TribeEvent = { id: number; title: string; url: string; date_utc?: string; start_date?: string; utc_start_date?: string }

const decode = (s: string) =>
  s.replace(/&#8211;|&#8212;/g, '-').replace(/&#8217;|&#8216;/g, "'").replace(/&#038;|&amp;/g, '&').replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#\d+;/g, '')
const utc = (s?: string) => (s ? `${s.replace(' ', 'T')}Z` : null)

function toEvent(e: TribeEvent): WebEvent {
  return { id: e.id, title: decode(e.title), url: e.url, published_at: utc(e.date_utc), starts_at: utc(e.utc_start_date) }
}

async function getJson<T>(url: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000), cache: 'no-store' })
  if (res.status === 404) return { status: 404, data: null }
  if (!res.ok) throw new Error(`${res.status} from ${url.replace(SITE, '')}`)
  return { status: res.status, data: (await res.json()) as T }
}

// The events on one day, read once per run (a link names its day; by-slug refuses many slugs).
const dayCache = new Map<string, Promise<TribeEvent[]>>()
function eventsOn(day: string): Promise<TribeEvent[]> {
  if (!dayCache.has(day)) {
    dayCache.set(day, (async () => {
      const out: TribeEvent[] = []
      for (let page = 1; page <= 6; page++) {
        const { data } = await getJson<{ events?: TribeEvent[]; total_pages?: number }>(
          `${API}?start_date=${day}%2000:00:00&end_date=${day}%2023:59:59&per_page=50&page=${page}`,
        )
        out.push(...(data?.events ?? []))
        if (!data || page >= (data.total_pages ?? 1)) break
      }
      return out
    })())
  }
  return dayCache.get(day)!
}

export function clearDayCache() {
  dayCache.clear()
}

const sameSlug = (url: string, slug: string) => url.includes(`/event/${slug}/`)

/** The event a link points at. Null when the website no longer has it. */
export async function eventByLink(link: EventLink): Promise<WebEvent | null> {
  if (link.date) {
    const hit = (await eventsOn(link.date)).find((e) => e.url === link.url) ??
      (await eventsOn(link.date)).find((e) => sameSlug(e.url, link.slug))
    if (hit) return toEvent(hit)
  }
  const res = await fetch(`${API}/by-slug/${encodeURIComponent(link.slug)}`, {
    headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000), cache: 'no-store',
  })
  if (res.ok) {
    const ev = toEvent((await res.json()) as TribeEvent)
    if (link.date) ev.url = link.url
    return ev
  }
  if (res.status !== 400 && res.status !== 404) throw new Error(`${res.status} from the events calendar`)
  // Last try: search on the slug's words and take the event with this slug.
  const q = link.slug.split('-').filter((w) => w.length > 3).slice(0, 3).join(' ')
  const { data } = await getJson<{ events?: TribeEvent[] }>(`${API}?search=${encodeURIComponent(q)}&start_date=2020-01-01&per_page=50`)
  const hit = (data?.events ?? []).find((e) => sameSlug(e.url, link.slug))
  return hit ? toEvent(hit) : null
}

export type TitleMatch = { event: WebEvent; score: number; sure: boolean }

/**
 * Looks for an event published after the request came in whose title matches the request's.
 * Sure: every word of the request title is in the event's (and there are at least two), or the
 * titles are the same. Possible: at least half. Events Tom rejected are skipped.
 */
export async function findByTitle(title: string, askedAt: string, rejected: number[]): Promise<TitleMatch | null> {
  const words = titleWords(title)
  if (words.length === 0) return null
  const longest = [...words].sort((x, y) => y.length - x.length)
  const asked = new Date(askedAt)
  const from = new Date(asked.getTime() - 86400000).toISOString().slice(0, 10)
  const tries = [longest.slice(0, 3).join(' ')]
  if (longest.length > 1) tries.push(longest[0])

  for (const q of tries) {
    const { data } = await getJson<{ events?: TribeEvent[] }>(
      `${API}?search=${encodeURIComponent(q)}&start_date=${from}&per_page=30`,
    )
    const events = (data?.events ?? []).map(toEvent)
      .filter((e) => !rejected.includes(e.id) && (!e.published_at || new Date(e.published_at).getTime() >= asked.getTime() - 86400000))
    let best: TitleMatch | null = null
    for (const ev of events) {
      const score = titleScore(title, ev.title)
      const same = normaliseTitle(title) === normaliseTitle(ev.title)
      const sure = same || (score === 1 && words.length >= 2)
      if (score < 0.5 && !same) continue
      // Highest score wins; on a tie, the first date of a repeating event.
      if (!best || score > best.score || (score === best.score && (ev.starts_at ?? '') < (best.event.starts_at ?? ''))) {
        best = { event: ev, score, sure }
      }
    }
    if (best) return best
  }
  return null
}
