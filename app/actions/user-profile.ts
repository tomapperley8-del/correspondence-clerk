'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type UserProfile = {
  id: string
  organization_id: string
  display_name: string | null
  briefing_email_opt_out: boolean
  created_at: string
  updated_at: string
}

/**
 * Get the current user's profile
 */
export async function getUserProfile() {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  // Get user profile
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching user profile:', error)
    return { error: error.message }
  }

  return { data: data as UserProfile }
}

/**
 * Update the current user's display name
 */
export async function updateDisplayName(displayName: string) {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  // Update display name
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ display_name: displayName })
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating display name:', error)
    return { error: error.message }
  }

  return { data: data as UserProfile }
}

/**
 * Get display name from user_id (for showing in correspondence entries)
 */
export async function getDisplayNameForUser(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('display_name, id')
    .eq('id', userId)
    .single()

  if (error) {
    // Return null if not found, don't throw error
    return { data: null }
  }

  return { data }
}

/**
 * Get display names for multiple users at once (for efficient loading)
 */
export async function getDisplayNamesForUsers(userIds: string[]) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .in('id', userIds)

  if (error) {
    console.error('Error fetching display names:', error)
    return { data: [] }
  }

  return { data: data || [] }
}

/**
 * Delete the current user's account and all their data.
 * Requires the user to confirm by typing DELETE.
 */
export async function deleteAccount() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  // Delete auth user via service role (cascades to user_profiles via FK)
  const admin = createServiceRoleClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)

  if (error) {
    console.error('Error deleting account:', error)
    return { error: error.message }
  }

  return { data: true }
}

/**
 * Update the current user's briefing email opt-out preference
 */
export async function updateBriefingEmailOptOut(
  optOut: boolean
): Promise<{ data?: UserProfile; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update({ briefing_email_opt_out: optOut })
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating briefing opt-out:', error)
    return { error: error.message }
  }

  return { data: data as UserProfile }
}

/**
 * Check the current user's role
 * Returns { data: { role: 'admin' | 'member' } } or { error: string }
 */
export async function checkUserRole(): Promise<{
  data?: { role: 'admin' | 'member' }
  error?: string
}> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: { role: data.role || 'member' } }
}
