/**
 * Cron endpoint to post to Twitter
 * Runs daily at 12pm UK time
 */

import { NextRequest, NextResponse } from 'next/server'
import { processDueContent, getDueContent } from '@/lib/marketing/content-scheduler'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Check for Twitter content due
    const dueContent = await getDueContent()
    const twitterContent = dueContent.filter(
      (c) => c.platform === 'twitter' || c.platform === 'both'
    )

    if (twitterContent.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Twitter content due',
        timestamp: new Date().toISOString(),
      })
    }

    console.log(`Posting ${twitterContent.length} items to Twitter...`)
    const results = await processDueContent()
    console.log('Twitter posting results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error posting to Twitter:', error)
    return NextResponse.json(
      { error: 'Failed to post to Twitter' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60
