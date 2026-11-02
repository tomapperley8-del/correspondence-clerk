'use server'

// Companies House on Data health (Stage 17b (3)): "Look up companies now" searches the register for each
// Active, Former and Unreviewed business (a batch per call; the button repeats until none are left), and
// the matches that need a person are listed to Confirm or reject, one or many at once. Each change is a
// batch in cc_phase0_backup ('company-review-…') that Undo takes back. Read-only on the register.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { attachCompany, businessesToLookUp, lookUpBatch, type LookupResult } from '@/lib/prospecting/companies-house-records'

export type CompanyOverview = { records: number; waiting: number; toConfirm: number; notTrading: number }
export type CompanyMatch = {
  candidate_id: string
  business_id: string
  business_name: string
  company_number: string
  company_name: string
  registered_office: string | null
  company_status: string | null
  why: string | null
}
export type CompanyReviewResult = { ok: number; failed: { company: string; error: string }[]; batch?: string; error?: string }

async function who() {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' as const }
  return { supabase, orgId }
}

const batchId = () => `company-review-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`

export async function getCompanyOverview(): Promise<{ data?: CompanyOverview; error?: string }> {
  const w = await who()
  if ('error' in w) return { error: w.error }
  const [rec, todo, conf, notTrading] = await Promise.all([
    w.supabase.from('company_records').select('business_id', { count: 'exact', head: true }).eq('organization_id', w.orgId),
    businessesToLookUp(w.supabase, w.orgId),
    w.supabase.from('v_company_matches_to_review').select('candidate_id', { count: 'exact', head: true }).eq('organization_id', w.orgId),
    w.supabase.from('v_data_health').select('business_id', { count: 'exact', head: true }).eq('organization_id', w.orgId).eq('check_key', 'company_not_trading'),
  ])
  return { data: { records: rec.count ?? 0, waiting: todo.length, toConfirm: conf.count ?? 0, notTrading: notTrading.count ?? 0 } }
}

/** One batch of look-ups (about 40 seconds of register calls). The button calls it again while `remaining` is above 0. */
export async function runCompanyLookup(): Promise<LookupResult> {
  const w = await who()
  if ('error' in w) return { looked: 0, attached: 0, suggested: 0, remaining: 0, error: w.error }
  const r = await lookUpBatch(createServiceRoleClient(), { orgId: w.orgId, budgetMs: 45000 })
  revalidatePath('/data-health')
  return r
}

export async function getCompanyMatches(): Promise<{ data?: CompanyMatch[]; error?: string }> {
  const w = await who()
  if ('error' in w) return { error: w.error }
  const { data, error } = await w.supabase.from('v_company_matches_to_review')
    .select('candidate_id, business_id, business_name, company_number, company_name, registered_office, company_status, why')
    .eq('organization_id', w.orgId).order('business_name').limit(1000)
  if (error) return { error: error.message }
  return { data: (data ?? []) as CompanyMatch[] }
}

