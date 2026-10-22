// Matching Club Card pages to businesses (Stage 6b). Pure functions.
// A page is matched on four signals: name, phone, website and postcode.
// The sync only suggests; a page is confirmed by Tom on the review page, or by
// the sync when it is sure (two strong signals pointing at one business).

import { normaliseHost, normalisePhone, normalisePostcode } from './parse'

export type MatchCandidate = {
  id: string
  name: string
  phones: string[]
  hosts: string[]
  postcode: string | null
  had_club_card: boolean
}

export type MatchResult = {
  business_id: string | null
  score: number
  sure: boolean
  reason: string
}

const STOP = /\b(the|ltd|limited|llp|plc|chiswick|london|w4|w6|uk|co|and)\b/g

export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(STOP, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type PageSignals = {
  title: string
  page_phone: string | null
  page_website: string | null
  page_postcode: string | null
}

function sameHost(a: string, b: string): boolean {
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a)
}

/** Score every business against a page and pick the best, if it's clear. */
export function matchPage(page: PageSignals, candidates: MatchCandidate[]): MatchResult {
  const name = normaliseName(page.title)
  const phone = normalisePhone(page.page_phone)
  const host = normaliseHost(page.page_website)
  const postcode = normalisePostcode(page.page_postcode)

  const scored = candidates.map((c) => {
    const why: string[] = []
    let score = 0
    let strong = 0
    const cn = normaliseName(c.name)
    if (name && cn && cn === name) { score += 3; strong++; why.push('same name') }
    else if (name.length >= 4 && cn.length >= 4 && (` ${cn} `.includes(` ${name} `) || ` ${name} `.includes(` ${cn} `))) { score += 1; why.push('similar name') }
    if (phone && c.phones.includes(phone)) { score += 3; strong++; why.push('same phone') }
    if (host && c.hosts.some((h) => sameHost(host, h))) { score += 3; strong++; why.push('same website') }
    if (postcode && c.postcode === postcode && score > 0) { score += 1; why.push('same postcode') }
    if (score > 0 && c.had_club_card) { score += 1; why.push('has had a Club Card') }
    return { c, score, strong, why }
  }).filter((s) => s.score >= 2).sort((a, b) => b.score - a.score)

  const [best, second] = scored
  if (!best) return { business_id: null, score: 0, sure: false, reason: 'no business with this name, phone or website' }
  const clear = !second || best.score - second.score >= 2
  if (!clear) {
    return { business_id: best.c.id, score: best.score, sure: false, reason: `unclear: ${best.c.name} or ${second.c.name}` }
  }
  return { business_id: best.c.id, score: best.score, sure: best.strong >= 2, reason: best.why.join(', ') }
}
