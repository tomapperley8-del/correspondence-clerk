'use server'

// QuickBooks customers to match (Stage 17b): customers with invoices and no business, listed on Data health
// (view v_qbo_customers_to_match). Confirm a suggestion, choose a business, or make a new business, one
// or many at once. Each change is one batch recorded in cc_phase0_backup (reason 'qbo review <batch>') so
// Undo can take it back. Nothing is written to QuickBooks.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type QboToMatch = {
  qbo_customer_id: string
  customer_name: string
  customer_email: string | null
  invoices_n: number
  total_invoiced: number
  last_invoice_date: string | null
  open_balance: number
  suggested_business_id: string | null
  suggested_business_name: string | null
  suggested_why: string | null
}

export type QboMatchResult = { ok: number; failed: { customer: string; error: string }[]; batch?: string; error?: string }

async function who() {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' as const }
  return { supabase, orgId, userId: user.id }
}

export async function getQboToMatch(): Promise<{ data?: { rows: QboToMatch[]; businesses: { id: string; name: string }[] }; error?: string }> {
  const w = await who()
  if ('error' in w) return { error: w.error }
  const [rows, businesses] = await Promise.all([
    w.supabase.from('v_qbo_customers_to_match')
      .select('qbo_customer_id, customer_name, customer_email, invoices_n, total_invoiced, last_invoice_date, open_balance, suggested_business_id, suggested_business_name, suggested_why')
      .eq('organization_id', w.orgId)
      .order('last_invoice_date', { ascending: false })
      .limit(1000),
    w.supabase.from('businesses').select('id, name').eq('organization_id', w.orgId).is('merged_into', null).order('name').limit(5000),
  ])
  if (rows.error) return { error: rows.error.message }
  return { data: { rows: (rows.data ?? []) as QboToMatch[], businesses: (businesses.data ?? []) as { id: string; name: string }[] } }
}

const batchId = () => `qbo-review-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`

/** Link customers to businesses: `pairs` is each customer with the business chosen for it. */
export async function matchQboCustomers(pairs: { customerId: string; businessId: string }[]): Promise<QboMatchResult> {
  const w = await who()
  if ('error' in w) return { ok: 0, failed: [], error: w.error }
  if (pairs.length === 0) return { ok: 0, failed: [] }
  const batch = batchId()
  const reason = batch
  const failed: QboMatchResult['failed'] = []
  const made: { id: string; customerId: string }[] = []
  for (const p of pairs) {
    const { data, error } = await w.supabase.from('qbo_links').insert({
      organization_id: w.orgId, business_id: p.businessId, qbo_customer_id: p.customerId,
      match_method: 'manual_review', confidence: 1, confirmed: true, confirmed_at: new Date().toISOString(),
      note: 'Data health review (Stage 17b)',
    }).select('id').single()
    if (error || !data) failed.push({ customer: p.customerId, error: error?.message ?? 'not saved' })
    else made.push({ id: data.id, customerId: p.customerId })
  }
  if (made.length > 0) {
    await createServiceRoleClient().from('cc_phase0_backup').insert(
      made.map((m) => ({ table_name: 'qbo_links_created', row_id: m.id, before_row: { qbo_customer_id: m.customerId }, reason })),
    )
  }
  revalidatePath('/data-health')
  return { ok: made.length, failed, batch: made.length > 0 ? batch : undefined }
}

const DEAL_WORDS = /(club card|advertis|sidebar|leaderboard|banner|partnership|sponsor)/i

/** Make a new business for each customer (named as in QuickBooks) and link it. A customer whose invoices
 *  were for Club Card or advertising makes a Former business; the status is worked out from its contracts. */
