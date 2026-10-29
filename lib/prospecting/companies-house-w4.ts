// Companies House W4 reader (UI overhaul Stage 16c2, intake option B).
//
// Once a week: companies incorporated in the last 14 days with a W4 registered office and a
// trade that suits the Club Card or advertising (by SIC code) become prospect leads, shown on
// the Outreach tab under Leads to accept. Free API (COMPANIES_HOUSE_API_KEY, basic auth), no AI.
// The snippet is built from the register's own fields; nothing is written in anyone's words.
// A company already read (same register link) is never added twice. Each run is logged in
// scraper_logs like the prospecting routine's runs.

import type { SupabaseClient } from '@supabase/supabase-js'

const API = 'https://api.company-information.service.gov.uk'
const REGISTER = 'https://find-and-update.company-information.service.gov.uk/company'
export const SOURCE_NAME = 'Companies House'
const POSTCODE_AREAS = ['W4']
const LOOK_BACK_DAYS = 14

/** SIC codes worth a lead, with the app's category and the register's own description. */
const SIC: Record<string, [category: string, label: string]> = {
  '10710': ['Food & Drink', 'Bread, cakes and fresh pastry'],
  '47110': ['Retail', 'Retail in non-specialised stores (food)'],
  '47190': ['Retail', 'Other retail in non-specialised stores'],
  '47240': ['Food & Drink', 'Retail of bread, cakes and confectionery'],
  '47250': ['Food & Drink', 'Retail of beverages'],
  '47290': ['Food & Drink', 'Other retail of food'],
  '47610': ['Retail', 'Retail of books'],
  '47710': ['Retail', 'Retail of clothing'],
  '47720': ['Retail', 'Retail of footwear and leather goods'],
  '47750': ['Health & Beauty', 'Retail of cosmetic and toilet articles'],
  '47760': ['Retail', 'Retail of flowers, plants and garden goods'],
  '47770': ['Retail', 'Retail of watches and jewellery'],
  '47781': ['Retail', 'Retail in commercial art galleries'],
  '47789': ['Retail', 'Other retail of new goods'],
  '47799': ['Retail', 'Retail of other second-hand goods'],
  '56101': ['Food & Drink', 'Licensed restaurants'],
  '56102': ['Food & Drink', 'Unlicensed restaurants and cafes'],
  '56103': ['Food & Drink', 'Take-away food shops'],
  '56210': ['Food & Drink', 'Event catering'],
  '56301': ['Food & Drink', 'Licensed clubs'],
  '56302': ['Food & Drink', 'Public houses and bars'],
  '75000': ['Services', 'Veterinary activities'],
  '85510': ['Activities', 'Sports and recreation education'],
  '85520': ['Activities', 'Cultural education'],
  '86230': ['Health & Beauty', 'Dental practice'],
  '86900': ['Health & Beauty', 'Other human health activities'],
  '88910': ['For Children', 'Child day-care'],
  '90010': ['Entertainment', 'Performing arts'],
  '90030': ['Entertainment', 'Artistic creation'],
  '90040': ['Entertainment', 'Operation of arts facilities'],
  '93110': ['Activities', 'Operation of sports facilities'],
  '93130': ['Activities', 'Fitness facilities'],
  '93290': ['Entertainment', 'Other amusement and recreation'],
  '96020': ['Health & Beauty', 'Hairdressing and other beauty treatment'],
  '96040': ['Health & Beauty', 'Physical well-being activities'],
}

type ChCompany = {
  company_name?: string
  company_number?: string
  company_status?: string
  date_of_creation?: string
  sic_codes?: string[]
  registered_office_address?: { address_line_1?: string; address_line_2?: string; locality?: string; postal_code?: string }
}

