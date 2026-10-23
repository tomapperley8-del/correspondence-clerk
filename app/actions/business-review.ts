'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

// Reviewing a business added automatically from email (Stage 3 of the UI
// overhaul). Merging and hiding run in SQL (merge_businesses,
// mark_not_a_business), which back up every row they touch first and can be
// undone with undo_last_business_change.

type ReviewResult = { error?: string; name?: string }

async function authorise() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' as const }
  return { supabase, orgId }
}

function revalidateBusinessViews(...ids: string[]) {
  revalidatePath('/dashboard')
  revalidatePath('/search')
  for (const id of ids) revalidatePath(`/businesses/${id}`)
}

/** "This is a business": an Unreviewed record becomes a Prospect. */
export async function markBusinessReviewed(id: string): Promise<ReviewResult> {
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const { data, error } = await auth.supabase
    .from('businesses')
    .update({ status: 'Prospect' })
    .eq('id', id)
    .eq('organization_id', auth.orgId)
    .eq('status', 'Unreviewed')
    .select('name')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'This business has already been reviewed' }
  // Stage 11a: a reviewed business with a deal on file is Active or Former, not Prospect
  await auth.supabase.rpc('refresh_business_truth', { p_business_id: id })
  revalidateBusinessViews(id)
  return { name: data.name }
}

/** "Not a business": hidden from every list; its emails and contacts stay. */
export async function markNotABusiness(id: string): Promise<ReviewResult> {
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const { data, error } = await auth.supabase.rpc('mark_not_a_business', { p_id: id })
  if (error) return { error: error.message }
  revalidateBusinessViews(id)
  return { name: (data as { name?: string } | null)?.name }
}

/** "Move to business": everything on this record goes to the target, which keeps its own details. */
export async function moveBusinessInto(sourceId: string, targetId: string): Promise<ReviewResult> {
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const { data, error } = await auth.supabase.rpc('merge_businesses', { p_src: sourceId, p_dst: targetId })
  if (error) return { error: error.message }
  revalidateBusinessViews(sourceId, targetId)
  return { name: (data as { dst_name?: string } | null)?.dst_name }
}

/** Undo the latest move or hide of this business. */
export async function undoBusinessChange(id: string): Promise<ReviewResult> {
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const { error } = await auth.supabase.rpc('undo_last_business_change', { p_id: id })
  if (error) return { error: error.message }
  revalidateBusinessViews(id)
  return {}
}
