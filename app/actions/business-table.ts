'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import type { AttentionRow } from '@/app/actions/attention'

// The business table (UI overhaul Stage 5): one row per business with its main
// contact, current deal, last time in touch and the Stage 4 attention reason,
// like the Mastersheet. Built from plain reads, so it needs no migration. The
// attention reason comes from v_business_attention, read only.

/** Deal types that make a business "active" (Decision 21 Oct). */
const ACTIVE_DEAL_TYPES = ['club_card', 'advertiser']
/** Ended deals still count as active for this many days, unless not renewing (Decision 21 Oct). */
const ACTIVE_GRACE_DAYS = 60
/** The renewal window from the Needs attention definition: ending within 45 days or ended up to 60 days ago. */
const RENEWAL_AHEAD_DAYS = 45
const RENEWAL_BACK_DAYS = 60

const NOT_A_BUSINESS = 'Not a business'
const PAGE = 1000

export type TableContact = {
  id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  /** True when chosen as the main contact; false when it is a fallback. */
  is_primary: boolean
  /** A stand-in such as "Business email", not a named person. */
  is_placeholder: boolean
}

export type TableDeal = {
  membership_type: string | null
  contract_start: string | null
  contract_end: string | null
  in_force: boolean
}

export type TableRow = {
  id: string
  name: string
  status: string | null
  business_type: string | null
  business_type_label: string | null
  is_commercial: boolean
  renewal_stage: string | null
  /** Outreach pipeline stage; null when not in outreach. */
  outreach_stage: string | null
  contact: TableContact | null
  contact_count: number
  deal: TableDeal | null
  last_in_touch: string | null
  last_direction: string | null
  last_subject: string | null
  last_type: string | null
  /** Direction of the latest email or call that has one (Mastersheet "Outreach status"). */
  last_email_direction: string | null
  /** Outreach disposition set on the business, and its follow-up date (Mastersheet "Action date"). */
  disposition: string | null
  follow_up_after: string | null
  /** Deal types in force today, e.g. ['club_card', 'advertiser']. */
  deal_types_in_force: string[]
  attention: Pick<AttentionRow, 'reason' | 'detail' | 'since' | 'is_overdue' | 'reasons' | 'priority' | 'is_snoozed' | 'attention_snoozed_until'> | null
  /** Club Card or advertising deal in force, or ended in the last 60 days and not marked not renewing. */
  is_active: boolean
  /** Club Card or advertising deal ending within 45 days or ended up to 60 days ago. */
  in_renewal_window: boolean
}

export type BusinessTable = {
  today: string
  rows: TableRow[]
  membershipTypes: { value: string; label: string }[]
  businessTypes: { value: string; label: string; is_commercial: boolean }[]
}


/** Today's date in London, the same clock as cc_today() in the database. */
function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const s = value.find((v) => typeof v === 'string' && v.trim() !== '')
  return typeof s === 'string' ? s : null
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Reads every row of a query past the API's 1,000-row cap, a page at a time. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

type BizRow = {
  id: string
  name: string
  status: string | null
  business_type: string | null
  renewal_stage: string | null
  outreach_stage: string | null
  disposition: string | null
  follow_up_after: string | null
  main_contact_id: string | null
  last_contacted_at: string | null
}
type ContractRow = {
  business_id: string
  membership_type: string | null
  contract_start: string | null
  contract_end: string | null
  is_current: boolean
}
type ContactRow = {
  id: string
  business_id: string
  name: string
  role: string | null
  emails: unknown
  phones: unknown
  is_primary: boolean | null
  is_active: boolean | null
  name_is_placeholder: boolean | null
}
type EntryRow = {
  business_id: string
  contact_id: string | null
  entry_date: string | null
  direction: string | null
  subject: string | null
  type: string | null
  qbo: string | null
}

