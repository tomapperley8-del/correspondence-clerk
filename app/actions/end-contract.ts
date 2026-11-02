'use server'

// End a deal by hand (Stage 10): the End membership button on the Club Card tab and the
// "Was this their membership?" answer when an invoice is marked void. A deal that is not live
// is kept as its former_ type (the convention already on file), so the status follows from
// v_businesses / cc_business_status() and nothing else decides it. The before-image goes to
// cc_phase0_backup so Undo can put it back.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { refreshTruth } from '@/lib/refresh-truth'

const FORMER: Record<string, string> = { club_card: 'former_club_card', advertiser: 'former_advertiser' }

function refreshPages(businessId: string) {
  revalidatePath(`/businesses/${businessId}`)
  revalidatePath('/club-card')
  revalidatePath('/businesses')
  revalidatePath('/today')
  revalidatePath('/data-health')
}

/** End one contract. Returns the backup id for Undo. */
export async function endContract(contractId: string): Promise<{ backupId?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data: c, error: readError } = await supabase.from('contracts').select('*').eq('id', contractId).eq('organization_id', orgId).maybeSingle()
  if (readError) return { error: readError.message }
  if (!c) return { error: 'Contract not found' }
  const former = FORMER[c.membership_type ?? '']
  if (!former) return { error: 'This contract is already ended or is not a membership' }

  const { data: backup, error: backupError } = await supabase
    .from('cc_phase0_backup')
    .insert({ table_name: 'contracts', row_id: c.id, before_row: c, reason: `end contract by hand ${new Date().toISOString().slice(0, 10)}` })
    .select('id')
    .single()
  if (backupError) return { error: backupError.message }

  const { error } = await supabase.from('contracts').update({ membership_type: former, updated_at: new Date().toISOString() }).eq('id', c.id).eq('organization_id', orgId)
  if (error) return { error: error.message }
  await refreshTruth(supabase, c.business_id)
  refreshPages(c.business_id)
  return { backupId: backup.id }
}

/** End the business's current Club Card contract (the End membership button). */
export async function endMembership(businessId: string): Promise<{ backupId?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }
  const { data: c } = await supabase
    .from('contracts')
    .select('id')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .eq('membership_type', 'club_card')
    .eq('is_current', true)
    .order('contract_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!c) return { error: 'No current Club Card contract to end' }
  return endContract(c.id)
}

/** Undo endContract / endMembership: put the contract back as it was. */
export async function undoEndContract(backupId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data: backup, error: readError } = await supabase.from('cc_phase0_backup').select('before_row').eq('id', backupId).eq('table_name', 'contracts').maybeSingle()
  if (readError) return { error: readError.message }
  const saved = backup?.before_row as { id: string; business_id: string; organization_id: string; membership_type: string | null } | undefined
  if (!saved || saved.organization_id !== orgId) return { error: 'Nothing to undo' }

  const { error } = await supabase.from('contracts').update({ membership_type: saved.membership_type, updated_at: new Date().toISOString() }).eq('id', saved.id).eq('organization_id', orgId)
  if (error) return { error: error.message }
  await refreshTruth(supabase, saved.business_id)
  refreshPages(saved.business_id)
  return {}
}
