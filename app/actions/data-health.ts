'use server'

// Data health (UI overhaul Stage 11c): things that have drifted, each with a count and a list to
// fix. The checks live in the database (v_data_health, v_data_health_counts; migration
// 20261029_004) so the desk email or a routine can read the same numbers. Read only.

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type DataHealthCheck = { check_key: string; title: string; fixed_on: string; n: number }
export type DataHealthRow = {
  check_key: string
  business_id: string
  business_name: string
  contract_id: string | null
  ref_date: string | null
  detail: string | null
}

export async function getDataHealth(): Promise<{ data?: { checks: DataHealthCheck[]; rows: DataHealthRow[] }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const [counts, rows] = await Promise.all([
    supabase.from('v_data_health_counts').select('check_key, title, fixed_on, n').eq('organization_id', orgId).order('sort'),
    supabase.from('v_data_health').select('check_key, business_id, business_name, contract_id, ref_date, detail')
      .eq('organization_id', orgId).order('business_name').limit(2000),
  ])
  if (counts.error) return { error: counts.error.message }
  if (rows.error) return { error: rows.error.message }
  return { data: { checks: (counts.data ?? []) as DataHealthCheck[], rows: (rows.data ?? []) as DataHealthRow[] } }
}

/** The number of checks with something to fix that are listed on Data health itself, for links. */
export async function getDataHealthCount(): Promise<number> {
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return 0
  const { data } = await supabase.from('v_data_health_counts').select('n').eq('organization_id', orgId).eq('fixed_on', '/data-health')
  return (data ?? []).reduce((t, r) => t + Number(r.n ?? 0), 0)
}