async function loadAll(supabase: Supabase, orgId: string) {
  return Promise.all([
    fetchAll<BizRow>((from, to) =>
      supabase
        // Stage 11a: status, main contact and last in touch come from the truth layer
        .from('v_businesses')
        .select('id, name, status, business_type, renewal_stage, outreach_stage, disposition, follow_up_after, main_contact_id, last_contacted_at')
        .eq('organization_id', orgId)
        .is('merged_into', null)
        .or(`status.is.null,status.neq."${NOT_A_BUSINESS}"`)
        .order('id')
        .range(from, to)
    ),
    fetchAll<ContractRow>((from, to) =>
      supabase
        .from('contracts')
        .select('business_id, membership_type, contract_start, contract_end, is_current')
        .eq('organization_id', orgId)
        .order('id')
        .range(from, to)
    ),
    fetchAll<ContactRow>((from, to) =>
      supabase
        .from('contacts')
        .select('id, business_id, name, role, emails, phones, is_primary, is_active, name_is_placeholder')
        .eq('organization_id', orgId)
        .order('id')
        .range(from, to)
    ),
    // Newest first, so the first entry seen for a business is its latest.
    // Drafts are not contact, and QuickBooks invoices filed as notes are not either.
    fetchAll<EntryRow>((from, to) =>
      supabase
        .from('correspondence')
        .select('business_id, contact_id, entry_date, direction, subject, type, qbo:ai_metadata->>qbo_invoice_id')
        .eq('organization_id', orgId)
        .not('entry_date', 'is', null)
        .or('type.is.null,type.neq.Draft')
        .order('entry_date', { ascending: false })
        .order('id')
        .range(from, to)
    ),
    supabase.from('v_business_attention').select('*').eq('organization_id', orgId),
    supabase.from('org_membership_types').select('value, label, sort_order').eq('org_id', orgId).order('sort_order'),
    supabase.from('org_business_types').select('value, label, is_commercial, sort_order').eq('org_id', orgId).order('sort_order'),
  ])
}

/** The deal to show: one in force (latest end first), else the one that ended last. Active deal types win over others. */
function pickDeal(contracts: ContractRow[], today: string): TableDeal | null {
  if (contracts.length === 0) return null
  const inForce = (c: ContractRow) =>
    c.is_current && (!c.contract_start || c.contract_start <= today) && (!c.contract_end || c.contract_end >= today)
  const rank = (c: ContractRow) => [
    inForce(c) ? 1 : 0,
    ACTIVE_DEAL_TYPES.includes(c.membership_type ?? '') ? 1 : 0,
    c.is_current ? 1 : 0,
  ]
  const sorted = [...contracts].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]
    return (b.contract_end ?? '9999').localeCompare(a.contract_end ?? '9999')
  })
  const c = sorted[0]
  return { membership_type: c.membership_type, contract_start: c.contract_start, contract_end: c.contract_end, in_force: inForce(c) }
}

