'use server'

// Club Card pages on the website (UI overhaul Stage 6b). Reads
// v_club_card_members and club_card_pages; the only writes are Tom's own
// choices (which business a page belongs to, an offer end date, "offer still
// right"). Nothing here writes to the website.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { createBusiness } from '@/app/actions/businesses'

import type { ClubCardIssue } from '@/lib/club-card/labels'

export type ClubCardMember = {
  business_id: string
  business_name: string
  card_state: 'member' | 'grace' | 'lapsed' | 'none'
  contract_start: string | null
  contract_end: string | null
  page_id: string | null
  wp_id: number | null
  page_link: string | null
  page_title: string | null
  offer_text: string | null
  offer_ends: string | null
  wp_modified: string | null
  offer_confirmed_at: string | null
  live_page_count: number
  in_az_count: number | null
  map_count: number | null
  map_folders: string[] | null
  categories: string[] | null
  in_latest_offers: boolean | null
  page_address: string | null
  page_phone: string | null
  page_website: string | null
  page_email: string | null
  contact_mismatch: string[] | null
  issues: ClubCardIssue[]
}

export type ClubCardArticle = { id: string; title: string; url: string; published_date: string | null; source_domain: string | null }

export type ReviewPage = {
  id: string
  wp_id: number
  title: string
  link: string
  offer_text: string | null
  page_phone: string | null
  page_website: string | null
  page_postcode: string | null
  wp_modified: string | null
  match_status: 'unmatched' | 'suggested' | 'confirmed' | 'not_a_member'
  business_id: string | null
  suggested_business_id: string | null
  match_reason: string | null
  matched_by: string | null
}

async function orgOrError() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' as const }
  return { supabase, orgId }
}

/** Every Club Card member, and every business with a live page, for the Businesses view. */
export async function getClubCardMembers(): Promise<{
  data?: (ClubCardMember & { articles: number; latest_article: string | null })[]
  lastRun?: { ran_at: string; ok: boolean } | null
  toMatch?: number
  error?: string
}> {
  const ctx = await orgOrError()
  if ('error' in ctx) return { error: ctx.error }
  const [rows, run, toMatch] = await Promise.all([
    ctx.supabase.from('v_club_card_members').select('*').eq('organization_id', ctx.orgId).order('business_name'),
    ctx.supabase.from('club_card_sync_runs').select('ran_at, ok').eq('organization_id', ctx.orgId).order('ran_at', { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from('club_card_pages').select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId).is('gone_at', null).in('match_status', ['unmatched', 'suggested']),
  ])
  if (rows.error) return { error: rows.error.message }
  const members = (rows.data ?? []) as ClubCardMember[]
  // News articles per member (business_articles), counted here to keep the view simple
  const counts = new Map<string, { n: number; latest: string | null }>()
  const ids = members.map((m) => m.business_id)
  for (let i = 0; i < ids.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await ctx.supabase
        .from('business_articles').select('business_id, published_date')
        .in('business_id', ids.slice(i, i + 100)).in('status', ['pending', 'confirmed'])
        .order('id').range(from, from + 999)
      if (error) return { error: error.message }
      for (const a of data ?? []) {
        const c = counts.get(a.business_id) ?? { n: 0, latest: null }
        c.n++
        if (a.published_date && (!c.latest || a.published_date > c.latest)) c.latest = a.published_date
        counts.set(a.business_id, c)
      }
      if (!data || data.length < 1000) break
    }
  }
  return {
    data: members.map((m) => ({ ...m, articles: counts.get(m.business_id)?.n ?? 0, latest_article: counts.get(m.business_id)?.latest ?? null })),
    lastRun: run.data ?? null,
    toMatch: toMatch.count ?? 0,
  }
}

export type ClubCardRow = NonNullable<Awaited<ReturnType<typeof getClubCardMembers>>['data']>[number]

/** One business's Club Card: the member row (if any), all its live pages, and its news articles. */
export async function getClubCardForBusiness(businessId: string): Promise<{
  member: ClubCardMember | null
  pages: { id: string; title: string; link: string; offer_ends_set: string | null }[]
  articles: ClubCardArticle[]
  error?: string
}> {
  const empty = { member: null, pages: [], articles: [] }
  const ctx = await orgOrError()
  if ('error' in ctx) return { ...empty, error: ctx.error }
  const [m, p, a] = await Promise.all([
    ctx.supabase.from('v_club_card_members').select('*').eq('business_id', businessId).maybeSingle(),
    ctx.supabase.from('club_card_pages').select('id, title, link, offer_ends_set')
      .eq('business_id', businessId).eq('match_status', 'confirmed').is('gone_at', null).order('wp_modified', { ascending: false }),
    ctx.supabase.from('business_articles').select('id, title, url, published_date, source_domain')
      .eq('business_id', businessId).in('status', ['pending', 'confirmed']).order('published_date', { ascending: false, nullsFirst: false }).limit(5),
  ])
  if (m.error) return { ...empty, error: m.error.message }
  return { member: (m.data as ClubCardMember | null) ?? null, pages: p.data ?? [], articles: (a.data ?? []) as ClubCardArticle[] }
}

