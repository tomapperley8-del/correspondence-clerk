'use server'

// Outreach "Win back" and "Fill a category" (UI overhaul Stage 11c, layout C, 29 Oct). The
// lists and their order are worked out in the database (v_outreach_winbacks, v_category_gaps,
// v_category_gap_prospects; migration 20261029_004) so a routine can read the same thing.
// Ways off the list reuse Work on next's: Not now (outreach_snoozes), Not interested
// (closeOutreachBusinesses), Take off outreach, and "Not a win-back" (the suggestion dismissal).

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type WinBackContact = { name: string; role: string | null; email: string | null; is_placeholder: boolean } | null

export type WinBackRow = {
  business_id: string
  name: string
  category: string | null
  outreach_stage: string | null
  deals: number
  last_deal_end: string | null
  last_deal_type: string | null
  paid_total: number
  emails: number
  last_email_on: string | null
  last_dealt_on: string | null
  points: { recent: number; paid: number; emails: number }
  score: number
  snoozed_until: string | null
  contact: WinBackContact
}

export type GapProspect = {
  business_id: string
  name: string
  category: string
  status: string
  outreach_stage: string | null
  last_email_on: string | null
  fit_score: number
  had_deal: boolean
  has_email: boolean
  has_named_contact: boolean
  snoozed_until: string | null
  contact: WinBackContact
}

export type CategoryCount = { category: string; members: number; is_thin: boolean }

export type OutreachWinbacks = { winbacks: WinBackRow[]; gaps: CategoryCount[]; prospects: GapProspect[] }

type Raw = Record<string, unknown>

export async function getOutreachWinbacks(): Promise<{ data?: OutreachWinbacks; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const [w, g, p] = await Promise.all([
    supabase.from('v_outreach_winbacks').select('*').eq('organization_id', orgId).order('winback_order').limit(500),
    supabase.from('v_category_gaps').select('category, members, is_thin').eq('organization_id', orgId).order('sort'),
    supabase.from('v_category_gap_prospects').select('*').eq('organization_id', orgId).order('category').order('gap_order').limit(1000),
  ])
  const failed = w.error ?? g.error ?? p.error
  if (failed) return { error: failed.message }
  const wRows = (w.data ?? []) as Raw[]
  const pRows = (p.data ?? []) as Raw[]

  // Main contacts for both lists, one query
  const contactIds = [...new Set([...wRows, ...pRows].map((r) => r.main_contact_id as string | null).filter((x): x is string => !!x))]
  const contacts = new Map<string, WinBackContact>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data, error } = await supabase
      .from('contacts').select('id, name, role, emails, name_is_placeholder').in('id', contactIds.slice(i, i + 200))
    if (error) return { error: error.message }
    for (const c of data ?? []) {
      const emails = Array.isArray(c.emails) ? (c.emails as unknown[]).filter((e): e is string => typeof e === 'string') : []
      contacts.set(c.id as string, { name: c.name as string, role: (c.role as string | null) ?? null, email: emails[0] ?? null, is_placeholder: !!c.name_is_placeholder })
    }
  }
  const contactOf = (r: Raw) => (r.main_contact_id ? contacts.get(r.main_contact_id as string) ?? null : null)

  return {
    data: {
      winbacks: wRows.map((r) => ({
        business_id: r.business_id as string,
        name: r.name as string,
        category: (r.category as string | null) ?? null,
        outreach_stage: (r.outreach_stage as string | null) ?? null,
        deals: Number(r.deals ?? 0),
        last_deal_end: (r.last_deal_end as string | null) ?? null,
        last_deal_type: (r.last_deal_type as string | null) ?? null,
        paid_total: Number(r.paid_total ?? 0),
        emails: Number(r.emails ?? 0),
        last_email_on: (r.last_email_on as string | null) ?? null,
        last_dealt_on: (r.last_dealt_on as string | null) ?? null,
        points: { recent: Number(r.pts_recent ?? 0), paid: Number(r.pts_paid ?? 0), emails: Number(r.pts_emails ?? 0) },
        score: Number(r.score ?? 0),
        snoozed_until: (r.snoozed_until as string | null) ?? null,
        contact: contactOf(r),
      })),
      gaps: ((g.data ?? []) as Raw[]).map((r) => ({ category: r.category as string, members: Number(r.members ?? 0), is_thin: !!r.is_thin })),
      prospects: pRows.map((r) => ({
        business_id: r.business_id as string,
        name: r.name as string,
        category: r.category as string,
        status: r.status as string,
        outreach_stage: (r.outreach_stage as string | null) ?? null,
        last_email_on: (r.last_email_on as string | null) ?? null,
        fit_score: Number(r.fit_score ?? 0),
        had_deal: !!r.had_deal,
        has_email: !!r.has_email,
        has_named_contact: !!r.has_named_contact,
        snoozed_until: (r.snoozed_until as string | null) ?? null,
        contact: contactOf(r),
      })),
    },
  }
}
