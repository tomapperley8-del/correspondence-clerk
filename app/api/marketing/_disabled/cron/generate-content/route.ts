/**
 * Cron endpoint to generate weekly social media content
 * Runs every Sunday at midnight to generate a week of posts
 */

import { NextRequest, NextResponse } from 'next/server'
import { scheduleWeeklyContent } from '@/lib/marketing/content-scheduler'

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
    console.log('Generating weekly social content...')
    const results = await scheduleWeeklyContent()
    console.log('Content generation results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error generating content:', error)
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minute timeout for AI generation