export async function getBusinessTable(): Promise<{ data?: BusinessTable; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  let loaded: Awaited<ReturnType<typeof loadAll>>
  try {
    loaded = await loadAll(supabase, orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load the table' }
  }
  const [businesses, contracts, contacts, entries, attentionRes, mtRes, btRes] = loaded

  const today = londonToday()
  const graceStart = addDays(today, -ACTIVE_GRACE_DAYS)
  const renewalFrom = addDays(today, -RENEWAL_BACK_DAYS)
  const renewalTo = addDays(today, RENEWAL_AHEAD_DAYS)

  const businessTypes = (btRes.data ?? []).map((t) => ({ value: t.value as string, label: t.label as string, is_commercial: t.is_commercial !== false }))
  const typeByValue = new Map(businessTypes.map((t) => [t.value, t]))

  const contractsBy = new Map<string, ContractRow[]>()
  for (const c of contracts) {
    const list = contractsBy.get(c.business_id) ?? []
    list.push(c)
    contractsBy.set(c.business_id, list)
  }

  const contactsBy = new Map<string, ContactRow[]>()
  const contactById = new Map<string, ContactRow>()
  for (const c of contacts) {
    contactById.set(c.id, c)
    if (c.is_active === false) continue
    const list = contactsBy.get(c.business_id) ?? []
    list.push(c)
    contactsBy.set(c.business_id, list)
  }

  // Latest entry per business, and the latest named person they were in touch with.
  const latestBy = new Map<string, EntryRow>()
  const latestPersonBy = new Map<string, string>()
  const latestDirectionBy = new Map<string, string>()
  for (const e of entries) {
    if (e.qbo) continue
    if (!latestBy.has(e.business_id)) latestBy.set(e.business_id, e)
    if ((e.direction === 'sent' || e.direction === 'received') && !latestDirectionBy.has(e.business_id)) {
      latestDirectionBy.set(e.business_id, e.direction)
    }
    if (e.contact_id && !latestPersonBy.has(e.business_id)) {
      const person = contactById.get(e.contact_id)
      if (person && person.business_id === e.business_id && !person.name_is_placeholder && person.is_active !== false) {
        latestPersonBy.set(e.business_id, e.contact_id)
      }
    }
  }

  // A missing view (before its migration) just means no attention column.
  const attentionBy = new Map<string, AttentionRow>()
  if (!attentionRes.error) for (const a of (attentionRes.data ?? []) as AttentionRow[]) attentionBy.set(a.business_id, a)

  const toContact = (c: ContactRow, isPrimary: boolean): TableContact => ({
    id: c.id,
    name: c.name,
    role: c.role,
    email: firstString(c.emails),
    phone: firstString(c.phones),
    is_primary: isPrimary,
    is_placeholder: !!c.name_is_placeholder,
  })

  const rows: TableRow[] = businesses.map((b) => {
    const bizContacts = contactsBy.get(b.id) ?? []
    // Main contact (chosen by hand, else automatically by v_businesses), else the
    // person on the latest email, else the first named person with an email.
    const primary = bizContacts.find((c) => c.id === b.main_contact_id)
    const latestPerson = latestPersonBy.get(b.id)
    const fallback =
      (latestPerson ? bizContacts.find((c) => c.id === latestPerson) : undefined) ??
      bizContacts.find((c) => !c.name_is_placeholder && firstString(c.emails)) ??
      bizContacts.find((c) => !c.name_is_placeholder) ??
      bizContacts.find((c) => firstString(c.emails))

    const bizContracts = contractsBy.get(b.id) ?? []
    const activeDeals = bizContracts.filter((c) => ACTIVE_DEAL_TYPES.includes(c.membership_type ?? ''))
    const inForceDeals = bizContracts.filter(
      (c) => c.is_current && (!c.contract_start || c.contract_start <= today) && (!c.contract_end || c.contract_end >= today)
    )
    const dealInForce = inForceDeals.some((c) => ACTIVE_DEAL_TYPES.includes(c.membership_type ?? ''))
    const lastEnd = activeDeals.reduce<string | null>((max, c) => (c.contract_end && (!max || c.contract_end > max) ? c.contract_end : max), null)
    const recentlyEnded = !dealInForce && !!lastEnd && lastEnd < today && lastEnd >= graceStart && b.renewal_stage !== 'not_renewing'
    const currentEnds = activeDeals.filter((c) => c.is_current && c.contract_end).map((c) => c.contract_end as string)
    const latestCurrentEnd = currentEnds.sort().at(-1) ?? null

    const type = b.business_type ? typeByValue.get(b.business_type) : undefined
    const latest = latestBy.get(b.id)
    const att = attentionBy.get(b.id)

    return {
      id: b.id,
      name: b.name,
      status: b.status,
      business_type: b.business_type,
      business_type_label: type?.label ?? b.business_type,
      // An untyped business counts as commercial, as in v_business_attention.
      is_commercial: type ? type.is_commercial : true,
      renewal_stage: b.renewal_stage,
      outreach_stage: b.outreach_stage,
      contact: primary ? toContact(primary, true) : fallback ? toContact(fallback, false) : null,
      contact_count: bizContacts.length,
      deal: pickDeal(bizContracts, today),
      last_in_touch: b.last_contacted_at ?? latest?.entry_date ?? null,
      last_direction: latest?.direction ?? null,
      last_subject: latest?.subject ?? null,
      last_type: latest?.type ?? null,
      last_email_direction: latestDirectionBy.get(b.id) ?? null,
      disposition: b.disposition,
      follow_up_after: b.follow_up_after,
      deal_types_in_force: [...new Set(inForceDeals.map((c) => c.membership_type).filter((t): t is string => !!t))],
      attention: att
        ? {
            reason: att.reason,
            detail: att.detail,
            since: att.since,
            is_overdue: att.is_overdue,
            reasons: att.reasons,
            priority: att.priority,
            is_snoozed: att.is_snoozed,
            attention_snoozed_until: att.attention_snoozed_until,
          }
        : null,
      is_active: dealInForce || recentlyEnded,
      in_renewal_window: !!latestCurrentEnd && latestCurrentEnd >= renewalFrom && latestCurrentEnd <= renewalTo,
    }
  })

  return {
    data: {
      today,
      rows,
      membershipTypes: (mtRes.data ?? []).map((t) => ({ value: t.value as string, label: t.label as string })),
      businessTypes,
    },
  }
}
