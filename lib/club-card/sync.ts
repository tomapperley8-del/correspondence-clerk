// Nightly read of the Club Card pages (Stage 6b). Reads the public WordPress
// REST API and the public Google My Maps KML, then updates club_card_pages.
// Never writes to the website. Never overwrites Tom's own fields (the business
// match he chose, an offer end date he set, "offer still right").

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AZ_SLUG, CATEGORY_SLUGS, CLUB_CARD_PARENT_ID, HUB_SLUGS, LATEST_SLUG, MAP_KML_URL, SITE, USER_AGENT,
  linkedSlugs, normaliseHost, normalisePhone, normalisePostcode, parseMapKml, parseMemberPage, slugFromLink,
  type ParsedPage, type WpPage,
} from './parse'
import { matchPage, type MatchCandidate } from './match'

const FIELDS = 'id,slug,link,modified,modified_gmt,title,content'

async function getJson<T>(url: string): Promise<{ data: T; totalPages: number }> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000), cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} from ${url.replace(SITE, '')}`)
  return { data: (await res.json()) as T, totalPages: parseInt(res.headers.get('X-WP-TotalPages') || '1', 10) }
}

async function fetchChildren(): Promise<WpPage[]> {
  const out: WpPage[] = []
  for (let page = 1; page <= 10; page++) {
    const { data, totalPages } = await getJson<WpPage[]>(
      `${SITE}/wp-json/wp/v2/pages?parent=${CLUB_CARD_PARENT_ID}&per_page=100&page=${page}&_fields=${FIELDS}`,
    )
    out.push(...data)
    if (page >= totalPages) break
  }
  return out
}

/** Pages or posts elsewhere on the site that the A-Z, map or categories link to. */
async function fetchBySlug(slugs: string[]): Promise<WpPage[]> {
  const out: WpPage[] = []
  for (let i = 0; i < slugs.length; i += 50) {
    const part = slugs.slice(i, i + 50).map(encodeURIComponent).join(',')
    for (const kind of ['pages', 'posts']) {
      const { data } = await getJson<WpPage[]>(`${SITE}/wp-json/wp/v2/${kind}?slug=${part}&per_page=100&_fields=${FIELDS}`)
      out.push(...data.filter((p) => !out.some((o) => o.slug === p.slug)))
    }
  }
  return out
}

/** Where a member-page link really goes, following WordPress's old-slug redirects. */
async function resolveLink(slug: string): Promise<{ status: number; url: string | null }> {
  try {
    const res = await fetch(`${SITE}/chiswick-club-card-offers/${slug}/`, {
      method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000), cache: 'no-store',
    })
    return { status: res.status, url: res.url || null }
  } catch {
    return { status: 0, url: null }
  }
}

export type SiteSnapshot = {
  pages: (ParsedPage & {
    in_az_count: number
    in_latest_offers: boolean
    map_count: number
    map_folders: string[]
    categories: string[]
    outside_club_card_folder: boolean
  })[]
  problems: { az_broken: string[]; map_broken: string[]; category_broken: string[]; map_no_link: string[] }
}

/** Read the website and the map. Throws if the page list or a hub page can't be read. */
export async function readSite(): Promise<SiteSnapshot> {
  const children = await fetchChildren()
  const hub = (slug: string) => {
    const p = children.find((c) => c.slug === slug)
    if (!p) throw new Error(`hub page ${slug} not found`)
    return p.content.rendered
  }
  const rawAz = linkedSlugs(hub(AZ_SLUG))
  const rawLatest = linkedSlugs(hub(LATEST_SLUG))
  const rawCategories = Object.fromEntries(Object.keys(CATEGORY_SLUGS).map((s) => [s, linkedSlugs(hub(s))]))
  const kmlRes = await fetch(MAP_KML_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000), cache: 'no-store' })
  if (!kmlRes.ok) throw new Error(`${kmlRes.status} from the Club Card map`)
  const rawMap = parseMapKml(await kmlRes.text())

  const members = children.filter((c) => !HUB_SLUGS.has(c.slug))
  const known = new Set(members.map((m) => m.slug))
  const linked = new Set([...rawAz, ...rawLatest, ...rawMap.flatMap((p) => (p.slug ? [p.slug] : [])), ...Object.values(rawCategories).flat()])
  const missing = [...linked].filter((s) => !known.has(s))
  const outside = missing.length ? await fetchBySlug(missing) : []
  for (const o of outside) known.add(o.slug)

  // An old slug WordPress redirects to a member page counts as that page.
  // Anything else is reported: a 404, or a page that isn't a member page.
  const alias = new Map<string, string>()
  const dead: Record<string, string> = {}
  for (const slug of missing.filter((s) => !known.has(s))) {
    const to = await resolveLink(slug)
    const toSlug = to.url ? slugFromLink(to.url) : null
    if (toSlug && known.has(toSlug)) alias.set(slug, toSlug)
    else dead[slug] = to.url && to.status < 400 ? `goes to ${to.url.replace(SITE, '')}` : `not found (${to.status})`
  }
  const fix = (s: string) => alias.get(s) ?? s
  const az = rawAz.map(fix)
  const latest = new Set(rawLatest.map(fix))
  const categories = Object.fromEntries(Object.entries(rawCategories).map(([k, v]) => [k, new Set(v.map(fix))]))
  const map = rawMap.map((p) => ({ ...p, slug: p.slug ? fix(p.slug) : null }))
  const broken = (slugs: Iterable<string>) =>
    [...new Set([...slugs].filter((s) => !known.has(s)))].map((s) => `${s}: ${dead[s] ?? 'not found'}`)

  const pages = [...members, ...outside].map((wp) => {
    const parsed = parseMemberPage(wp)
    const onMap = map.filter((p) => p.slug === wp.slug)
    return {
      ...parsed,
      in_az_count: az.filter((s) => s === wp.slug).length,
      in_latest_offers: latest.has(wp.slug),
      map_count: onMap.length,
      map_folders: [...new Set(onMap.map((p) => p.folder).filter((f): f is string => !!f))],
      categories: Object.entries(categories).filter(([, set]) => set.has(wp.slug)).map(([s]) => CATEGORY_SLUGS[s]),
      outside_club_card_folder: !children.includes(wp),
    }
  })
  return {
    pages,
    problems: {
      az_broken: broken(az),
      map_broken: broken(map.flatMap((p) => (p.slug ? [p.slug] : []))),
      category_broken: broken(Object.values(categories).flatMap((s) => [...s])),
      map_no_link: map.filter((p) => !p.slug).map((p) => p.name),
    },
  }
}

/** Every row, past PostgREST's 1,000-row cap. */
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

export async function loadCandidates(supabase: SupabaseClient, orgId: string): Promise<MatchCandidate[]> {
  const [biz, contacts, domains, cards] = await Promise.all([
    allRows<{ id: string; name: string | null; phone: string | null; address: string | null; status: string | null }>((a, b) =>
      supabase.from('businesses').select('id, name, phone, address, status').eq('organization_id', orgId).is('merged_into', null).order('id').range(a, b)),
    allRows<{ business_id: string | null; phones: unknown }>((a, b) =>
      supabase.from('contacts').select('business_id, phones').eq('organization_id', orgId).order('id').range(a, b)),
    allRows<{ business_id: string | null; domain: string }>((a, b) =>
      supabase.from('domain_mappings').select('business_id, domain').eq('org_id', orgId).order('domain').range(a, b)),
    allRows<{ business_id: string }>((a, b) =>
      supabase.from('contracts').select('business_id').eq('organization_id', orgId).in('membership_type', ['club_card', 'former_club_card']).order('id').range(a, b)),
  ])
  const bizRes = { data: biz }
  const contactsRes = { data: contacts }
  const domainsRes = { data: domains }
  const cardsRes = { data: cards }
  const phones = new Map<string, string[]>()
  for (const c of contactsRes.data ?? []) {
    const list = Array.isArray(c.phones) ? (c.phones as unknown[]) : []
    for (const p of list) {
      const d = normalisePhone(String(p))
      if (d && c.business_id) phones.set(c.business_id, [...(phones.get(c.business_id) ?? []), d])
    }
  }
  const hosts = new Map<string, string[]>()
  for (const d of domainsRes.data ?? []) {
    const h = normaliseHost(d.domain)
    if (h && d.business_id) hosts.set(d.business_id, [...(hosts.get(d.business_id) ?? []), h])
  }
  const carded = new Set((cardsRes.data ?? []).map((c) => c.business_id))
  return (bizRes.data ?? [])
    .filter((b) => b.status !== 'Not a business')
    .map((b) => ({
      id: b.id,
      name: b.name ?? '',
      phones: [...(phones.get(b.id) ?? []), ...(normalisePhone(b.phone) ? [normalisePhone(b.phone)!] : [])],
      hosts: hosts.get(b.id) ?? [],
      postcode: normalisePostcode(b.address),
      had_club_card: carded.has(b.id),
    }))
}

export type SyncResult = { ok: boolean; pages_seen: number; pages_new: number; pages_gone: number; auto_matched: number; error?: string }

/**
 * Bring club_card_pages up to date for one organisation. The website is read
 * once per run by the caller (readSite) and passed in.
 * Auto-confirming a match is allowed only once Tom has confirmed matches
 * himself on the review page; until then every match is a suggestion.
 */
export async function syncOrg(supabase: SupabaseClient, orgId: string, site: SiteSnapshot): Promise<SyncResult> {
  const now = new Date().toISOString()
  const { data: existing, error } = await supabase
    .from('club_card_pages')
    .select('id, wp_id, match_status, matched_by, gone_at')
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  const byWp = new Map((existing ?? []).map((e) => [e.wp_id, e]))
  const tomHasReviewed = (existing ?? []).some((e) => e.matched_by === 'tom')
  const candidates = await loadCandidates(supabase, orgId)

  let pagesNew = 0
  let autoMatched = 0
  const seen = new Set<number>()
  for (const p of site.pages) {
    seen.add(p.wp_id)
    const siteFields = {
      slug: p.slug, link: p.link, title: p.title, wp_modified: p.wp_modified,
      offer_text: p.offer_text, offer_ends_on: p.offer_ends_on,
      page_address: p.page_address, page_postcode: p.page_postcode,
      page_phone: p.page_phone, page_phone_digits: normalisePhone(p.page_phone),
      page_website: p.page_website, page_website_host: normaliseHost(p.page_website), page_email: p.page_email,
      in_az_count: p.in_az_count, in_latest_offers: p.in_latest_offers, map_count: p.map_count,
      map_folders: p.map_folders, categories: p.categories, outside_club_card_folder: p.outside_club_card_folder,
      last_seen_at: now, gone_at: null, updated_at: now,
    }
    const row = byWp.get(p.wp_id)
    // Matching runs only on pages nobody has decided yet
    let matchFields = {}
    if (!row || row.match_status === 'unmatched' || row.match_status === 'suggested') {
      const m = matchPage(p, candidates)
      const auto = tomHasReviewed && m.sure && m.business_id
      if (auto) autoMatched++
      matchFields = auto
        ? { match_status: 'confirmed', business_id: m.business_id, suggested_business_id: m.business_id, match_reason: m.reason, matched_by: 'sync', matched_at: now }
        : { match_status: m.business_id ? 'suggested' : 'unmatched', suggested_business_id: m.business_id, match_reason: m.reason }
    }
    if (row) {
      const { error: e } = await supabase.from('club_card_pages').update({ ...siteFields, ...matchFields }).eq('id', row.id)
      if (e) throw new Error(e.message)
    } else {
      // Two runs can overlap (a manual run beside the cron): if the other run
      // has just added this page, leave its row alone rather than fail.
      const { data: added, error: e } = await supabase
        .from('club_card_pages')
        .upsert({ organization_id: orgId, wp_id: p.wp_id, first_seen_at: now, ...siteFields, ...matchFields },
          { onConflict: 'organization_id,wp_id', ignoreDuplicates: true })
        .select('id')
      if (e) throw new Error(e.message)
      if (added?.length) pagesNew++
    }
  }
  const goneIds = (existing ?? []).filter((e) => !seen.has(e.wp_id) && !e.gone_at).map((e) => e.id)
  if (goneIds.length) {
    const { error: e } = await supabase.from('club_card_pages').update({ gone_at: now, updated_at: now }).in('id', goneIds)
    if (e) throw new Error(e.message)
  }
  return { ok: true, pages_seen: site.pages.length, pages_new: pagesNew, pages_gone: goneIds.length, auto_matched: autoMatched }
}
