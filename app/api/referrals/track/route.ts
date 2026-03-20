/**
 * API route to track referral conversions
 * Called when a referred user completes signup or converts to paid
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  trackReferralSignup,
  trackReferralConversion,
  getReferralByCode,
} from '@/lib/referrals/referral-system'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, referral_code, user_id, organization_id } = body

    // Validate required fields based on event type
    if (!event) {
      return NextResponse.json(
        { error: 'Event type is required' },
        { status: 400 }
      )
    }

    switch (event) {
      case 'signup': {
        // Track when a referred user signs up
        if (!referral_code || !user_id || !organization_id) {
          return NextResponse.json(
            { error: 'referral_code, user_id, and organization_id are required for signup event' },
            { status: 400 }
          )
        }

        // Verify the referral code exists and is valid
        const referral = await getReferralByCode(referral_code)
        if (!referral) {
          return NextResponse.json(
            { error: 'Invalid referral code' },
            { status: 400 }
          )
        }

        if (referral.status !== 'pending') {
          return NextResponse.json(
            { error: 'Referral code already used or expired' },
            { status: 400 }
          )
        }

        // Track the signup
        const success = await trackReferralSignup(
          referral_code,
          user_id,
          organization_id
        )

        if (!success) {
          return NextResponse.json(
            { error: 'Failed to track referral signup' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Referral signup tracked',
          referrer_id: referral.referrer_user_id,
        })
      }

      case 'conversion': {
        // Track when a referred user converts to paid
        if (!user_id) {
          return NextResponse.json(
            { error: 'user_id is required for conversion event' },
            { status: 400 }
          )
        }

        const result = await trackReferralConversion(user_id)

        if (!result.success) {
          return NextResponse.json(
            { error: 'No pending referral found for this user' },
            { status: 404 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Referral conversion tracked',
          referrer_id: result.referrerId,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown event type: ${event}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error tracking referral:', error)
    return NextResponse.json(
      { error: 'Failed to track referral' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check if a referral code is valid
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400 }
      )
    }

    const referral = await getReferralByCode(code)

    if (!referral) {
      return NextResponse.json({
        valid: false,
        reason: 'Referral code not found',
      })
    }

    if (referral.status !== 'pending') {
      return NextResponse.json({
        valid: false,
        reason: 'Referral code already used or expired',
      })
    }

    // Get referrer's organization name for display
    const { data: org } = await getSupabase()
      .from('organizations')
      .select('name')
      .eq('id', referral.referrer_organization_id)
      .single()

    return NextResponse.json({
      valid: true,
      referrer_org_name: org?.name || 'A friend',
    })
  } catch (error) {
    console.error('Error checking referral code:', error)
    return NextResponse.json(
      { error: 'Failed to check referral code' },
      { status: 500 }
    )
  }
}
