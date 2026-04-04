/**
 * API route to get or create a referral code for the current user
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateReferralCode, getReferralUrl, getReferralStats } from '@/lib/referrals/referral-system'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = await getCurrentUserOrganizationId()
    if (!orgId) {
      return NextResponse.json({ error: 'Organisation not found' }, { status: 403 })
    }

    // Get or create referral code
    const code = await getOrCreateReferralCode(user.id, orgId)
    const url = getReferralUrl(code)
    const stats = await getReferralStats(user.id)

    return NextResponse.json({
      code,
      url,
      stats,
    })
  } catch (error) {
    console.error('Error creating referral code:', error)
    return NextResponse.json(
      { error: 'Failed to create referral code' },
      { status: 500 }
    )
  }
}
