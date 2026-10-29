'use server'

// Outreach "Work on next" and suggestions (UI overhaul Stage 16c2). The order is worked out
// in the database (v_outreach_next, v_outreach_suggestions; migration 20261029_001) so the
// outreach routine can read the same list. Rules and points are in that migration and in
// supabase/.local/16c2/findings.md. Nothing here writes wording: only stages and "Not now".

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { addBusinessToOutreach } from '@/app/actions/businesses'

export type OutreachBucket =
  | 'reply' | 'chase' | 'follow_up' | 'close' | 'new' | 'find_contact'
  | 'tidy_wrote' | 'tidy_discussion' | 'tidy_contacted' | 'waiting'

export type FitPoints = {
  named_contact: number
  wrote_before: number
  in_news: number
  had_deal: number
  category: number
}

export type OutreachNextRow = {
  business_id: string
  name: string
  category: string | null
  outreach_stage: string
  bucket: OutreachBucket
  next_order: number
  days_quiet: number | null
  last_direction: string | null
  last_email_on: string | null
  has_email: boolean
  draft_ready: boolean
  newsletter_mentions_12m: number
  fit_score: number
  points: FitPoints
}

export type OutreachSuggestion = {
  business_id: string
  name: string
  category: string | null
  status: string | null
  last_contacted_at: string | null
  is_former: boolean
  is_unreviewed: boolean
  in_newsletter: boolean
  in_recent_news: boolean
  last_article: string | null
  newsletter_mentions_12m: number
  has_email: boolean
  fit_score: number
  points: FitPoints
}

type Raw = Record<string, unknown>

const points = (r: Raw): FitPoints => ({
  named_contact: Number(r.pts_named_contact ?? 0),
  wrote_before: Number(r.pts_wrote_before ?? 0),
  in_news: Number(r.pts_in_news ?? 0),
  had_deal: Number(r.pts_had_deal ?? 0),
  category: Number(r.pts_category ?? 0),
})

async function auth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' as const }
  return { supabase, user, orgId }
}

