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
      .select('id, membership_type, contract_start, contract_end, contract_amount, contract_currency, billing_frequency, deal_terms, invoice_paid, is_current')
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
      .limit(200)
    invoices = (data ?? []) as GlanceInvoice[]
  }

  return {
    data: {
      today: londonToday(),
      contracts: (contractsRes.data ?? []) as GlanceContract[],
      // A missing view (before its migration) just means no attention line.
      attention: attentionRes.error ? null : ((attentionRes.data as AttentionRow | null) ?? null),
      tasks: tasksRes.error ? [] : ((tasksRes.data ?? []) as unknown as GlanceTask[]).filter((t) => !isHiddenEngineTask(t)),
      invoices,
    },
  }
}
