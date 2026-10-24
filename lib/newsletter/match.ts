/**
 * Finds the businesses a newsletter issue mentions (Stage 16a). Plain rules, no AI.
 *
 *   club_card_page  a link to the business's Club Card page on chiswickcalendar.co.uk  -> confirmed
 *   website         a link to the business's own website (businesses.website, or the
 *                   website on its Club Card page)                                       -> confirmed,
 *                   unless several businesses share that website                          -> unclear
 *   name            the business name, written with a capital, as whole words             -> confirmed,
 *                   unless the name is short, one word, in most issues (over 60%), only part of a
 *                   longer name found in the same place, or the business is unreviewed   -> unclear
 *
 * One mention per issue and business, the strongest kind first.
 */

export interface MatchBusiness {
  id: string
  name: string
  status: string | null
  website: string | null
}

export interface MatchCardPage {
  businessId: string
  link: string
  websiteHost: string | null
}

export interface MatchIssue {
  id: string
  text: string
}

export type MatchKind = 'club_card_page' | 'website' | 'name'

export interface FoundMention {
  issueId: string
  businessId: string
  kind: MatchKind
  matchedText: string
  context: string
  status: 'confirmed' | 'unclear'
  unclearReason: string | null
}

const KIND_ORDER: Record<MatchKind, number> = { club_card_page: 0, website: 1, name: 2 }

/** Sites that are not any one business's own (ours, Mailchimp, ticketing, social media, links). */
const SHARED_HOSTS = new Set([
  'chiswickcalendar.co.uk', 'thechiswickcalendar.co.uk', 'list-manage.com', 'mailchi.mp', 'mailchimp.com',
  'campaign-archive.com', 'eventbrite.co.uk', 'eventbrite.com', 'facebook.com', 'fb.com', 'instagram.com',
  'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'google.com', 'google.co.uk', 'goo.gl', 'bit.ly',
  'linkedin.com', 'tiktok.com', 'wa.me', 'linktr.ee', 'apple.com', 'amazon.co.uk', 'amazon.com',
  'ticketsource.co.uk', 'tickettailor.com', 'wordpress.com', 'wixsite.com', 'squarespace.com', 'gov.uk',
  'hounslow.gov.uk', 'opentable.co.uk', 'opentable.com', 'resdiary.com', 'designmynight.com', 'tfl.gov.uk',
  'bbc.co.uk', 'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'zoom.us',
])

const TWO_PART_SUFFIXES = /\.(co|org|ac|gov|me|ltd|plc|net|sch|nhs|police)\.uk$|\.com\.au$|\.co\.nz$/

