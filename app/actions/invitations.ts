'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { sendInvitationEmail } from '@/lib/email'
import crypto from 'crypto'

export type Invitation = {
  id: string
  organization_id: string
  email: string
  invited_by: string
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  token: string
  expires_at: string
  created_at: string
  updated_at: string
  accepted_at: string | null
  accepted_by: string | null
}

/**
 * Generate a cryptographically secure 256-bit token (64 hex characters)
 */
function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a new invitation for the current user's organization
 */
export async function createInvitation(email: string) {
  if (!email || !email.includes('@')) {
    return { error: 'Valid email address is required' }
  }

  const normalizedEmail = email.toLowerCase().trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const organizationId = await getCurrentUserOrganizationId()

  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Check if user with this email already exists
  const { data: existingUser } = await supabase.auth.admin.listUsers()
  const userExists = existingUser.users.some(
    (u) => u.email?.toLowerCase() === normalizedEmail
  )

  if (userExists) {
    return { error: 'A user with this email already exists' }
  }

  // Check if there's already a pending invitation for this email to this organization
  const { data: existingInvitation } = await supabase
    .from('invitations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .single()

  if (existingInvitation) {
    return { error: 'An invitation for this email is already pending' }
  }

  // Generate token and set expiration (7 days from now)
  const token = generateInvitationToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  // Create invitation
  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .insert({
      organization_id: organizationId,
      email: normalizedEmail,
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    })
    .select()
    .single()

  if (invitationError) {
    return { error: invitationError.message }
  }

  // Get organization name for the email
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single()

  // Send invitation email
  await sendInvitationEmail(normalizedEmail, token, org?.name || 'the organization')

  revalidatePath('/settings/organization')
  return { data: invitation }
}

/**
 * Get all invitations for the current user's organization
 */
export async function getInvitations() {
  const organizationId = await getCurrentUserOrganizationId()

  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

/**
 * Cancel a pending invitation
 */
export async function cancelInvitation(invitationId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled' })
    .eq('id', invitationId)
    .eq('status', 'pending') // Only cancel pending invitations
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!data) {
    return { error: 'Invitation not found or already processed' }
  }

  revalidatePath('/settings/organization')
  return { data }
}

/**
 * Validate an invitation token
 * Returns invitation details if valid, error otherwise
 */
export async function validateInvitationToken(token: string) {
  const supabase = await createClient()

  const { data: invitation, error } = await supabase
    .from('invitations')
    .select(
      `
      *,
      organizations (
        id,
        name
      )
    `
    )
    .eq('token', token)
    .single()

  if (error || !invitation) {
    return { error: 'Invalid invitation token' }
  }

  // Check if invitation is pending
  if (invitation.status !== 'pending') {
    return { error: 'This invitation has already been used or cancelled' }
  }

  // Check if invitation is expired
  const expiresAt = new Date(invitation.expires_at)
  if (expiresAt < new Date()) {
    // Mark as expired
    await supabase
      .from('invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id)

    return { error: 'This invitation has expired' }
  }

  return { data: invitation }
}

/**
 * Accept an invitation and create user profile
 * Called after user signs up with the invitation token
 */
export async function acceptInvitation(token: string, userId: string) {
  const supabase = await createClient()

  // Validate token
  const { data: invitation, error: validationError } =
    await validateInvitationToken(token)

  if (validationError || !invitation) {
    return { error: validationError || 'Invalid invitation' }
  }

  // Check if user already has a profile
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (existingProfile) {
    return { error: 'User already has an organization' }
  }

  // Get user email to verify it matches invitation
  const { data: userData } = await supabase.auth.admin.getUserById(userId)
  if (userData.user?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return {
      error:
        'Email address does not match the invitation. Please sign up with the invited email address.',
    }
  }

  // Create user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: userId,
      organization_id: invitation.organization_id,
      display_name: invitation.email,
    })
    .select()
    .single()

  if (profileError) {
    return { error: profileError.message }
  }

  // Mark invitation as accepted
  const { error: updateError } = await supabase
    .from('invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', invitation.id)

  if (updateError) {
    console.error('Failed to update invitation status:', updateError)
    // Don't return error - profile was created successfully
  }

  return { data: profile }
}

/**
 * Get invitation by token (public - no auth required for signup flow)
 */
export async function getInvitationByToken(token: string) {
  const supabase = await createClient()

  const { data: invitation, error } = await supabase
    .from('invitations')
    .select(
      `
      *,
      organizations (
        id,
        name
      )
    `
    )
    .eq('token', token)
    .single()

  if (error || !invitation) {
    return { error: 'Invitation not found' }
  }

  return { data: invitation }
}