/** Confirm: read each company, save it as the business's record, and close the business's other suggestions. */
export async function confirmCompanies(candidateIds: string[]): Promise<CompanyReviewResult> {
  const w = await who()
  if ('error' in w) return { ok: 0, failed: [], error: w.error }
  if (candidateIds.length === 0) return { ok: 0, failed: [] }
  const batch = batchId()
  const svc = createServiceRoleClient()
  const { data: cands, error } = await w.supabase.from('company_candidates').select('id, business_id, company_number, company_name, state')
    .in('id', candidateIds).eq('organization_id', w.orgId).eq('state', 'pending')
  if (error) return { ok: 0, failed: [], error: error.message }
  const failed: CompanyReviewResult['failed'] = []
  const backup: { table_name: string; row_id: string; before_row: Record<string, unknown>; reason: string }[] = []
  const taken = new Set<string>()
  let ok = 0
  for (const c of cands ?? []) {
    if (taken.has(c.business_id)) continue // one company per business in a batch: the first ticked wins
    try {
      const err = await attachCompany(svc, w.orgId, c.business_id, c.company_number, 'manual_review')
      if (err) { failed.push({ company: c.company_name, error: err }); continue }
    } catch (e) {
      failed.push({ company: c.company_name, error: (e as Error).message })
      continue
    }
    taken.add(c.business_id)
    const { data: others } = await svc.from('company_candidates').select('id, state').eq('business_id', c.business_id).eq('state', 'pending')
    for (const o of others ?? []) backup.push({ table_name: 'company_candidates_state', row_id: o.id, before_row: { state: o.state }, reason: batch })
    await svc.from('company_candidates').update({ state: 'rejected' }).eq('business_id', c.business_id).eq('state', 'pending').neq('id', c.id)
    await svc.from('company_candidates').update({ state: 'confirmed' }).eq('id', c.id)
    backup.push({ table_name: 'company_records_created', row_id: c.business_id, before_row: { company_number: c.company_number, candidate_id: c.id }, reason: batch })
    ok++
  }
  if (backup.length > 0) await svc.from('cc_phase0_backup').insert(backup)
  revalidatePath('/data-health')
  revalidatePath('/businesses')
  return { ok, failed, batch: ok > 0 ? batch : undefined }
}

/** "Not this company": the suggestion is closed and never offered again for that business. */
export async function rejectCompanies(candidateIds: string[]): Promise<CompanyReviewResult> {
  const w = await who()
  if ('error' in w) return { ok: 0, failed: [], error: w.error }
  if (candidateIds.length === 0) return { ok: 0, failed: [] }
  const batch = batchId()
  const { data, error } = await w.supabase.from('company_candidates').update({ state: 'rejected' })
    .in('id', candidateIds).eq('organization_id', w.orgId).eq('state', 'pending').select('id')
  if (error) return { ok: 0, failed: [], error: error.message }
  const ids = (data ?? []).map((d: { id: string }) => d.id)
  if (ids.length > 0) {
    await createServiceRoleClient().from('cc_phase0_backup').insert(
      ids.map((id) => ({ table_name: 'company_candidates_state', row_id: id, before_row: { state: 'pending' }, reason: batch })),
    )
  }
  revalidatePath('/data-health')
  return { ok: ids.length, failed: [], batch: ids.length > 0 ? batch : undefined }
}

/** Take back one batch: records it made go, and suggestions return to waiting. */
export async function undoCompanyReview(batch: string): Promise<{ records: number; suggestions: number; error?: string }> {
  const w = await who()
  if ('error' in w) return { records: 0, suggestions: 0, error: w.error }
  if (!/^company-review-[\w-]+$/.test(batch)) return { records: 0, suggestions: 0, error: 'Not a review batch' }
  const svc = createServiceRoleClient()
  const { data: rows, error } = await svc.from('cc_phase0_backup').select('table_name, row_id, before_row').eq('reason', batch)
  if (error) return { records: 0, suggestions: 0, error: error.message }
  const made = (rows ?? []).filter((r) => r.table_name === 'company_records_created')
  const states = (rows ?? []).filter((r) => r.table_name === 'company_candidates_state')
  const { data: gone } = made.length
    ? await w.supabase.from('company_records').delete().in('business_id', made.map((m) => m.row_id)).eq('organization_id', w.orgId).select('business_id')
    : { data: [] }
  for (const s of states) {
    await w.supabase.from('company_candidates').update({ state: (s.before_row as { state: string }).state }).eq('id', s.row_id).eq('organization_id', w.orgId)
  }
  for (const m of made) {
    const id = (m.before_row as { candidate_id?: string }).candidate_id
    if (id) await w.supabase.from('company_candidates').update({ state: 'pending' }).eq('id', id).eq('organization_id', w.orgId)
  }
  revalidatePath('/data-health')
  revalidatePath('/businesses')
  return { records: gone?.length ?? 0, suggestions: states.length + made.length }
}
