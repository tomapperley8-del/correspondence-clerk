'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Mark void on a QuickBooks invoice (UI overhaul Stage 14a v2, migration
// 20261024_002_invoice_void). The database holds the mirror row at balance 0
// and memo 'Voided', which every reader of unpaid invoices already skips, so
// it stops counting everywhere at once. Tom voids it in QuickBooks himself.

export async function markInvoiceVoid(invoiceId: string, voided = true): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { error } = await supabase.rpc('mark_invoice_void', { p_invoice_id: invoiceId, p_void: voided })
  if (error) return { error: error.message }
  revalidatePath('/today')
  revalidatePath('/businesses', 'layout')
  return {}
}
