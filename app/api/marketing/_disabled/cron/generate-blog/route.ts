/**
 * Cron endpoint to generate weekly blog posts
 * Runs every Sunday at 3am
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateWeeklyBlogPost } from '@/lib/marketing/blog-generator'

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
    console.log('Generating weekly blog post...')
    const result = await generateWeeklyBlogPost()
    console.log('Blog generation result:', result)

    return NextResponse.json({
      success: result.generated,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error generating blog post:', error)
    return NextResponse.json(
      { error: 'Failed to generate blog post' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minute timeout for AI generation
