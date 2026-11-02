// Companies House records for our own businesses (UI overhaul Stage 17b (3)).
//
// Active, Former and Unreviewed businesses get a company record: number, status, officers, registered office,
// accounts and confirmation-statement dates, SIC codes. Free API (COMPANIES_HOUSE_API_KEY), no AI, and nothing
// is written in anyone's words: names and addresses are stored as the register gives them.
//
// Matching: a search by the business name. One active company whose name is exactly the business name (apart
// from Ltd/Limited and punctuation) with a registered office in W3, W4 or W5 attaches itself; anything else
// that looks like the same company becomes a candidate on Data health for Tom to confirm. Records are
// refreshed weekly (the daily cron takes the stalest first). Officers are shown, never made contacts.

import type { SupabaseClient } from '@supabase/supabase-js'

const API = 'https://api.company-information.service.gov.uk'
const AUTO_AREAS = ['W3', 'W4', 'W5']
const SCOPE_STATUSES = ['Active', 'Former', 'Unreviewed']
const LOOKUP_AGAIN_DAYS = 90
const REFRESH_DAYS = 7
const GAP_MS = 520 // the register allows 600 requests in 5 minutes

export type Officer = { name: string; role: string | null; appointed_on: string | null; nationality?: string | null; occupation?: string | null }

type ChSearchItem = {
  title?: string
  company_number?: string
  company_status?: string
  date_of_creation?: string
  address?: { postal_code?: string }
  address_snippet?: string
}

