'use server'

// The Club Card tab (UI overhaul Stage 16b). Nothing new is worked out here:
// it joins what the rest of the app already reads. The member list and its
// website problems come from v_club_card_members (getClubCardMembers), the
// main contact, last in touch, renewal stage and last newsletter from the
// Businesses table (getBusinessTable, built on v_businesses and
// v_business_newsletter), and amounts and former members from contracts.

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { getClubCardMembers, type ClubCardRow } from '@/app/actions/club-card'
import { getBusinessTable, type TableRow } from '@/app/actions/business-table'

export type ClubCardContract = {
  contract_start: string | null
  contract_end: string | null
  contract_amount: number | null
  billing_frequency: string | null
  invoice_paid: boolean | null
}

export type ClubCardTabRow = {
  business_id: string
  name: string
  /** member / grace / lapsed / none from v_club_card_members; former = a Club Card that ended more than 60 days ago */
  card_state: ClubCardRow['card_state'] | 'former'
  member: ClubCardRow | null
  table: TableRow | null
  /** The current Club Card contract, or for a former member the last one. */
  contract: ClubCardContract | null
  /** How many Club Card terms this business has had. */
  terms: number
}

export type ClubCardSummary = {
  members: number
  grace: number
  endingThisMonth: number
  endingNextMonth: number
  thisMonthLabel: string
  nextMonthLabel: string
  incomeThisYear: number
  year: string
  withProblems: number
  dueMention: number
}

/** Members not in the newsletter for this long are "due a mention". */
const MENTION_MONTHS = 6

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

function monthStart(isoDate: string, add: number): string {
  const [y, m] = isoDate.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + add, 1))
  return d.toISOString().slice(0, 10)
}

function monthName(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
}

function monthsBefore(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

/** A member or one in the grace period, not in the newsletter for MENTION_MONTHS (or never). */
function dueMention(row: Pick<ClubCardTabRow, 'card_state' | 'table'>, today: string): boolean {
  if (row.card_state !== 'member' && row.card_state !== 'grace') return false
  const last = row.table?.newsletter?.date
  return !last || last.slice(0, 10) < monthsBefore(today, MENTION_MONTHS)
}

export async function getClubCardTab(): Promise<{
  data?: { today: string; rows: ClubCardTabRow[]; summary: ClubCardSummary; dueMentionIds: string[]; lastRun: { ran_at: string; ok: boolean } | null; toMatch: number }
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const [membersRes, tableRes, contractsRes] = await Promise.all([
    getClubCardMembers(),
    getBusinessTable(),
    supabase
      .from('contracts')
      .select('business_id, membership_type, contract_start, contract_end, contract_amount, billing_frequency, invoice_paid, is_current')
      .eq('organization_id', orgId)
      .in('membership_type', ['club_card', 'former_club_card'])
      .order('contract_start', { ascending: false, nullsFirst: false }),
  ])
  if (membersRes.error || !membersRes.data) return { error: membersRes.error ?? 'Could not load the Club Card members' }
  if (tableRes.error || !tableRes.data) return { error: tableRes.error ?? 'Could not load the businesses' }
  if (contractsRes.error) return { error: contractsRes.error.message }

  const today = tableRes.data.today ?? londonToday()
  const tableById = new Map(tableRes.data.rows.map((r) => [r.id, r]))

  // Contracts per business, newest first; the current club_card one wins.
  const byBusiness = new Map<string, NonNullable<typeof contractsRes.data>>()
  for (const c of contractsRes.data ?? []) {
    const list = byBusiness.get(c.business_id) ?? []
    list.push(c)
    byBusiness.set(c.business_id, list)
  }
  const pick = (id: string): ClubCardContract | null => {
    const list = byBusiness.get(id) ?? []
    const c = list.find((x) => x.is_current && x.membership_type === 'club_card')
      ?? [...list].sort((a, b) => (b.contract_end ?? '').localeCompare(a.contract_end ?? ''))[0]
    return c ? { contract_start: c.contract_start, contract_end: c.contract_end, contract_amount: c.contract_amount, billing_frequency: c.billing_frequency, invoice_paid: c.invoice_paid } : null
  }

  const rows: ClubCardTabRow[] = membersRes.data.map((m) => ({
    business_id: m.business_id,
    name: m.business_name,
    card_state: m.card_state,
    member: m,
    table: tableById.get(m.business_id) ?? null,
    contract: pick(m.business_id),
    terms: byBusiness.get(m.business_id)?.length ?? 0,
  }))

  // Former members: had a Club Card, and are no longer in the member list
  // (the view keeps a card for 60 days after it ends). Hidden and merged
  // records are left out, as everywhere else.
  const inList = new Set(rows.map((r) => r.business_id))
  for (const [id, list] of byBusiness) {
    if (inList.has(id)) continue
    const t = tableById.get(id)
    if (!t) continue
    if (list.some((c) => c.is_current && c.membership_type === 'club_card' && (c.contract_end ?? '9999') >= today)) continue
    rows.push({ business_id: id, name: t.name, card_state: 'former', member: null, table: t, contract: pick(id), terms: list.length })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))

  const thisMonth = monthStart(today, 0)
  const nextMonth = monthStart(today, 1)
  const afterNext = monthStart(today, 2)
  const year = today.slice(0, 4)
  const current = (contractsRes.data ?? []).filter((c) => c.is_current && c.membership_type === 'club_card')
  const ending = (from: string, to: string) => current.filter((c) => c.contract_end && c.contract_end >= from && c.contract_end < to).length
  const dueMentionIds = rows.filter((r) => dueMention(r, today)).map((r) => r.business_id)

  const summary: ClubCardSummary = {
    members: rows.filter((r) => r.card_state === 'member').length,
    grace: rows.filter((r) => r.card_state === 'grace').length,
    endingThisMonth: ending(thisMonth, nextMonth),
    endingNextMonth: ending(nextMonth, afterNext),
    thisMonthLabel: monthName(thisMonth),
    nextMonthLabel: monthName(nextMonth),
    incomeThisYear: (contractsRes.data ?? [])
      .filter((c) => c.membership_type === 'club_card' && (c.contract_start ?? '').startsWith(year))
      .reduce((n, c) => n + Number(c.contract_amount ?? 0), 0),
    year,
    withProblems: rows.filter((r) => (r.member?.issues.length ?? 0) > 0).length,
    dueMention: dueMentionIds.length,
  }

  return { data: { today, rows, summary, dueMentionIds, lastRun: membersRes.lastRun ?? null, toMatch: membersRes.toMatch ?? 0 } }
}