export async function makeBusinessesFromQbo(customerIds: string[]): Promise<QboMatchResult> {
  const w = await who()
  if ('error' in w) return { ok: 0, failed: [], error: w.error }
  if (customerIds.length === 0) return { ok: 0, failed: [] }
  const batch = batchId()
  const { data: customers, error: cErr } = await w.supabase.from('qbo_customers')
    .select('qbo_customer_id, display_name').in('qbo_customer_id', customerIds).eq('organization_id', w.orgId)
  if (cErr) return { ok: 0, failed: [], error: cErr.message }
  const { data: invs } = await w.supabase.from('qbo_invoices').select('qbo_customer_id, line_description').in('qbo_customer_id', customerIds)
  const hadDeal = new Set((invs ?? []).filter((i) => DEAL_WORDS.test(i.line_description ?? '')).map((i) => i.qbo_customer_id))
  const failed: QboMatchResult['failed'] = []
  const backup: { table_name: string; row_id: string; before_row: Record<string, unknown>; reason: string }[] = []
  let ok = 0
  for (const c of customers ?? []) {
    const name = c.display_name.trim()
    const { data: biz, error } = await w.supabase.from('businesses').insert({
      name, normalized_name: name.toLowerCase(), organization_id: w.orgId,
      status: hadDeal.has(c.qbo_customer_id) ? 'Former' : null,
    }).select('id').single()
    if (error || !biz) {
      failed.push({ customer: name, error: error?.code === '23505' ? 'A business with this name already exists: choose it instead' : (error?.message ?? 'not saved') })
      continue
    }
    const { data: link, error: lErr } = await w.supabase.from('qbo_links').insert({
      organization_id: w.orgId, business_id: biz.id, qbo_customer_id: c.qbo_customer_id,
      match_method: 'manual_review', confidence: 1, confirmed: true, confirmed_at: new Date().toISOString(),
      note: 'Data health review (Stage 17b): new business',
    }).select('id').single()
    if (lErr || !link) {
      await w.supabase.from('businesses').delete().eq('id', biz.id)
      failed.push({ customer: name, error: lErr?.message ?? 'not linked' })
      continue
    }
    backup.push({ table_name: 'businesses_created', row_id: biz.id, before_row: { qbo_customer_id: c.qbo_customer_id }, reason: batch })
    backup.push({ table_name: 'qbo_links_created', row_id: link.id, before_row: { qbo_customer_id: c.qbo_customer_id }, reason: batch })
    ok++
  }
  if (backup.length > 0) await createServiceRoleClient().from('cc_phase0_backup').insert(backup)
  revalidatePath('/data-health')
  revalidatePath('/businesses')
  return { ok, failed, batch: ok > 0 ? batch : undefined }
}

/** Take back one batch: the links go, and so do the businesses it made (only while they hold nothing else). */
export async function undoQboMatch(batch: string): Promise<{ links: number; businesses: number; kept: number; error?: string }> {
  const w = await who()
  if ('error' in w) return { links: 0, businesses: 0, kept: 0, error: w.error }
  if (!/^qbo-review-[\w-]+$/.test(batch)) return { links: 0, businesses: 0, kept: 0, error: 'Not a review batch' }
  const svc = createServiceRoleClient()
  const { data: rows, error } = await svc.from('cc_phase0_backup').select('table_name, row_id').eq('reason', batch)
  if (error) return { links: 0, businesses: 0, kept: 0, error: error.message }
  const linkIds = (rows ?? []).filter((r) => r.table_name === 'qbo_links_created').map((r) => r.row_id)
  const bizIds = (rows ?? []).filter((r) => r.table_name === 'businesses_created').map((r) => r.row_id)
  // Only this organisation's own links
  const { data: links } = linkIds.length
    ? await w.supabase.from('qbo_links').delete().in('id', linkIds).eq('organization_id', w.orgId).select('id')
    : { data: [] }
  let businesses = 0
  let kept = 0
  for (const id of bizIds) {
    const [{ count: mail }, { count: people }, { count: deals }] = await Promise.all([
      svc.from('correspondence').select('id', { count: 'exact', head: true }).eq('business_id', id),
      svc.from('contacts').select('id', { count: 'exact', head: true }).eq('business_id', id),
      svc.from('contracts').select('id', { count: 'exact', head: true }).eq('business_id', id),
    ])
    if ((mail ?? 0) + (people ?? 0) + (deals ?? 0) > 0) { kept++; continue }
    const { error: dErr } = await w.supabase.from('businesses').delete().eq('id', id).eq('organization_id', w.orgId)
    if (dErr) kept++
    else businesses++
  }
  revalidatePath('/data-health')
  revalidatePath('/businesses')
  return { links: links?.length ?? 0, businesses, kept }
}
