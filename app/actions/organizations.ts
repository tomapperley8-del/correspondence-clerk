'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type Organization = {
  id: string
  name: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export type UserProfile = {
  id: string
  organization_id: string
  display_name: string | null
  created_at: string
  updated_at: string
}

/**
 * Get the current user's organization
 */
export async function getCurrentOrganization() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get user's profile with organization
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select(
      `
      *,
      organizations (
        id,
        name,
        created_at,
        updated_at,
        created_by
      )
    `
    )
    .eq('id', user.id)
    .single()

  if (profileError) {
    return { error: profileError.message }
  }

  if (!profile || !profile.organizations) {
    return { error: 'No organization found' }
  }

  return { data: profile.organizations }
}

/**
 * Create a new organization and user profile
 * Used during onboarding when a new user creates their organization
 */
export async function createOrganization(name: string) {
  if (!name || name.trim().length === 0) {
    return { error: 'Organization name is required' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Check if user already has a profile (shouldn't happen, but safety check)
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existingProfile) {
    return { error: 'User already has an organization' }
  }

  // Create organization
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: name.trim(),
      created_by: user.id,
    })
    .select()
    .single()

  if (orgError) {
    return { error: orgError.message }
  }

  // Create user profile
  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: user.id,
      organization_id: organization.id,
      display_name: user.email,
    })
    .select()
    .single()

  if (profileError) {
    // Cleanup: delete the organization if profile creation failed
    await supabase.from('organizations').delete().eq('id', organization.id)
    return { error: profileError.message }
  }

  revalidatePath('/')
  return { data: organization }
}

/**
 * Update organization name
 */
export async function updateOrganization(name: string) {
  if (!name || name.trim().length === 0) {
    return { error: 'Organization name is required' }
  }

  const organizationId = await getCurrentUserOrganizationId()

  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organizations')
    .update({ name: name.trim() })
    .eq('id', organizationId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/settings/organization')
  return { data }
}

/**
 * Get all members of the current user's organization
 */
export async function getOrganizationMembers() {
  const organizationId = await getCurrentUserOrganizationId()

  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const supabase = await createClient()

  // Get all user profiles for this organization
  // Join with auth.users to get email addresses
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name, role, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  // Use display_name as email proxy — user_profiles stores display_name which defaults to email
  // This avoids N+1 calls to auth.admin.getUserById for each member
  const membersWithEmails = data.map((profile) => ({
    ...profile,
    email: profile.display_name || null,
  }))

  return { data: membersWithEmails }
}
