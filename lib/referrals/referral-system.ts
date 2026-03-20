/**
 * Referral system for viral growth
 * Users get unique referral codes, both parties get rewards on conversion
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseClient
}

export interface Referral {
  id: string
  referrer_user_id: string | null
  referrer_organization_id: string | null
  referee_user_id: string | null
  referee_organization_id: string | null
  referral_code: string
  status: 'pending' | 'signed_up' | 'converted' | 'rewarded' | 'expired'
  reward_type: string
  referrer_rewarded_at: string | null
  referee_rewarded_at: string | null
  signed_up_at: string | null
  converted_at: string | null
  created_at: string
}

export interface ReferralStats {
  total_referrals: number
  signed_up: number
  converted: number
  pending: number
  rewards_earned: number
}

/**
 * Get or create a referral code for a user
 */
export async function getOrCreateReferralCode(
  userId: string,
  organizationId: string
): Promise<string> {
  // Use the database function for atomic operation
  const { data, error } = await getSupabase().rpc('get_or_create_referral_code', {
    p_user_id: userId,
    p_org_id: organizationId,
  })

  if (error) {
    console.error('Error getting referral code:', error)
    throw new Error('Failed to get referral code')
  }

  return data as string
}

/**
 * Get referral by code
 */
export async function getReferralByCode(code: string): Promise<Referral | null> {
  const { data, error } = await getSupabase()
    .from('referrals')
    .select('*')
    .eq('referral_code', code.toUpperCase())
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    console.error('Error fetching referral:', error)
    return null
  }

  return data
}

/**
 * Track when a referred user signs up
 */
export async function trackReferralSignup(
  referralCode: string,
  refereeUserId: string,
  refereeOrganizationId: string
): Promise<boolean> {
  const { error } = await getSupabase()
    .from('referrals')
    .update({
      referee_user_id: refereeUserId,
      referee_organization_id: refereeOrganizationId,
      status: 'signed_up',
      signed_up_at: new Date().toISOString(),
    })
    .eq('referral_code', referralCode.toUpperCase())
    .eq('status', 'pending')

  if (error) {
    console.error('Error tracking referral signup:', error)
    return false
  }

  return true
}

/**
 * Track when a referred user converts to paid
 */
export async function trackReferralConversion(
  refereeUserId: string
): Promise<{ referrerId: string | null; success: boolean }> {
  // Find the referral for this user
  const { data: referral, error: fetchError } = await getSupabase()
    .from('referrals')
    .select('*')
    .eq('referee_user_id', refereeUserId)
    .eq('status', 'signed_up')
    .single()

  if (fetchError || !referral) {
    return { referrerId: null, success: false }
  }

  // Update to converted
  const { error: updateError } = await getSupabase()
    .from('referrals')
    .update({
      status: 'converted',
      converted_at: new Date().toISOString(),
    })
    .eq('id', referral.id)

  if (updateError) {
    console.error('Error tracking conversion:', updateError)
    return { referrerId: null, success: false }
  }

  return { referrerId: referral.referrer_user_id, success: true }
}

/**
 * Apply rewards to both referrer and referee
 * Returns the number of days to add to subscription
 */
export async function applyReferralRewards(
  referralId: string
): Promise<{ referrerDays: number; refereeDays: number }> {
  const REWARD_DAYS = 30 // 1 month free

  const { data: referral, error: fetchError } = await getSupabase()
    .from('referrals')
    .select('*')
    .eq('id', referralId)
    .eq('status', 'converted')
    .single()

  if (fetchError || !referral) {
    console.error('Referral not found or not converted:', fetchError)
    return { referrerDays: 0, refereeDays: 0 }
  }

  // Mark as rewarded
  const { error: updateError } = await getSupabase()
    .from('referrals')
    .update({
      status: 'rewarded',
      referrer_rewarded_at: new Date().toISOString(),
      referee_rewarded_at: new Date().toISOString(),
    })
    .eq('id', referralId)

  if (updateError) {
    console.error('Error marking referral as rewarded:', updateError)
    return { referrerDays: 0, refereeDays: 0 }
  }

  // Note: Actual subscription extension should be handled by billing system
  // This just tracks the reward was applied
  return { referrerDays: REWARD_DAYS, refereeDays: REWARD_DAYS }
}

/**
 * Get referral stats for a user
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const { data, error } = await getSupabase()
    .from('referrals')
    .select('status')
    .eq('referrer_user_id', userId)

  if (error) {
    console.error('Error fetching referral stats:', error)
    return {
      total_referrals: 0,
      signed_up: 0,
      converted: 0,
      pending: 0,
      rewards_earned: 0,
    }
  }

  const stats = {
    total_referrals: data.length,
    signed_up: data.filter((r) => r.status === 'signed_up').length,
    converted: data.filter((r) => ['converted', 'rewarded'].includes(r.status)).length,
    pending: data.filter((r) => r.status === 'pending').length,
    rewards_earned: data.filter((r) => r.status === 'rewarded').length,
  }

  return stats
}

/**
 * Get all referrals made by a user
 */
export async function getUserReferrals(userId: string): Promise<Referral[]> {
  const { data, error } = await getSupabase()
    .from('referrals')
    .select('*')
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user referrals:', error)
    return []
  }

  return data || []
}

/**
 * Generate the full referral URL
 */
export function getReferralUrl(code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/signup?ref=${code}`
}

/**
 * Expire old pending referrals (call via cron)
 */
export async function expireOldReferrals(daysOld: number = 90): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  const { data, error } = await getSupabase()
    .from('referrals')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', cutoffDate.toISOString())
    .select('id')

  if (error) {
    console.error('Error expiring referrals:', error)
    return 0
  }

  return data?.length || 0
}
