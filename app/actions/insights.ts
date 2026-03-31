'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'
import { INSIGHT_METADATA, type InsightType } from '@/lib/ai/insight-prompts'

export type CacheStatus = {
  generatedAt: string | null
  ageMinutes: number | null
  isExpired: boolean
}

export type UserAIPreset = {
  id: string
  label: string
  prompt_text: string
  scope: 'org' | 'business'
  sort_order: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Cache status (batch fetch — one round-trip for all insight types)
// ---------------------------------------------------------------------------

export async function getInsightCacheStatus(
  types: string[],
  businessId?: string | null
): Promise<Record<string, CacheStatus>> {
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) return {}

  const supabase = await createClient()

  let query = supabase
    .from('insight_cache')
    .select('insight_type, generated_at')
    .eq('org_id', organizationId)
    .in('insight_type', types)

  if (businessId) {
    query = query.eq('business_id', businessId)
  } else {
    query = query.is('business_id', null)
  }

  const { data } = await query

  const now = Date.now()
  const result: Record<string, CacheStatus> = {}

  for (const type of types) {
    const row = data?.find((r) => r.insight_type === type)
    if (!row) {
      result[type] = { generatedAt: null, ageMinutes: null, isExpired: true }
      continue
    }
    const ageMs = now - new Date(row.generated_at).getTime()
    const ageMinutes = Math.floor(ageMs / 60000)
    const dispatchType = type.startsWith('custom_') ? 'custom' : (type as InsightType)
    const ttlHours = INSIGHT_METADATA[dispatchType]?.cacheTtlHours ?? 24
    result[type] = {
      generatedAt: row.generated_at,
      ageMinutes,
      isExpired: ageMs > ttlHours * 3600000,
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// User AI presets
// ---------------------------------------------------------------------------

export async function getUserPresets(): Promise<{ data?: UserAIPreset[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('user_ai_presets')
    .select('id, label, prompt_text, scope, sort_order, created_at')
    .eq('user_id', user.id)
    .order('sort_order')

  if (error) return { error: error.message }
  return { data: data as UserAIPreset[] }
}

export async function createUserPreset(
  label: string,
  promptText: string,
  scope: 'org' | 'business'
): Promise<{ data?: UserAIPreset; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) return { error: 'No organization found' }

  if (!label.trim() || !promptText.trim()) return { error: 'Label and prompt are required' }

  // Enforce max 5 presets per user
  const { count } = await supabase
    .from('user_ai_presets')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count ?? 0) >= 5) return { error: 'Maximum of 5 custom presets allowed' }

  const { data: existing } = await supabase
    .from('user_ai_presets')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('user_ai_presets')
    .insert({ user_id: user.id, org_id: organizationId, label: label.trim(), prompt_text: promptText.trim(), scope, sort_order: nextOrder })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/settings/organization')
  return { data: data as UserAIPreset }
}

export async function updateUserPreset(
  id: string,
  label: string,
  promptText: string
): Promise<{ data?: UserAIPreset; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!label.trim() || !promptText.trim()) return { error: 'Label and prompt are required' }

  const { data, error } = await supabase
    .from('user_ai_presets')
    .update({ label: label.trim(), prompt_text: promptText.trim() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/settings/organization')
  return { data: data as UserAIPreset }
}

export async function deleteUserPreset(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Delete preset
  const { error } = await supabase
    .from('user_ai_presets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // Clean up cache rows for this preset (no FK cascade — explicit cleanup)
  const organizationId = await getCurrentUserOrganizationId()
  if (organizationId) {
    await supabase
      .from('insight_cache')
      .delete()
      .eq('org_id', organizationId)
      .eq('insight_type', `custom_${id}`)
  }

  revalidatePath('/settings/organization')
  return {}
}

export async function reorderUserPresets(orderedIds: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const updates = orderedIds.map((id, i) =>
    supabase.from('user_ai_presets').update({ sort_order: i }).eq('id', id).eq('user_id', user.id)
  )

  await Promise.all(updates)
  revalidatePath('/settings/organization')
  return {}
}
