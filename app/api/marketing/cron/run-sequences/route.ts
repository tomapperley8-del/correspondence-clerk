/**
 * Cron endpoint to process email sequences
 * Runs hourly to send due emails
 */

import { NextRequest, NextResponse } from 'next/server'
import { processDueEmails } from '@/lib/marketing/sequence-runner'

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
    console.log('Starting email sequence processing...')
    const results = await processDueEmails()
    console.log('Email sequence results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error processing email sequences:', error)
    return NextResponse.json(
      { error: 'Failed to process email sequences' },
      { status: 500 }
    )
  }
}

// Vercel cron configuration - this function will be called by the cron
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 second timeout