type ChProfile = {
  company_name?: string
  company_status?: string
  company_status_detail?: string
  type?: string
  date_of_creation?: string
  sic_codes?: string[]
  has_insolvency_history?: boolean
  has_charges?: boolean
  registered_office_address?: Record<string, string | undefined>
  accounts?: { next_due?: string; overdue?: boolean; last_accounts?: { made_up_to?: string; type?: string } }
  confirmation_statement?: { next_due?: string; overdue?: boolean }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class RateLimited extends Error {}

async function chGet<T>(path: string): Promise<{ status: number; body: T | null }> {
  const key = process.env.COMPANIES_HOUSE_API_KEY
  if (!key) throw new Error('COMPANIES_HOUSE_API_KEY is not set')
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` }, cache: 'no-store' })
  await sleep(GAP_MS)
  if (res.status === 429) throw new RateLimited('Companies House rate limit reached')
  if (res.status === 404) return { status: 404, body: null }
  if (!res.ok) throw new Error(`Companies House answered ${res.status}`)
  return { status: res.status, body: (await res.json()) as T }
}

/** A name with Ltd/Limited, "the", punctuation and case taken out, for comparing. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(limited|ltd|llp|plc|lp)\b/g, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function officeText(a: Record<string, string | undefined> | undefined) {
  if (!a) return null
  return [a.care_of, a.po_box, a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code].filter(Boolean).join(', ') || null
}

function inAutoArea(postcode: string | undefined) {
  const p = (postcode ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  return AUTO_AREAS.some((a) => p.startsWith(`${a} `) || p === a)
}

export type CompanyFields = {
  company_number: string
  company_name: string | null
  status: string | null
  status_detail: string | null
  company_type: string | null
  incorporated_on: string | null
  sic_codes: string[] | null
  registered_office: string | null
  accounts_type: string | null
  accounts_last_made_up: string | null
  accounts_next_due: string | null
  accounts_overdue: boolean | null
  confirmation_next_due: string | null
  confirmation_overdue: boolean | null
  has_insolvency_history: boolean | null
  has_charges: boolean | null
  officers: Officer[]
}

/** Read one company: profile and its current officers (two calls). Null when the register has no such number. */
export async function readCompany(number: string): Promise<CompanyFields | null> {
  const { body: p } = await chGet<ChProfile>(`/company/${encodeURIComponent(number)}`)
  if (!p) return null
  const { body: o } = await chGet<{ items?: { name?: string; officer_role?: string; appointed_on?: string; resigned_on?: string; nationality?: string; occupation?: string }[] }>(
    `/company/${encodeURIComponent(number)}/officers?items_per_page=100`,
  )
  const officers: Officer[] = (o?.items ?? [])
    .filter((i) => !i.resigned_on && i.name)
    .map((i) => ({ name: i.name!, role: i.officer_role ?? null, appointed_on: i.appointed_on ?? null, nationality: i.nationality ?? null, occupation: i.occupation ?? null }))
  return {
    company_number: number,
    company_name: p.company_name ?? null,
    status: p.company_status ?? null,
    status_detail: p.company_status_detail ?? null,
    company_type: p.type ?? null,
    incorporated_on: p.date_of_creation ?? null,
    sic_codes: p.sic_codes ?? null,
    registered_office: officeText(p.registered_office_address),
    accounts_type: p.accounts?.last_accounts?.type ?? null,
    accounts_last_made_up: p.accounts?.last_accounts?.made_up_to ?? null,
    accounts_next_due: p.accounts?.next_due ?? null,
    accounts_overdue: p.accounts?.overdue ?? null,
    confirmation_next_due: p.confirmation_statement?.next_due ?? null,
    confirmation_overdue: p.confirmation_statement?.overdue ?? null,
    has_insolvency_history: p.has_insolvency_history ?? null,
    has_charges: p.has_charges ?? null,
    officers,
  }
}

/** Read a company and save it as the business's record. Returns an error text, or null when saved. */
export async function attachCompany(supabase: SupabaseClient, orgId: string, businessId: string, number: string, method: string): Promise<string | null> {
  const c = await readCompany(number)
  if (!c) return `Companies House has no company ${number}`
  const { error } = await supabase.from('company_records').upsert({
    business_id: businessId, organization_id: orgId, ...c, match_method: method, read_at: new Date().toISOString(), read_error: null,
  }, { onConflict: 'business_id' })
  return error ? error.message : null
}

export type LookupResult = { looked: number; attached: number; suggested: number; remaining: number; error?: string }

type Biz = { id: string; name: string; organization_id: string; status: string | null }

/** Businesses in scope with no record and not searched recently, Active first. */
export async function businessesToLookUp(supabase: SupabaseClient, orgId?: string): Promise<Biz[]> {
  let q = supabase.from('businesses').select('id, name, organization_id, status').is('merged_into', null).in('status', SCOPE_STATUSES).limit(5000)
  if (orgId) q = q.eq('organization_id', orgId)
  const [{ data: biz }, { data: recs }, { data: looks }] = await Promise.all([
    q,
    supabase.from('company_records').select('business_id').limit(10000),
    supabase.from('company_lookups').select('business_id, looked_up_at').limit(10000),
  ])
  const have = new Set((recs ?? []).map((r: { business_id: string }) => r.business_id))
  const cutoff = Date.now() - LOOKUP_AGAIN_DAYS * 86400000
  const recent = new Set((looks ?? []).filter((l: { looked_up_at: string }) => new Date(l.looked_up_at).getTime() > cutoff).map((l: { business_id: string }) => l.business_id))
  const order: Record<string, number> = { Active: 0, Unreviewed: 1, Former: 2 }
  return ((biz ?? []) as Biz[])
    .filter((b) => !have.has(b.id) && !recent.has(b.id) && nameKey(b.name).length >= 3)
    .sort((a, b) => (order[a.status ?? ''] ?? 3) - (order[b.status ?? ''] ?? 3) || a.name.localeCompare(b.name))
}

/** Search for one business. Attaches an unambiguous match; otherwise saves candidates for Data health. */
async function lookUpOne(supabase: SupabaseClient, b: Biz): Promise<'attached' | 'suggested' | 'none'> {
  const { body } = await chGet<{ items?: ChSearchItem[] }>(`/search/companies?q=${encodeURIComponent(b.name)}&items_per_page=10`)
  const items = (body?.items ?? []).filter((i) => i.company_number && i.title)
  const key = nameKey(b.name)
  const exact = items.filter((i) => nameKey(i.title!) === key)
  const exactActive = exact.filter((i) => i.company_status === 'active')

  const note = async (outcome: string) => {
    await supabase.from('company_lookups').upsert({ business_id: b.id, organization_id: b.organization_id, looked_up_at: new Date().toISOString(), outcome }, { onConflict: 'business_id' })
  }

  if (exactActive.length === 1 && exact.length === 1 && inAutoArea(exactActive[0].address?.postal_code)) {
    const err = await attachCompany(supabase, b.organization_id, b.id, exactActive[0].company_number!, 'exact_auto')
    if (!err) { await note('attached'); return 'attached' }
  }

  // Looks like the same company: exact name, or one name inside the other (at least two words or 8 characters)
  const likely = items.filter((i) => {
    const k = nameKey(i.title!)
    if (k === key) return true
    const [short, long] = k.length < key.length ? [k, key] : [key, k]
    return (short.length >= 8 || short.split(' ').length >= 2) && long.startsWith(short)
  }).slice(0, 3)

  if (likely.length === 0) { await note('none'); return 'none' }
  const rows = likely.map((i) => ({
    organization_id: b.organization_id, business_id: b.id, company_number: i.company_number!, company_name: i.title!,
    registered_office: i.address_snippet ?? null, company_status: i.company_status ?? null,
    why: nameKey(i.title!) === key
      ? `Same name${i.company_status && i.company_status !== 'active' ? `, ${i.company_status}` : ''}${inAutoArea(i.address?.postal_code) ? '' : ', registered office outside W3/W4/W5'}${exact.length > 1 ? `, ${exact.length} companies share it` : ''}`
      : 'Similar name',
  }))
  await supabase.from('company_candidates').upsert(rows, { onConflict: 'business_id,company_number', ignoreDuplicates: true })
  await note('suggested')
  return 'suggested'
}

/** Look up businesses until the time budget is spent. Safe to call again. */
export async function lookUpBatch(supabase: SupabaseClient, opts: { orgId?: string; budgetMs: number }): Promise<LookupResult> {
  const deadline = Date.now() + opts.budgetMs
  const todo = await businessesToLookUp(supabase, opts.orgId)
  const r: LookupResult = { looked: 0, attached: 0, suggested: 0, remaining: todo.length }
  for (const b of todo) {
    if (Date.now() > deadline - 4000) break
    try {
      const out = await lookUpOne(supabase, b)
      r.looked++
      r.remaining--
      if (out === 'attached') r.attached++
      if (out === 'suggested') r.suggested++
    } catch (e) {
      r.error = (e as Error).message
      break
    }
  }
  return r
}

/** Re-read the stalest records (older than a week), up to the time budget. */
export async function refreshStale(supabase: SupabaseClient, budgetMs: number): Promise<{ refreshed: number; failed: number; error?: string }> {
  const deadline = Date.now() + budgetMs
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 86400000).toISOString()
  const { data } = await supabase.from('company_records').select('business_id, company_number')
    .or(`read_at.is.null,read_at.lt.${cutoff}`).order('read_at', { ascending: true, nullsFirst: true }).limit(200)
  let refreshed = 0
  let failed = 0
  for (const row of (data ?? []) as { business_id: string; company_number: string }[]) {
    if (Date.now() > deadline - 4000) break
    try {
      const c = await readCompany(row.company_number)
      if (!c) {
        failed++
        await supabase.from('company_records').update({ read_error: 'Companies House has no record of this number', read_at: new Date().toISOString() }).eq('business_id', row.business_id)
        continue
      }
      await supabase.from('company_records').update({ ...c, read_at: new Date().toISOString(), read_error: null }).eq('business_id', row.business_id)
      refreshed++
    } catch (e) {
      if (e instanceof RateLimited) return { refreshed, failed, error: e.message }
      failed++
      await supabase.from('company_records').update({ read_error: (e as Error).message }).eq('business_id', row.business_id)
    }
  }
  return { refreshed, failed }
}
