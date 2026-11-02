import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Keep the stored status and last-in-touch date of each business in step with what
 * v_businesses works out (Stage 10). Call after a business is created, an email is filed
 * or linked, a contract changes or an invoice is voided. Never throws: a failed refresh
 * must not block the save, and Data health lists any business left out of step.
 */
export async function refreshTruth(supabase: SupabaseClient, ...businessIds: (string | null | undefined)[]): Promise<void> {
  for (const id of new Set(businessIds.filter((x): x is string => !!x))) {
    const { error } = await supabase.rpc('refresh_business_truth', { p_business_id: id })
    if (error) console.error('refresh_business_truth:', error.message)
  }
}
