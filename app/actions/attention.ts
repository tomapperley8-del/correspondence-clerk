'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

// "Needs attention" (UI overhaul Stage 4). Worked out live in the database by
// v_business_attention; Today and its nav badge read it through lib/today-source.ts.

export type AttentionReason = 'money_owed' | 'renewal' | 'club_card_lapsed' | 'waiting_on_you' | 'todo' | 'club_card'

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
  revalidatePath('/today')
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
  revalidatePath('/today')
  revalidatePath(`/businesses/${businessId}`)
  return { success: true }
}