export async function getOutreachNext(): Promise<{ data?: { rows: OutreachNextRow[]; suggestions: OutreachSuggestion[] }; error?: string }> {
  const a = await auth()
  if ('error' in a) return { error: a.error }
  const { supabase, orgId } = a

  const [nextRes, sugRes] = await Promise.all([
    supabase
      .from('v_outreach_next')
      .select('business_id, name, category, outreach_stage, bucket, next_order, days_quiet, last_direction, last_email_on, has_email, draft_ready, newsletter_mentions_12m, fit_score, pts_named_contact, pts_wrote_before, pts_in_news, pts_had_deal, pts_category')
      .eq('organization_id', orgId)
      .neq('bucket', 'waiting')
      .order('next_order', { ascending: true })
      .limit(2000),
    supabase
      .from('v_outreach_suggestions')
      .select('business_id, name, category, status, last_contacted_at, is_former, is_unreviewed, in_newsletter, in_recent_news, last_article, newsletter_mentions_12m, has_email, fit_score, pts_named_contact, pts_wrote_before, pts_in_news, pts_had_deal, pts_category')
      .eq('organization_id', orgId)
      .order('fit_score', { ascending: false })
      .order('name', { ascending: true })
      .limit(500),
  ])
  if (nextRes.error) return { error: nextRes.error.message }
  if (sugRes.error) return { error: sugRes.error.message }

  const rows = ((nextRes.data ?? []) as Raw[]).map((r) => ({
    business_id: r.business_id as string,
    name: r.name as string,
    category: (r.category as string | null) ?? null,
    outreach_stage: r.outreach_stage as string,
    bucket: r.bucket as OutreachBucket,
    next_order: Number(r.next_order),
    days_quiet: r.days_quiet == null ? null : Number(r.days_quiet),
    last_direction: (r.last_direction as string | null) ?? null,
    last_email_on: (r.last_email_on as string | null) ?? null,
    has_email: !!r.has_email,
    draft_ready: !!r.draft_ready,
    newsletter_mentions_12m: Number(r.newsletter_mentions_12m ?? 0),
    fit_score: Number(r.fit_score ?? 0),
    points: points(r),
  }))
  const suggestions = ((sugRes.data ?? []) as Raw[]).map((r) => ({
    business_id: r.business_id as string,
    name: r.name as string,
    category: (r.category as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    last_contacted_at: (r.last_contacted_at as string | null) ?? null,
    is_former: !!r.is_former,
    is_unreviewed: !!r.is_unreviewed,
    in_newsletter: !!r.in_newsletter,
    in_recent_news: !!r.in_recent_news,
    last_article: (r.last_article as string | null) ?? null,
    newsletter_mentions_12m: Number(r.newsletter_mentions_12m ?? 0),
    has_email: !!r.has_email,
    fit_score: Number(r.fit_score ?? 0),
    points: points(r),
  }))
  return { data: { rows, suggestions } }
}

const OUTREACH_FIELDS = [
  'outreach_stage', 'outreach_identified_at', 'outreach_contacted_at', 'outreach_followed_up_at',
  'outreach_in_discussion_at', 'outreach_won_at', 'outreach_invoice_paid_at', 'outreach_declined_at',
] as const

/**
 * Mark one or many businesses Not interested (Close? and the Tidy up groups). Each row's
 * stage and dates are copied to cc_phase0_backup first under one batch reason, so Undo
 * puts them all back exactly. The lead mirror follows the stage as it does for a board move.
 */
export async function closeOutreachBusinesses(ids: string[]): Promise<{ batch?: string; closed?: number; error?: string }> {
  const a = await auth()
  if ('error' in a) return { error: a.error }
  const { supabase, user, orgId } = a
  const unique = [...new Set(ids)].slice(0, 500)
  if (unique.length === 0) return { closed: 0 }

  const { data: before, error: readError } = await supabase
    .from('businesses')
    .select(['id', 'organization_id', ...OUTREACH_FIELDS].join(', '))
    .eq('organization_id', orgId)
    .in('id', unique)
  if (readError) return { error: readError.message }
  const open = ((before ?? []) as unknown as Raw[]).filter((b) => b.outreach_stage && b.outreach_stage !== 'not_interested')
  if (open.length === 0) return { closed: 0 }

  const batch = `outreach_close ${user.id} ${new Date().toISOString()}`
  const { error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert(open.map((b) => ({ table_name: 'businesses', row_id: b.id, before_row: b, reason: batch })))
  if (backupError) return { error: `Not changed: the backup failed (${backupError.message})` }

  const { error } = await supabase
    .from('businesses')
    .update({ outreach_stage: 'not_interested', outreach_declined_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .in('id', open.map((b) => b.id as string))
  if (error) return { error: error.message }
  revalidatePath('/outreach')
  revalidatePath('/today')
  revalidatePath('/businesses')
  return { batch, closed: open.length }
}

/** Undo closeOutreachBusinesses: every stage and date back as it was. */
export async function undoCloseOutreachBusinesses(batch: string): Promise<{ error?: string }> {
  const a = await auth()
  if ('error' in a) return { error: a.error }
  const { supabase, user, orgId } = a
  if (!batch.startsWith(`outreach_close ${user.id} `)) return { error: 'Nothing to undo' }

  const { data: backups, error: readError } = await supabase
    .from('cc_phase0_backup')
    .select('row_id, before_row')
    .eq('table_name', 'businesses')
    .eq('reason', batch)
  if (readError) return { error: readError.message }
  for (const b of backups ?? []) {
    const row = b.before_row as Raw
    if (row.organization_id !== orgId) continue
    const { error } = await supabase
      .from('businesses')
      .update(Object.fromEntries(OUTREACH_FIELDS.map((f) => [f, row[f] ?? null])))
      .eq('id', b.row_id as string)
      .eq('organization_id', orgId)
    if (error) return { error: error.message }
  }
  revalidatePath('/outreach')
  revalidatePath('/today')
  revalidatePath('/businesses')
  return {}
}

/**
 * Accept a suggestion: the business joins outreach at Identified through addBusinessToOutreach
 * (the board's own action). Its old stage dates are backed up first, so undoRemoveFromOutreach
 * with the returned id puts them back exactly.
 */
export async function acceptOutreachSuggestion(businessId: string): Promise<{ backupId?: number; error?: string }> {
  const a = await auth()
  if ('error' in a) return { error: a.error }
  const { supabase, user, orgId } = a
  const { data: before, error: readError } = await supabase
    .from('businesses')
    .select(['id', 'organization_id', ...OUTREACH_FIELDS].join(', '))
    .eq('id', businessId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!before) return { error: 'Business not found' }
  const { data: backup, error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert({ table_name: 'businesses', row_id: businessId, before_row: before, reason: `outreach_accept_suggestion ${user.id}` })
    .select('id')
    .single()
  if (backupError) return { error: `Not added: the backup failed (${backupError.message})` }
  const result = await addBusinessToOutreach(businessId)
  if (result.error) return { error: result.error }
  revalidatePath('/outreach')
  return { backupId: backup.id as number }
}

/** "Not now" on a suggestion: it leaves the list until Undo. */
export async function dismissOutreachSuggestion(businessId: string): Promise<{ error?: string }> {
  const a = await auth()
  if ('error' in a) return { error: a.error }
  const { supabase, user, orgId } = a
  const { error } = await supabase
    .from('outreach_suggestion_dismissals')
    .upsert({ business_id: businessId, organization_id: orgId, dismissed_by: user.id })
  if (error) return { error: error.message }
  revalidatePath('/outreach')
  return {}
}

export async function undoDismissOutreachSuggestion(businessId: string): Promise<{ error?: string }> {
  const a = await auth()
  if ('error' in a) return { error: a.error }
  const { supabase, orgId } = a
  const { error } = await supabase
    .from('outreach_suggestion_dismissals')
    .delete()
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/outreach')
  return {}
}