/** chiswickcalendar.co.uk from https://www.shop.chiswickcalendar.co.uk/x */
export function baseDomain(hostOrUrl: string | null | undefined): string | null {
  if (!hostOrUrl) return null
  let host = hostOrUrl.trim().toLowerCase()
  if (!host) return null
  try {
    host = new URL(/^[a-z]+:\/\//.test(host) ? host : `http://${host}`).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\d?\./, '').replace(/\.$/, '')
  if (!host.includes('.')) return null
  const labels = host.split('.')
  const keep = TWO_PART_SUFFIXES.test(host) ? 3 : 2
  return labels.slice(-keep).join('.')
}

/** Path of a chiswickcalendar.co.uk page, lower case, no query, with one trailing slash. */
export function calendarPath(url: string): string | null {
  try {
    const u = new URL(url)
    if (baseDomain(u.hostname) !== 'chiswickcalendar.co.uk') return null
    return decodeURIComponent(u.pathname).toLowerCase().replace(/\/+$/, '') + '/'
  } catch {
    return null
  }
}

export function urlsIn(text: string): string[] {
  return (text.match(/https?:\/\/[^\s)>"'\]]+/gi) ?? []).map((u) => u.replace(/[.,;:]+$/, ''))
}

function normaliseText(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'").replace(/[–—]/g, '-').replace(/ /g, ' ')
}

/** The part of a business name to look for: no "Ltd", no bracketed notes, no leading "The". */
export function coreName(name: string): string {
  return normaliseText(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+-\s+.*$/, '') // "Name - branch or note"
    .replace(/[,.]?\s+(ltd\.?|limited|llp|plc|inc\.?|cic|& co\.?)$/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function nameRegex(core: string): RegExp {
  const body = core
    .split(' ')
    .map((w) => (w === '&' || w.toLowerCase() === 'and' ? '(?:&|and)' : escapeRe(w).replace(/'/g, "'?")))
    .join('\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu')
}

function contextAt(text: string, start: number, end: number): string {
  const a = Math.max(0, start - 90)
  const b = Math.min(text.length, end + 90)
  return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`
}

function isOwnName(core: string) {
  return /chiswick calendar/i.test(core)
}

interface NameHit {
  businessId: string
  start: number
  end: number
}

/**
 * Matches every issue against every business. The whole set is passed at once so that names found in
 * most issues (a place, a street, a regular column) can be told apart from real mentions.
 */
export function matchIssues(
  issues: MatchIssue[],
  businesses: MatchBusiness[],
  cardPages: MatchCardPage[]
): FoundMention[] {
  const live = businesses.filter((b) => b.status !== 'Not a business')
  const byId = new Map(live.map((b) => [b.id, b]))

  // Club Card page paths -> business
  const pageByPath = new Map<string, string>()
  for (const p of cardPages) {
    if (!byId.has(p.businessId)) continue
    const path = calendarPath(p.link)
    if (path && path.split('/').filter(Boolean).length >= 2) pageByPath.set(path, p.businessId)
  }

  // Website base domain -> businesses
  const bizByDomain = new Map<string, Set<string>>()
  const addDomain = (d: string | null, id: string) => {
    if (!d || SHARED_HOSTS.has(d)) return
    if (!bizByDomain.has(d)) bizByDomain.set(d, new Set())
    bizByDomain.get(d)!.add(id)
  }
  for (const b of live) addDomain(baseDomain(b.website), b.id)
  for (const p of cardPages) if (byId.has(p.businessId)) addDomain(baseDomain(p.websiteHost), p.businessId)

  // Names
  const names = live
    .map((b) => ({ b, core: coreName(b.name) }))
    .filter(({ core }) => core.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && !isOwnName(core))
    .map(({ b, core }) => ({ b, core, lower: core.toLowerCase(), firstLower: core.split(' ')[0].toLowerCase(), re: nameRegex(core) }))

  const texts = issues.map((i) => ({ id: i.id, text: normaliseText(i.text) }))
  const lowerTexts = texts.map((t) => t.text.toLowerCase())

  // Pass 1: name hits per issue (proper-case only), and how many issues each name is in
  const hitsByIssue: NameHit[][] = texts.map(() => [])
  const issuesWithName = new Map<string, number>()
  texts.forEach((t, idx) => {
    const lower = lowerTexts[idx]
    for (const n of names) {
      if (!lower.includes(n.firstLower)) continue
      n.re.lastIndex = 0
      let m: RegExpExecArray | null
      let found = false
      while ((m = n.re.exec(t.text))) {
        const first = m[0][0]
        if (first !== first.toUpperCase()) continue // "bread and butter", not "Bread & Butter"
        hitsByIssue[idx].push({ businessId: n.b.id, start: m.index, end: m.index + m[0].length })
        found = true
      }
      if (found) issuesWithName.set(n.b.id, (issuesWithName.get(n.b.id) ?? 0) + 1)
    }
  })
  const nameInfo = new Map(names.map((n) => [n.b.id, n]))
  // A name in most issues is a standing feature (a weekly listing, the council): Tom confirms it once
  const frequent = (id: string) => issues.length >= 8 && (issuesWithName.get(id) ?? 0) / issues.length > 0.6

  const out: FoundMention[] = []
  texts.forEach((t, idx) => {
    const best = new Map<string, FoundMention>()
    const offer = (f: FoundMention) => {
      const cur = best.get(f.businessId)
      if (
        !cur ||
        (cur.status === 'unclear' && f.status === 'confirmed') ||
        (cur.status === f.status && KIND_ORDER[f.kind] < KIND_ORDER[cur.kind])
      ) best.set(f.businessId, f)
    }

    for (const url of urlsIn(t.text)) {
      const start = t.text.indexOf(url)
      const path = calendarPath(url)
      if (path) {
        const biz = pageByPath.get(path)
        if (biz) offer({ issueId: t.id, businessId: biz, kind: 'club_card_page', matchedText: url.split('?')[0], context: contextAt(t.text, start, start + url.length), status: 'confirmed', unclearReason: null })
        continue
      }
      const d = baseDomain(url)
      const owners = d ? bizByDomain.get(d) : undefined
      if (!owners) continue
      const shared = owners.size > 1
      for (const biz of owners) {
        offer({
          issueId: t.id, businessId: biz, kind: 'website', matchedText: d!,
          context: contextAt(t.text, start, start + url.length),
          status: shared ? 'unclear' : 'confirmed',
          unclearReason: shared ? `${owners.size} businesses have the website ${d}` : null,
        })
      }
    }

    const hits = hitsByIssue[idx]
    const byBiz = new Map<string, NameHit[]>()
    for (const h of hits) {
      if (!byBiz.has(h.businessId)) byBiz.set(h.businessId, [])
      byBiz.get(h.businessId)!.push(h)
    }
    for (const [biz, own] of byBiz) {
      const n = nameInfo.get(biz)!
      // Hits that are only part of a longer name found at the same place
      const free = own.filter((h) => !hits.some((o) => o.businessId !== biz && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start))
      const h = free[0] ?? own[0]
      const words = n.core.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w))
      let reason: string | null = null
      if (free.length === 0) {
        const longer = hits.find((o) => o.businessId !== biz && o.start <= own[0].start && o.end >= own[0].end)
        reason = `only inside the longer name "${longer ? t.text.slice(longer.start, longer.end) : ''}"`
      } else if (n.core.replace(/[^\p{L}\p{N}]/gu, '').length < 5) reason = 'short name'
      else if (words.length === 1) reason = 'one-word name'
      else if (frequent(biz)) reason = `name is in ${issuesWithName.get(biz)} of ${issues.length} issues`
      else if (n.b.status === 'Unreviewed') reason = 'business not reviewed yet'
      offer({
        issueId: t.id, businessId: biz, kind: 'name', matchedText: t.text.slice(h.start, h.end),
        context: contextAt(t.text, h.start, h.end), status: reason ? 'unclear' : 'confirmed', unclearReason: reason,
      })
    }

    out.push(...best.values())
  })
  return out
}
