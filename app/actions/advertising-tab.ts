'use server'

// The Advertising tab (UI overhaul Stage 16d). As with the Club Card and
// Outreach tabs, nothing new is stored or worked out for anyone else: the deal
// is the advertising contract (contracts, the source of truth), and main
// contact, last in touch, renewal stage, money owed and last newsletter come
// from the Businesses table (getBusinessTable, built on v_businesses,
// v_business_financials and v_business_newsletter). News articles are counted
// from business_articles. Performance stats have no source yet (Tom is looking
// into it), so none are shown.

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { getBusinessTable, type TableRow } from '@/app/actions/business-table'

export type AdvertisingContract = {
  contract_start: string | null
  contract_end: string | null
  contract_amount: number | null
  billing_frequency: string | null
  invoice_paid: boolean | null
  deal_terms: string | null
}

export type AdvertisingRow = {
  business_id: string
  name: string
  /** in_force = a current deal not ended (or with no end date); grace = ended up to 60 days ago; former = older. */
  state: 'in_force' | 'grace' | 'former'
  contract: AdvertisingContract
  terms: number
  articles: { n: number; latest: string | null }
  table: TableRow | null
}

export type AdvertisingSummary = {
  inForce: number
  grace: number
  former: number
  endingThisMonth: number
  endingNextMonth: number
  thisMonthLabel: string
  nextMonthLabel: string
  incomeThisYear: number
  year: string
  owed: number
}

/** A deal stays on the tab this long after it ends (the renewal grace period used everywhere). */
const GRACE_DAYS = 60

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function monthStart(isoDate: string, add: number): string {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + add, 1)).toISOString().slice(0, 10)
}

const monthName = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })

export async function getAdvertisingTab(): Promise<{
  data?: { today: string; rows: AdvertisingRow[]; summary: AdvertisingSummary }
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const [tableRes, contractsRes] = await Promise.all([
    getBusinessTable(),
    supabase
      .from('contracts')
      .select('business_id, membership_type, contract_start, contract_end, contract_amount, billing_frequency, invoice_paid, deal_terms, is_current')
      .eq('organization_id', orgId)
      .in('membership_type', ['advertiser', 'former_advertiser'])
      .order('contract_start', { ascending: false, nullsFirst: false }),
  ])
  if (tableRes.error || !tableRes.data) return { error: tableRes.error ?? 'Could not load the businesses' }
  if (contractsRes.error) return { error: contractsRes.error.message }

  const today = tableRes.data.today
  const graceFrom = addDays(today, -GRACE_DAYS)
  const tableById = new Map(tableRes.data.rows.map((r) => [r.id, r]))

  const byBusiness = new Map<string, NonNullable<typeof contractsRes.data>>()
  for (const c of contractsRes.data ?? []) {
    const list = byBusiness.get(c.business_id) ?? []
    list.push(c)
    byBusiness.set(c.business_id, list)
  }

  // News articles per advertiser (confirmed matches only).
  const ids = [...byBusiness.keys()].filter((id) => tableById.has(id))
  const articles = new Map<string, { n: number; latest: string | null }>()
  for (let i = 0; i < ids.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('business_articles').select('business_id, published_date')
        .in('business_id', ids.slice(i, i + 100)).eq('status', 'confirmed')
        .order('id').range(from, from + 999)
      if (error) return { error: error.message }
      for (const a of data ?? []) {
        const cur = articles.get(a.business_id) ?? { n: 0, latest: null }
        cur.n += 1
        if (a.published_date && (!cur.latest || a.published_date > cur.latest)) cur.latest = a.published_date
        articles.set(a.business_id, cur)
      }
      if ((data ?? []).length < 1000) break
    }
  }

  const rows: AdvertisingRow[] = []
  for (const id of ids) {
    const list = byBusiness.get(id)!
    // The current advertising deal wins; otherwise the one that ended last.
    const c = list.find((x) => x.is_current && x.membership_type === 'advertiser')
      ?? [...list].sort((a, b) => (b.contract_end ?? '').localeCompare(a.contract_end ?? ''))[0]
    const current = c.is_current && c.membership_type === 'advertiser'
    const end = c.contract_end
    const state: AdvertisingRow['state'] = current && (!end || end >= today) ? 'in_force' : current && end >= graceFrom ? 'grace' : 'former'
    rows.push({
      business_id: id,
      name: tableById.get(id)!.name,
      state,
      contract: {
        contract_start: c.contract_start,
        contract_end: c.contract_end,
        contract_amount: c.contract_amount === null ? null : Number(c.contract_amount),
        billing_frequency: c.billing_frequency,
        invoice_paid: c.invoice_paid,
        deal_terms: c.deal_terms,
      },
      terms: list.length,
      articles: articles.get(id) ?? { n: 0, latest: null },
      table: tableById.get(id) ?? null,
    })
  }
  // Ending soonest first; deals with no end date after those that have one, former advertisers last.
  rows.sort((a, b) =>
    Number(a.state === 'former') - Number(b.state === 'former')
    || (a.state === 'former'
      ? (b.contract.contract_end ?? '').localeCompare(a.contract.contract_end ?? '')
      : (a.contract.contract_end ?? '9999').localeCompare(b.contract.contract_end ?? '9999'))
    || a.name.localeCompare(b.name, 'en-GB'))

  const thisMonth = monthStart(today, 0)
  const nextMonth = monthStart(today, 1)
  const afterNext = monthStart(today, 2)
  const year = today.slice(0, 4)
  const live = rows.filter((r) => r.state !== 'former')
  const ending = (from: string, to: string) => live.filter((r) => r.contract.contract_end && r.contract.contract_end >= from && r.contract.contract_end < to).length

  const summary: AdvertisingSummary = {
    inForce: rows.filter((r) => r.state === 'in_force').length,
    grace: rows.filter((r) => r.state === 'grace').length,
    former: rows.filter((r) => r.state === 'former').length,
    endingThisMonth: ending(thisMonth, nextMonth),
    endingNextMonth: ending(nextMonth, afterNext),
    thisMonthLabel: monthName(thisMonth),
    nextMonthLabel: monthName(nextMonth),
    incomeThisYear: (contractsRes.data ?? [])
      .filter((c) => c.membership_type === 'advertiser' && (c.contract_start ?? '').startsWith(year))
      .reduce((n, c) => n + Number(c.contract_amount ?? 0), 0),
    year,
    owed: live.reduce((n, r) => n + Math.max(0, r.table?.money?.open_balance ?? 0), 0),
  }

  return { data: { today, rows, summary } }
}
