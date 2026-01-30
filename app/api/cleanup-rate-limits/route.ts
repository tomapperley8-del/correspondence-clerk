import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredRateLimits } from '@/lib/rate-limit'

/**
 * Cleanup endpoint for expired rate limit entries
 * Call via cron job: Vercel Cron or external service
 *
 * Protected by CRON_SECRET environment variable
 * Set up in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cleanup-rate-limits",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // If CRON_SECRET is set, require it
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const deletedCount = await cleanupExpiredRateLimits()

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Rate limit cleanup error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
