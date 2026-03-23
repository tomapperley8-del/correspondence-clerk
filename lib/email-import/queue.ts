import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Enqueues a correspondence entry for background AI formatting.
 */
export async function enqueueForFormatting(
  supabase: SupabaseClient,
  orgId: string,
  correspondenceId: string
): Promise<void> {
  await supabase.from('import_queue').insert({
    org_id: orgId,
    correspondence_id: correspondenceId,
    status: 'pending',
  })
}
