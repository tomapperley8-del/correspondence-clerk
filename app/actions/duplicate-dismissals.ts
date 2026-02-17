'use server'

import { createClient } from '@/lib/supabase/server'

export async function dismissDuplicatePair(
  businessId: string,
  entryId1: string,
  entryId2: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  // Sort IDs to ensure consistent ordering
  const [id1, id2] = [entryId1, entryId2].sort()

  const { error } = await supabase
    .from('duplicate_dismissals')
    .insert({
      business_id: businessId,
      entry_id_1: id1,
      entry_id_2: id2,
      dismissed_by: user.id
    })

  if (error) return { error: error.message }
  return { success: true }
}

export async function dismissMultipleDuplicatePairs(
  businessId: string,
  pairs: Array<{ entryId1: string; entryId2: string }>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }
  if (pairs.length === 0) return { error: 'No pairs to dismiss' }

  // Sort IDs per pair for consistent ordering (matches existing pattern)
  const rows = pairs.map(({ entryId1, entryId2 }) => {
    const [id1, id2] = [entryId1, entryId2].sort()
    return {
      business_id: businessId,
      entry_id_1: id1,
      entry_id_2: id2,
      dismissed_by: user.id,
    }
  })

  const { error } = await supabase
    .from('duplicate_dismissals')
    .insert(rows)

  if (error) return { error: error.message }
  return { success: true, dismissedCount: pairs.length }
}
