'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import type { AttentionRow } from '@/app/actions/attention'
import { isHiddenEngineTask } from '@/lib/today'

// Business page "at a glance" and timeline (UI overhaul Stage 6). The deal is
// read from `contracts`, not the copies on `businesses` (finding F9). The
// attention reason comes from v_business_attention (Stage 4), read only.

export type GlanceContract = {
  id: string
  membership_type: string | null
  contract_start: string | null
  contract_end: string | null
  contract_amount: number | null
  contract_currency: string | null
  billing_frequency: string | null
  deal_terms: string | null
  invoice_paid: boolean
  is_current: boolean
  /** Stage 17b: the invoice(s) this deal was made from (a past deal can cover several), by number. */
  invoice_docs?: string[]
}

export type GlanceTask = {
  id: string
  title: string
  notes: string | null
  status: string
  source: string | null
  signal_key: string | null
  due_date: string | null
  created_at: string
  completed_at: string | null
  /** Stage 12: so a newsletter to-do doesn't offer "For newsletter" on itself. */
  task_category?: { name: string } | null
}

export type GlanceInvoice = {
  qbo_invoice_id: string
  doc_number: string | null
  txn_date: string | null
  due_date: string | null
  total_amount: number | null
  balance: number | null
  is_paid: boolean | null
  private_memo: string | null
  line_description: string | null
  /** Stage 14a v2: marked void in the app (balance is then 0 and the memo 'Voided'). */
  voided_at?: string | null
  /** Stage 17b: the deal this invoice belongs to, when it is one (past deals too). */
  contract?: { id: string; membership_type: string | null; contract_start: string | null; contract_end: string | null; is_current: boolean } | null
}

export type BusinessGlance = {
  today: string
  contracts: GlanceContract[]
  attention: AttentionRow | null
  tasks: GlanceTask[]
  invoices: GlanceInvoice[]
}

/** Today's date in London, the same clock as cc_today() in the database. */
function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

export async function getBusinessGlance(businessId: string): Promise<{ data?: BusinessGlance; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const [contractsRes, attentionRes, tasksRes, linksRes] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, membership_type, contract_start, contract_end, contract_amount, contract_currency, billing_frequency, deal_terms, invoice_paid, is_current, qbo_invoice_id')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .order('contract_start', { ascending: false, nullsFirst: false }),
    supabase
      .from('v_business_attention')
      .select('*')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .maybeSingle(),
    // Hand-written to-dos (open or done) and anything still open. Done
    // automatic tasks are left out: they mirror emails already in the timeline.
    // Open engine tasks for replies, renewals and invoices are left out too
    // (Stage 7): the header's Needs attention covers them.
    supabase
      .from('tasks')
      .select('id, title, notes, status, source, signal_key, due_date, created_at, completed_at, task_category:task_categories(name)')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .or('source.eq.manual,status.eq.open')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('qbo_links')
      .select('qbo_customer_id')
      .eq('business_id', businessId),
  ])

  if (contractsRes.error) return { error: contractsRes.error.message }

  let invoices: GlanceInvoice[] = []
  const customerIds = [...new Set((linksRes.data ?? []).map((l) => l.qbo_customer_id).filter(Boolean))]
  if (customerIds.length > 0) {
    const { data } = await supabase
      .from('qbo_invoices')
      .select('*')
      .eq('organization_id', orgId)
      .in('qbo_customer_id', customerIds)
      .order('txn_date', { ascending: false })
      .limit(1000) // QuickBooks history since Nov 2019 (Stage 17b): every invoice, not just the latest
    invoices = (data ?? []) as GlanceInvoice[]
  }

  // Stage 17b: which invoices belong to which deal (contract_invoices, plus contracts.qbo_invoice_id).
  type ContractRow = GlanceContract & { qbo_invoice_id: string | null }
  const contracts = (contractsRes.data ?? []) as ContractRow[]
  const contractIds = contracts.map((c) => c.id)
  const linkRows = contractIds.length > 0
    ? ((await supabase.from('contract_invoices').select('contract_id, qbo_invoice_id').in('contract_id', contractIds)).data ?? [])
    : []
  const byInvoice = new Map<string, ContractRow>()
  for (const c of contracts) if (c.qbo_invoice_id) byInvoice.set(c.qbo_invoice_id, c)
  for (const l of linkRows) {
    const c = contracts.find((x) => x.id === l.contract_id)
    if (c) byInvoice.set(l.qbo_invoice_id, c)
  }
  invoices = invoices.map((i) => {
    const c = byInvoice.get(i.qbo_invoice_id)
    return c ? { ...i, contract: { id: c.id, membership_type: c.membership_type, contract_start: c.contract_start, contract_end: c.contract_end, is_current: c.is_current } } : i
  })
  const docOf = new Map(invoices.map((i) => [i.qbo_invoice_id, i.doc_number ?? i.qbo_invoice_id]))
  for (const c of contracts) {
    const ids = [...new Set([...(c.qbo_invoice_id ? [c.qbo_invoice_id] : []), ...linkRows.filter((l) => l.contract_id === c.id).map((l) => l.qbo_invoice_id)])]
    if (ids.length > 0) c.invoice_docs = ids.map((id) => docOf.get(id) ?? id)
  }

  return {
    data: {
      today: londonToday(),
      contracts,
      // A missing view (before its migration) just means no attention line.
      attention: attentionRes.error ? null : ((attentionRes.data as AttentionRow | null) ?? null),
      tasks: tasksRes.error ? [] : ((tasksRes.data ?? []) as unknown as GlanceTask[]).filter((t) => !isHiddenEngineTask(t)),
      invoices,
    },
  }
}
