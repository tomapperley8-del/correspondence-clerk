/**
 * Cron endpoint to post to LinkedIn
 * Runs daily at 9am UK time
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
    // Check for LinkedIn content due
    const dueContent = await getDueContent()
    const linkedInContent = dueContent.filter(
      (c) => c.platform === 'linkedin' || c.platform === 'both'
    )

    if (linkedInContent.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No LinkedIn content due',
        timestamp: new Date().toISOString(),
      })
    }

    console.log(`Posting ${linkedInContent.length} items to LinkedIn...`)
    const results = await processDueContent()
    console.log('LinkedIn posting results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error posting to LinkedIn:', error)
    return NextResponse.json(
      { error: 'Failed to post to LinkedIn' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60
