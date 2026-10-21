'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { isFeatureEnabled } from '@/lib/feature-flags'

// "Needs attention" (UI overhaul Stage 4). Worked out live in the database by
// v_business_attention; the count comes from get_attention_count(), which uses
// the same London date as the view, so the nav and the page always agree.

export type AttentionReason = 'money_owed' | 'renewal' | 'waiting_on_you' | 'todo'

export type AttentionRow = {
  business_id: string
  business_name: string
  status: string | null
  priority: number
  reason: AttentionReason
  detail: string
  since: string | null
  is_overdue: boolean
  ref_id: string | null
  reasons: AttentionReason[]
  amount_owed: number | null
  emails_waiting: number | null
  todos_due: number | null
  attention_snoozed_until: string | null
  is_snoozed: boolean
}

export type AttentionCount = {
  today: string
  total: number
  businesses: number
  money_owed: number
  renewal: number
  waiting_on_you: number
  todo: number
  unlinked_todos: number
  snoozed: number
}

/** The count for the nav and the page header. Null when switched off or not available. */
export async function getAttentionCount(): Promise<AttentionCount | null> {
  if (!isFeatureEnabled('attentionView')) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_attention_count')
  if (error || !data) return null
  return data as AttentionCount
}

export async function getAttention(): Promise<{ data?: AttentionRow[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase
    .from('v_business_attention')
    .select('*')
    .eq('organization_id', orgId)
    .order('priority')
    .order('since', { ascending: true, nullsFirst: false })
  if (error) return { error: error.message }
  return { data: (data ?? []) as AttentionRow[] }
}

/** The old nav number (open tasks due by the UTC date), shown beside the new one for the comparison week. */
export async function getOldTodosDueCount(): Promise<number | null> {
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return null
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase.from('tasks').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).eq('status', 'open').lte('due_date', today).neq('source', 'contract_renewal')
  return count ?? null
}

/** Snooze a business until a date (YYYY-MM-DD), or clear the snooze with null. */
export async function snoozeBusinessAttention(businessId: string, until: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { error: 'Invalid date' }

  const { error } = await supabase
    .from('businesses')
    .update({ attention_snoozed_until: until })
    .eq('id', businessId)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/attention')
  return { success: true }
}

/**
 * "No reply needed" for a business on the Needs attention list: marks every
 * email they sent in the last 30 days that is still waiting as dealt with
 * (reply_dismissed_at), the same as Done on a single email.
 */
export async function dismissWaitingReplies(businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('correspondence')
    .update({ reply_dismissed_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .eq('direction', 'received')
    .is('reply_dismissed_at', null)
    .gt('entry_date', since)
  if (error) return { error: error.message }
  revalidatePath('/attention')
  revalidatePath(`/businesses/${businessId}`)
  return { success: true }
}
