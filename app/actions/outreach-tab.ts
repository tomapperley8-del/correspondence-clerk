'use server'

// The Outreach tab (UI overhaul Stage 16c). Like the Club Card tab, nothing new
// is stored or worked out for anyone else: it joins what the rest of the app
// already reads. The pipeline is each business's outreach_stage (the same
// field the spreadsheet column, the leads mirror and the outreach routine use),
// with main contact, last in touch and next to-do from the Businesses table
// (getBusinessTable, built on v_businesses). Leads are the prospecting
// routine's, drafts the outreach routine's. Results by month are counted here
// from the stage dates and correspondence; no other reader needs them yet.

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { getBusinessTable, type TableRow } from '@/app/actions/business-table'
import { getProspectLeads, getRoutineDrafts, type ProspectLead, type RoutineDraft } from '@/app/actions/leads'

export type OutreachTabRow = {
  id: string
  name: string
  stage: string
  /** The date the business reached its current stage. */
  since: string | null
  table: TableRow | null
}

export type OutreachMonth = { month: string; label: string; contacted: number; replied: number; won: number }

export type OutreachSummary = {
  onOutreach: number
  contactedThisMonth: number
  thisMonthLabel: string
  inDiscussion: number
  wonThisYear: number
  year: string
  leads: number
  /** Leads already accepted: their business is on the pipeline. */
  leadsAccepted: number
}

export type OutreachTabData = {
  today: string
  rows: OutreachTabRow[]
  leads: ProspectLead[]
  drafts: RoutineDraft[]
  months: OutreachMonth[]
  summary: OutreachSummary
}

/** A reply counts when they email within this many days of the first approach. */
const REPLY_DAYS = 30
/** Months shown in Results by month, this one included. */
const MONTHS = 6
/** Drafts from the outreach routine this recent are listed. */
const DRAFT_DAYS = 30

const STAGE_DATE: Record<string, string> = {
  identified: 'outreach_identified_at',
  contacted: 'outreach_contacted_at',
  followed_up: 'outreach_followed_up_at',
  in_discussion: 'outreach_in_discussion_at',
  won: 'outreach_won_at',
  invoice_paid: 'outreach_invoice_paid_at',
  not_interested: 'outreach_declined_at',
}

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

function monthStart(isoDate: string, add: number): string {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + add, 1)).toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function getOutreachTab(): Promise<{ data?: OutreachTabData; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const today = londonToday()
  const firstMonth = monthStart(today, -(MONTHS - 1))

  const [tableRes, bizRes, leadsRes, draftsRes] = await Promise.all([
    getBusinessTable(),
    // Every business with an outreach stage or a first approach or win on record:
    // a business taken off outreach after it was contacted still counts in Results.
    supabase
      .from('v_businesses')
      .select('id, name, outreach_stage, outreach_identified_at, outreach_contacted_at, outreach_followed_up_at, outreach_in_discussion_at, outreach_won_at, outreach_invoice_paid_at, outreach_declined_at')
      .eq('organization_id', orgId)
      .is('merged_into', null)
      .or('outreach_stage.not.is.null,outreach_contacted_at.not.is.null,outreach_won_at.not.is.null'),
    getProspectLeads(),
    getRoutineDrafts(DRAFT_DAYS, 200),
  ])
  if (tableRes.error || !tableRes.data) return { error: tableRes.error ?? 'Could not load the businesses' }
  if (bizRes.error) return { error: bizRes.error.message }

  const tableById = new Map(tableRes.data.rows.map((r) => [r.id, r]))
  const biz = (bizRes.data ?? []) as Record<string, string | null>[]

  const rows: OutreachTabRow[] = biz
    .filter((b) => b.outreach_stage && tableById.has(b.id as string))
    .map((b) => ({
      id: b.id as string,
      name: b.name as string,
      stage: b.outreach_stage as string,
      since: (STAGE_DATE[b.outreach_stage as string] && b[STAGE_DATE[b.outreach_stage as string]]) || null,
      table: tableById.get(b.id as string) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))

  // Results by month: first approach, a reply within REPLY_DAYS, a win.
  const contacted = biz.filter((b) => b.outreach_contacted_at && b.outreach_contacted_at >= addDays(firstMonth, -REPLY_DAYS))
  const replied = new Set<string>()
  if (contacted.length > 0) {
    const { data: received, error } = await supabase
      .from('correspondence')
      .select('business_id, entry_date')
      .eq('organization_id', orgId)
      .eq('direction', 'received')
      .in('business_id', contacted.map((b) => b.id as string))
      .gte('entry_date', firstMonth)
    if (error) return { error: error.message }
    const contactedAt = new Map(contacted.map((b) => [b.id as string, (b.outreach_contacted_at as string).slice(0, 10)]))
    for (const c of received ?? []) {
      const from = contactedAt.get(c.business_id)
      const day = (c.entry_date as string | null)?.slice(0, 10)
      if (from && day && day >= from && day <= addDays(from, REPLY_DAYS)) replied.add(c.business_id)
    }
  }

  const months: OutreachMonth[] = []
  for (let i = 0; i < MONTHS; i++) {
    const from = monthStart(firstMonth, i)
    const to = monthStart(firstMonth, i + 1)
    const inMonth = (d: string | null) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) < to
    const contactedHere = biz.filter((b) => inMonth(b.outreach_contacted_at))
    months.push({
      month: from,
      label: new Date(`${from}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      contacted: contactedHere.length,
      replied: contactedHere.filter((b) => replied.has(b.id as string)).length,
      won: biz.filter((b) => inMonth(b.outreach_won_at)).length,
    })
  }

  // A lead still needs a decision until its business is on outreach: Accept
  // links it and puts the business at Identified (acceptProspectLead).
  const onPipeline = new Set(rows.map((r) => r.id))
  const open = (leadsRes.data ?? []).filter((l) => l.status === 'new' || l.status === 'reviewing')
  const leads = open.filter((l) => !l.matched_business_id || !onPipeline.has(l.matched_business_id))
  const drafts = (draftsRes.data ?? []).filter((d) => d.routine === 'outreach' && d.outcome === 'drafted' && !d.sent_at)

  const thisMonth = monthStart(today, 0)
  const year = today.slice(0, 4)
  const summary: OutreachSummary = {
    onOutreach: rows.length,
    contactedThisMonth: biz.filter((b) => (b.outreach_contacted_at ?? '').slice(0, 10) >= thisMonth).length,
    thisMonthLabel: new Date(`${thisMonth}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }),
    inDiscussion: rows.filter((r) => r.stage === 'in_discussion').length,
    wonThisYear: biz.filter((b) => (b.outreach_won_at ?? '').startsWith(year)).length,
    year,
    leads: leads.length,
    leadsAccepted: open.length - leads.length,
  }

  return { data: { today, rows, leads, drafts, months, summary } }
}
