'use server'

// Stage 18: the review page for team forwards (/review/team-forwards). Emails Cleo, Bridget and
// the rest of the team forwarded in that still sit on the team member's record, with who first
// wrote. The reading is lib/inbound/team-forwards.ts, shared with the one-off data script.
// Writes: only "Keep with the team member" (ai_metadata.team_forward_kept); moving uses the
// business page's Move to business (refileCorrespondence).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { findTeamForwards, type TeamForwardMove, type TeamForwardReview } from '@/lib/inbound/team-forwards'

export async function getTeamForwardReview(): Promise<{
  data?: { suggested: TeamForwardMove[]; unclear: TeamForwardReview[] }
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }
  try {
    const r = await findTeamForwards(supabase, orgId)
    const byDate = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date)
    return { data: { suggested: r.moves.sort(byDate), unclear: r.review.sort(byDate) } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not read the forwards' }
  }
}

export async function keepWithTeamMember(correspondenceId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }
  const { data: row, error: readError } = await supabase
    .from('correspondence').select('ai_metadata').eq('id', correspondenceId).eq('organization_id', orgId).single()
  if (readError) return { error: readError.message }
  const meta = { ...((row?.ai_metadata as Record<string, unknown> | null) ?? {}), team_forward_kept: true }
  const { error } = await supabase.from('correspondence').update({ ai_metadata: meta }).eq('id', correspondenceId).eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/review/team-forwards')
  return {}
}
