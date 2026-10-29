/**
 * Finds the businesses a newsletter issue mentions (Stage 16a). Plain rules, no AI.
 *
 *   club_card_page  a link to the business's Club Card page on chiswickcalendar.co.uk  -> confirmed
 *   website         a link to the business's own website (businesses.website, or the
 *                   website on its Club Card page)                                       -> confirmed,
 *                   unless several businesses share that website                          -> unclear
 *   name            the business name (or an alias Tom gave it), written with a capital,
 *                   as whole words                                                         -> confirmed,
 *                   unless the name is short, one word, in most issues (over 60%), inside a
 *                   longer business name found in the same place, next to another capitalised
 *                   word (part of a different name: "Aussie Gourmet Kitchen", "Gunnersbury
 *                   Park"), or the business is unreviewed                                  -> unclear
 *
 * Tom's rules (newsletter_match_rules) come first: never (no name matching for that business),
 * always (its name matches are sure), alias (another name for it, always sure), ignore_phrase (text
 * that is never a mention, e.g. "Jazz at George IV"). Internal and Contributor records (the editor,
 * staff, writers) are never matched by name: a byline is not a business mention.
 *
 * One mention per issue and business, the strongest kind first.
 */

export interface MatchBusiness {
  id: string
  name: string
  status: string | null
  businessType: string | null
  website: string | null
}

export interface MatchRules {
  always: Set<string>
  never: Set<string>
  aliases: { businessId: string; phrase: string }[]
  ignorePhrases: string[]
}

export const NO_RULES: MatchRules = { always: new Set(), never: new Set(), aliases: [], ignorePhrases: [] }

/** Our own people: their names in a byline or column are not a business mention. */
const NAME_SKIP_TYPES = new Set(['internal', 'contributor'])

/** Capitalised words that can sit next to a name without making it part of a longer name. */
const NEXT_TO_NAME_OK = new Set([
  'the', 'a', 'an', 'at', 'in', 'on', 'of', 'for', 'and', 'to', 'by', 'with', 'from', 'as', 'or', 'is',
  'read', 'more', 'see', 'visit', 'i', 'we', 'our', 'their', 'his', 'her', 'its', 'this', 'that', 'new',
  'why', 'how', 'what', 'when', 'where', 'who', 'councillor', 'councillors', 'mp', 'chiswick',
])

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

export const KIND_ORDER: Record<MatchKind, number> = { club_card_page: 0, website: 1, name: 2 }

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
  alias: boolean
}

/** "Aussie Gourmet Kitchen" for a hit on "Kitchen": the hit with the capitalised words beside it, if any. */
function capitalisedNeighbour(text: string, start: number, end: number): string | null {
  const before = text.slice(Math.max(0, start - 40), start).match(/([\p{L}][\p{L}\p{N}'-]*)[ \t]+$/u)?.[1]
  const after = text.slice(end, end + 40).match(/^[ \t]+([\p{L}][\p{L}\p{N}'-]*)/u)?.[1]
  const isName = (w?: string) => !!w && w[0] !== w[0].toLowerCase() && !NEXT_TO_NAME_OK.has(w.toLowerCase())
  if (!isName(before) && !isName(after)) return null
  return `${isName(before) ? before + ' ' : ''}${text.slice(start, end)}${isName(after) ? ' ' + after : ''}`
}

/**
 * Matches every issue against every business. The whole set is passed at once so that names found in
 * most issues (a place, a street, a regular column) can be told apart from real mentions.
 */
export function matchIssues(
  issues: MatchIssue[],
  businesses: MatchBusiness[],
  cardPages: MatchCardPage[],
  rules: MatchRules = NO_RULES
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

  // Names: each business's own name, unless Tom said never or it is one of our own people; plus aliases
  const toName = (businessId: string, core: string, alias: boolean) =>
    ({ businessId, core, alias, firstLower: core.split(' ')[0].toLowerCase(), re: nameRegex(core) })
  const tidy = (p: string) => normaliseText(p).replace(/\s+/g, ' ').trim()
  const names = [
    ...live
      .filter((b) => !rules.never.has(b.id) && !NAME_SKIP_TYPES.has((b.businessType ?? '').toLowerCase()))
      .map((b) => ({ b, core: coreName(b.name) }))
      .filter(({ core }) => core.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && !isOwnName(core))
      .map(({ b, core }) => toName(b.id, core, false)),
    ...rules.aliases.filter((a) => byId.has(a.businessId)).map((a) => toName(a.businessId, tidy(a.phrase), true)),
  ]
  const ignoreRes = rules.ignorePhrases.map((p) => nameRegex(tidy(p)))

  const texts = issues.map((i) => ({ id: i.id, text: normaliseText(i.text) }))
  const lowerTexts = texts.map((t) => t.text.toLowerCase())

  // Pass 1: name hits per issue (proper-case only, outside ignored phrases), and how many issues each name is in
  const hitsByIssue: NameHit[][] = texts.map(() => [])
  const issuesWithName = new Map<string, number>()
  texts.forEach((t, idx) => {
    const lower = lowerTexts[idx]
    const ignored: [number, number][] = []
    for (const re of ignoreRes) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(t.text))) ignored.push([m.index, m.index + m[0].length])
    }
    const seen = new Set<string>()
    for (const n of names) {
      if (!lower.includes(n.firstLower)) continue
      n.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = n.re.exec(t.text))) {
        const first = m[0][0]
        if (first !== first.toUpperCase()) continue // "bread and butter", not "Bread & Butter"
        const s = m.index
        const e = m.index + m[0].length
        if (ignored.some(([a, b]) => a <= s && b >= e)) continue
        hitsByIssue[idx].push({ businessId: n.businessId, start: s, end: e, alias: n.alias })
        seen.add(n.businessId)
      }
    }
    for (const id of seen) issuesWithName.set(id, (issuesWithName.get(id) ?? 0) + 1)
  })
  const coreOf = new Map(names.filter((n) => !n.alias).map((n) => [n.businessId, n.core]))
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
    const inLonger = (h: NameHit) =>
      hits.find((o) => o.businessId !== h.businessId && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start)
    for (const h of hits) {
      const biz = h.businessId
      let reason: string | null = null
      if (!h.alias && !rules.always.has(biz)) {
        const core = coreOf.get(biz) ?? ''
        const longer = inLonger(h)
        const neighbour = longer ? null : capitalisedNeighbour(t.text, h.start, h.end)
        if (longer) reason = `only inside the longer name "${t.text.slice(longer.start, longer.end)}"`
        else if (neighbour) reason = `part of a longer name "${neighbour}"`
        else if (core.replace(/[^\p{L}\p{N}]/gu, '').length < 5) reason = 'short name'
        else if (core.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length === 1) reason = 'one-word name'
        else if (frequent(biz)) reason = `name is in ${issuesWithName.get(biz)} of ${issues.length} issues`
        else if (byId.get(biz)?.status === 'Unreviewed') reason = 'business not reviewed yet'
      }
      offer({
        issueId: t.id, businessId: biz, kind: 'name', matchedText: t.text.slice(h.start, h.end),
        context: contextAt(t.text, h.start, h.end), status: reason ? 'unclear' : 'confirmed', unclearReason: reason,
      })
    }

    out.push(...best.values())
  })
  return out
}
