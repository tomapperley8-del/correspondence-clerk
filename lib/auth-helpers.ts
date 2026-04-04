/**
 * Auth helper functions for multi-tenancy
 * Provides utilities for getting current user's organization
 */

import { cache } from 'react'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Get the organization_id for the currently authenticated user
 * Returns null if user is not authenticated or has no profile
 *
 * This is used by server actions to include organization_id when creating records
 * Cached per request via React cache() — multiple calls in the same request only query once
 */
export const getCurrentUserOrganizationId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  // Get user's organization from user_profiles
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return null
  }

  return profile.organization_id
})

/**
 * Get the current user's full profile including organization info
 * Returns null if user is not authenticated or has no profile
 */
export async function getCurrentUserProfile() {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  // Get user's profile with organization data
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select(
      `
      *,
      organizations (
        id,
        name
      )
    `
    )
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return null
  }

  return profile
}

/**
 * Require org_id for server actions — returns orgId or error result.
 * Use this at the top of server actions instead of the 3-line pattern.
 */
export async function requireOrgId(): Promise<{ orgId: string } | { error: string }> {
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) {
    return { error: 'No organisation found' }
  }
  return { orgId }
}

/**
 * Require auth + org_id for API routes — returns orgId or a ready-made NextResponse.
 * Usage: const result = await requireOrgIdForRoute()
 *        if (result instanceof NextResponse) return result
 *        const { orgId } = result
 */
export async function requireOrgIdForRoute(): Promise<{ orgId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 403 })
  }

  return { orgId: profile.organization_id }
}

/**
 * Check if the current user has a profile
 * Returns true if user is authenticated and has a user_profile
 */
export async function userHasProfile(): Promise<boolean> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return false
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  return !profileError && !!profile
}
