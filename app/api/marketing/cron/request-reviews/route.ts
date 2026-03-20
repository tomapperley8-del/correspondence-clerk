/**
 * Cron endpoint to request reviews from happy users
 * Runs daily at 10am UK time
 */

import { NextRequest, NextResponse } from 'next/server'
import { processReviewRequests } from '@/lib/marketing/review-collector'

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('Starting review request processing...')
    const results = await processReviewRequests()
    console.log('Review request results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error processing review requests:', error)
    return NextResponse.json(
      { error: 'Failed to process review requests' },
      { status: 500 }
    )
  }
}

// Vercel cron configuration
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 second timeout