export type CompaniesHouseRun = { ok: boolean; checked: number; matched: number; created: number; error?: string }

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function gb(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

function inArea(postcode: string | undefined) {
  const p = (postcode ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  return POSTCODE_AREAS.some((a) => p.startsWith(`${a} `) || p === a)
}

/** Read the register and write new leads. Safe to run more than once. */
export async function readCompaniesHouseW4(supabase: SupabaseClient, now = new Date()): Promise<CompaniesHouseRun> {
  const started = Date.now()
  const key = process.env.COMPANIES_HOUSE_API_KEY
  const finish = async (run: CompaniesHouseRun) => {
    await supabase.from('scraper_logs').insert({
      scraper_type: 'prospecting',
      sources_checked: [SOURCE_NAME],
      leads_created: run.created,
      errors: run.error ? [{ source: SOURCE_NAME, error: run.error }] : [],
      duration_seconds: Math.round((Date.now() - started) / 1000),
    })
    return run
  }
  if (!key) return finish({ ok: false, checked: 0, matched: 0, created: 0, error: 'COMPANIES_HOUSE_API_KEY is not set' })

  const from = new Date(now)
  from.setUTCDate(from.getUTCDate() - LOOK_BACK_DAYS)
  const companies: ChCompany[] = []
  for (const area of POSTCODE_AREAS) {
    const url = new URL(`${API}/advanced-search/companies`)
    url.searchParams.set('incorporated_from', iso(from))
    url.searchParams.set('incorporated_to', iso(now))
    url.searchParams.set('location', area)
    url.searchParams.set('company_status', 'active')
    url.searchParams.set('size', '500')
    const res = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` }, cache: 'no-store' })
    if (res.status === 404) continue // the register answers 404 when nothing matches
    if (!res.ok) return finish({ ok: false, checked: 0, matched: 0, created: 0, error: `Companies House answered ${res.status}` })
    const body = (await res.json()) as { items?: ChCompany[] }
    companies.push(...(body.items ?? []))
  }

  const wanted = companies.filter((c) => c.company_number && inArea(c.registered_office_address?.postal_code) && (c.sic_codes ?? []).some((s) => SIC[s]))
  if (wanted.length === 0) return finish({ ok: true, checked: companies.length, matched: 0, created: 0 })

  const urls = wanted.map((c) => `${REGISTER}/${c.company_number}`)
  const { data: existing, error: readError } = await supabase.from('prospect_leads').select('source_url').in('source_url', urls)
  if (readError) return finish({ ok: false, checked: companies.length, matched: wanted.length, created: 0, error: readError.message })
  const seen = new Set((existing ?? []).map((l: { source_url: string | null }) => l.source_url))

  const rows = wanted
    .filter((c) => !seen.has(`${REGISTER}/${c.company_number}`))
    .map((c) => {
      const codes = (c.sic_codes ?? []).filter((s) => SIC[s])
      const a = c.registered_office_address ?? {}
      const address = [a.address_line_1, a.address_line_2, a.locality, a.postal_code].filter(Boolean).join(', ')
      return {
        business_name: c.company_name ?? c.company_number,
        source_name: SOURCE_NAME,
        source_url: `${REGISTER}/${c.company_number}`,
        address: address || null,
        business_category: SIC[codes[0]][0],
        snippet: `Incorporated ${c.date_of_creation ? gb(c.date_of_creation) : 'recently'}, registered office ${address || 'not given'}. SIC ${codes.map((s) => `${s} ${SIC[s][1]}`).join('; ')}.`,
        // A newly made company; match_prospect_leads relinks it if the name is already on file.
        match_type: 'new_business',
        status: 'new',
        found_at: now.toISOString(),
      }
    })
  if (rows.length === 0) return finish({ ok: true, checked: companies.length, matched: wanted.length, created: 0 })

  const { error } = await supabase.from('prospect_leads').insert(rows)
  if (error) return finish({ ok: false, checked: companies.length, matched: wanted.length, created: 0, error: error.message })
  // Link any lead to a business we already know and set its match type, as for the routine's leads.
  await supabase.rpc('match_prospect_leads')
  return finish({ ok: true, checked: companies.length, matched: wanted.length, created: rows.length })
}
