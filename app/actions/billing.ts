'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { PLANS, type PlanId } from '@/lib/stripe/config'

export type BillingInfo = {
  plan: PlanId
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  trialEndsAt: string | null
  seatsUsed: number
  seatsLimit: number
  aiRequestsUsed: number
  aiRequestsLimit: number
  hasStripeSubscription: boolean
}

/**
 * Get billing information for the current organization
 */
export async function getBillingInfo(): Promise<{ data?: BillingInfo; error?: string }> {
  if (!isFeatureEnabled('billing')) {
    // Return unlimited plan when billing is disabled
    return {
      data: {
        plan: 'enterprise',
        status: 'active',
        trialEndsAt: null,
        seatsUsed: 0,
        seatsLimit: -1,
        aiRequestsUsed: 0,
        aiRequestsLimit: -1,
        hasStripeSubscription: false,
      },
    }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const supabase = await createClient()

  // Get organization billing info
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select(
      `
      subscription_plan,
      subscription_status,
      trial_ends_at,
      seats_limit,
      ai_requests_limit,
      ai_requests_used,
      stripe_subscription_id
    `
    )
    .eq('id', organizationId)
    .single()

  if (orgError || !org) {
    return { error: 'Failed to load billing info' }
  }

  // Count current seats (users in organization)
  const { count: seatsUsed } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  return {
    data: {
      plan: (org.subscription_plan as PlanId) || 'trial',
      status: org.subscription_status || 'trialing',
      trialEndsAt: org.trial_ends_at,
      seatsUsed: seatsUsed || 0,
      seatsLimit: org.seats_limit ?? PLANS.trial.seats,
      aiRequestsUsed: org.ai_requests_used || 0,
      aiRequestsLimit: org.ai_requests_limit ?? PLANS.trial.aiRequests,
      hasStripeSubscription: !!org.stripe_subscription_id,
    },
  }
}

/**
 * Check if organization is within seat limit
 */
export async function canAddTeamMember(): Promise<boolean> {
  const result = await getBillingInfo()
  if (!result.data) return false

  const { seatsUsed, seatsLimit } = result.data
  if (seatsLimit === -1) return true // Unlimited
  return seatsUsed < seatsLimit
}

/**
 * Check if organization has AI requests remaining
 */
export async function canUseAI(): Promise<boolean> {
  const result = await getBillingInfo()
  if (!result.data) return false

  const { aiRequestsUsed, aiRequestsLimit, status } = result.data

  // Check subscription status
  if (status === 'canceled' || status === 'unpaid') return false

  if (aiRequestsLimit === -1) return true // Unlimited
  return aiRequestsUsed < aiRequestsLimit
}

/**
 * Increment AI request counter
 */
export async function incrementAIUsage(): Promise<void> {
  if (!isFeatureEnabled('billing')) return

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) return

  const supabase = await createClient()

  // Increment counter
  const { error } = await supabase.rpc('increment_ai_usage', {
    org_id: organizationId,
  })

  if (error) {
    console.error('Failed to increment AI usage:', error)
  }
}

/**
 * Check if trial has expired
 */
export async function isTrialExpired(): Promise<boolean> {
  const result = await getBillingInfo()
  if (!result.data) return false

  const { status, trialEndsAt } = result.data

  if (status !== 'trialing') return false
  if (!trialEndsAt) return false

  return new Date(trialEndsAt) < new Date()
}

/**
 * Get days remaining in trial
 */
export async function getTrialDaysRemaining(): Promise<number | null> {
  const result = await getBillingInfo()
  if (!result.data) return null

  const { status, trialEndsAt } = result.data

  if (status !== 'trialing' || !trialEndsAt) return null

  const now = new Date()
  const endDate = new Date(trialEndsAt)
  const diffTime = endDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return Math.max(0, diffDays)
}

/**
 * Update billing email
 */
export async function updateBillingEmail(email: string): Promise<{ error?: string }> {
  if (!email || !email.includes('@')) {
    return { error: 'Invalid email address' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('organizations')
    .update({ billing_email: email })
    .eq('id', organizationId)

  if (error) {
    return { error: error.message }
  }

  return {}
}
