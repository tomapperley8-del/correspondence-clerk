'use server'

import { createClient } from '@/lib/supabase/server'

export type UserProfile = {
  id: string
  organization_id: string
  display_name: string | null
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