/** The matching page: every live page, with the business it is matched or suggested to. */
export async function getClubCardReview(): Promise<{ pages?: ReviewPage[]; businesses?: { id: string; name: string }[]; error?: string }> {
  const ctx = await orgOrError()
  if ('error' in ctx) return { error: ctx.error }
  const pagesRes = await ctx.supabase
    .from('club_card_pages')
    .select('id, wp_id, title, link, offer_text, page_phone, page_website, page_postcode, wp_modified, match_status, business_id, suggested_business_id, match_reason, matched_by')
    .eq('organization_id', ctx.orgId)
    .is('gone_at', null)
    .order('title')
  if (pagesRes.error) return { error: pagesRes.error.message }
  const businesses: { id: string; name: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.supabase
      .from('businesses').select('id, name').eq('organization_id', ctx.orgId).is('merged_into', null)
      .neq('status', 'Not a business').order('name').range(from, from + 999)
    if (error) return { error: error.message }
    businesses.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { pages: (pagesRes.data ?? []) as ReviewPage[], businesses }
}

/** Tom's answer for one page: this business, or "not a member page". */
export async function setClubCardMatch(pageId: string, businessId: string | null): Promise<{ error?: string }> {
  const ctx = await orgOrError()
  if ('error' in ctx) return { error: ctx.error }
  const now = new Date().toISOString()
  const { error } = await ctx.supabase
    .from('club_card_pages')
    .update(businessId
      ? { match_status: 'confirmed', business_id: businessId, matched_by: 'tom', matched_at: now, updated_at: now }
      : { match_status: 'not_a_member', business_id: null, matched_by: 'tom', matched_at: now, updated_at: now })
    .eq('id', pageId)
    .eq('organization_id', ctx.orgId)
  if (error) return { error: error.message }
  revalidatePath('/businesses/club-card-pages')
  revalidatePath('/today')
  return {}
}

/**
 * A page whose business isn't on file yet: add the business (named by Tom,
 * with the address and phone from the page) and match the page to it.
 * Status starts as Prospect; recording the Club Card contract makes it Active.
 */
export async function createBusinessForClubCardPage(pageId: string, name: string): Promise<{ error?: string; businessId?: string }> {
  const ctx = await orgOrError()
  if ('error' in ctx) return { error: ctx.error }
  const { data: page, error: pageError } = await ctx.supabase
    .from('club_card_pages').select('id, page_address, page_phone')
    .eq('id', pageId).eq('organization_id', ctx.orgId).maybeSingle()
  if (pageError) return { error: pageError.message }
  if (!page) return { error: 'Page not found' }

  const created = await createBusiness({ name, status: 'Prospect' })
  if (created.error || !created.data) return { error: created.error ?? 'Could not add the business' }
  const businessId = created.data.id as string

  const details: Record<string, string> = {}
  if (page.page_address) details.address = page.page_address
  if (page.page_phone) details.phone = page.page_phone
  if (Object.keys(details).length) {
    const { error } = await ctx.supabase.from('businesses').update(details).eq('id', businessId)
    if (error) return { error: `Business added, but its details weren't saved: ${error.message}`, businessId }
  }

  const matched = await setClubCardMatch(pageId, businessId)
  if (matched.error) return { error: `Business added, but the page wasn't matched: ${matched.error}`, businessId }
  revalidatePath('/businesses')
  return { businessId }
}

/** Confirm every suggestion Tom has left as it is, in one go. */
export async function confirmClubCardSuggestions(pageIds: string[]): Promise<{ error?: string; confirmed?: number }> {
  const ctx = await orgOrError()
  if ('error' in ctx) return { error: ctx.error }
  const { data: rows, error } = await ctx.supabase
    .from('club_card_pages').select('id, suggested_business_id')
    .eq('organization_id', ctx.orgId).eq('match_status', 'suggested').in('id', pageIds)
  if (error) return { error: error.message }
  let confirmed = 0
  for (const r of rows ?? []) {
    if (!r.suggested_business_id) continue
    const res = await setClubCardMatch(r.id, r.suggested_business_id)
    if (res.error) return { error: res.error, confirmed }
    confirmed++
  }
  return { confirmed }
}

/** Tom's offer fields: an end date the page wording doesn't give, or "offer still right" (today). */
export async function setClubCardOffer(pageId: string, change: { offer_ends_set?: string | null; confirm?: boolean }): Promise<{ error?: string }> {
  const ctx = await orgOrError()
  if ('error' in ctx) return { error: ctx.error }
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now }
  if ('offer_ends_set' in change) update.offer_ends_set = change.offer_ends_set || null
  if (change.confirm) update.offer_confirmed_at = now
  const { error } = await ctx.supabase.from('club_card_pages').update(update).eq('id', pageId).eq('organization_id', ctx.orgId)
  if (error) return { error: error.message }
  revalidatePath('/today')
  return {}
}
