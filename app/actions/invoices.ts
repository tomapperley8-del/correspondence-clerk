'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { endContract, undoEndContract } from '@/app/actions/end-contract'
import { refreshTruth } from '@/lib/refresh-truth'

// Mark void on a QuickBooks invoice (UI overhaul Stage 14a v2, migration
// 20261024_002_invoice_void). The database holds the mirror row at balance 0
// and memo 'Voided', which every reader of unpaid invoices already skips, so
// it stops counting everywhere at once. Tom voids it in QuickBooks himself.
//
// Stage 10: the app then asks "Was this their membership?"; a yes ends the
// contract the invoice belongs to (so the status follows from cc_business_status())
// and the answer carries an Undo.

/** The contracts an invoice belongs to (its own contract, or one that lists it), and the business. */
async function contractsFor(supabase: Awaited<ReturnType<typeof createClient>>, invoiceId: string) {
  const [own, listed, inv] = await Promise.all([
    supabase.from('contracts').select('id, business_id, membership_type, is_current').eq('qbo_invoice_id', invoiceId),
    supabase.from('contract_invoices').select('contract_id').eq('qbo_invoice_id', invoiceId),
    supabase.from('qbo_invoices').select('qbo_customer_id').eq('qbo_invoice_id', invoiceId).maybeSingle(),
  ])
  const ids = (listed.data ?? []).map((r) => r.contract_id as string)
  const more = ids.length ? await supabase.from('contracts').select('id, business_id, membership_type, is_current').in('id', ids) : { data: [] as { id: string; business_id: string; membership_type: string | null; is_current: boolean }[] }
  const contracts = [...(own.data ?? []), ...(more.data ?? [])].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i)
  let businessId: string | null = contracts[0]?.business_id ?? null
  if (!businessId && inv.data?.qbo_customer_id) {
    const { data: link } = await supabase.from('qbo_links').select('business_id').eq('qbo_customer_id', inv.data.qbo_customer_id).limit(1).maybeSingle()
    businessId = link?.business_id ?? null
  }
  return { contracts, businessId }
}

export async function markInvoiceVoid(invoiceId: string, voided = true): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('mark_invoice_void', { p_invoice_id: invoiceId, p_void: voided })
  if (error) return { error: error.message }
  const { businessId } = await contractsFor(supabase, invoiceId)
  await refreshTruth(supabase, businessId)
  revalidatePath('/today')
  revalidatePath('/businesses', 'layout')
  return {}
}

/** Mark void and also end the live membership contract the invoice belongs to. */
export async function markInvoiceVoidAndEndContract(invoiceId: string): Promise<{ error?: string; ended?: number; backupIds?: number[] }> {
  const first = await markInvoiceVoid(invoiceId)
  if (first.error) return first
  const supabase = await createClient()
  const { contracts } = await contractsFor(supabase, invoiceId)
  const live = contracts.filter((c) => c.is_current && (c.membership_type === 'club_card' || c.membership_type === 'advertiser'))
  const backupIds: number[] = []
  for (const c of live) {
    const r = await endContract(c.id)
    if (r.error) return { error: `Invoice marked void, but the contract wasn't ended: ${r.error}`, backupIds }
    if (r.backupId != null) backupIds.push(r.backupId)
  }
  return { ended: backupIds.length, backupIds }
}

/** Undo Mark void and, when the contract was ended with it, bring the contract back. */
export async function undoVoidInvoice(invoiceId: string, backupIds: number[] = []): Promise<{ error?: string }> {
  for (const id of backupIds) {
    const r = await undoEndContract(id)
    if (r.error) return r
  }
  return markInvoiceVoid(invoiceId, false)
}
