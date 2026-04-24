'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export async function getRelationshipMemory(businessId: string): Promise<string | null> {
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return null

  const { data } = await supabase
    .from('businesses')
    .select('relationship_memory')
    .eq('id', businessId)
    .eq('organization_id', orgId)
    .single()

  return (data as { relationship_memory?: string | null } | null)?.relationship_memory ?? null
}
