/**
 * Content scheduler
 * Manages the social content calendar and scheduling
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { GeneratedContent, generateWeeklyContent } from './content-generator'
import { postToLinkedIn, formatForLinkedIn } from './linkedin'
import { postTweet, formatForTwitter } from './twitter'

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

export interface ScheduledContent {
  id: string
  platform: 'linkedin' | 'twitter' | 'both'
  content: string
  content_type: string
  scheduled_for: string
  posted_at: string | null
  status: 'scheduled' | 'posted' | 'failed' | 'cancelled'
  linkedin_post_id: string | null
  twitter_post_id: string | null
  error_message: string | null
}

/**
 * Schedule content for posting
 */
export async function scheduleContent(
  content: GeneratedContent,
  scheduledFor: Date
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('social_content')
    .insert({
      platform: content.platform,
      content: content.content,
      content_type: content.content_type,
      scheduled_for: scheduledFor.toISOString(),
      status: 'scheduled',
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error scheduling content:', error)
    return null
  }

  return data.id
}

/**
 * Generate and schedule a week of content
 */
export async function scheduleWeeklyContent(): Promise<{
  generated: number
  scheduled: number
}> {
  const stats = { generated: 0, scheduled: 0 }

  // Generate content for the week
  const content = await generateWeeklyContent()
  stats.generated = content.length

  // Schedule each piece
  const today = new Date()
  today.setHours(9, 0, 0, 0) // 9am posting time

  for (let i = 0; i < content.length; i++) {
    const scheduledDate = new Date(today)
    scheduledDate.setDate(today.getDate() + i)

    // Adjust time based on platform
    if (content[i].platform === 'twitter') {
      scheduledDate.setHours(12, 0, 0, 0) // Twitter at noon
    }

    const id = await scheduleContent(content[i], scheduledDate)
    if (id) {
      stats.scheduled++
    }
  }

  return stats
}

/**
 * Get content due for posting
 */
export async function getDueContent(): Promise<ScheduledContent[]> {
  const now = new Date()

  const { data, error } = await getSupabase()
    .from('social_content')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Error fetching due content:', error)
    return []
  }

  return data || []
}

/**
 * Post scheduled content
 */
export async function postScheduledContent(
  content: ScheduledContent
): Promise<{ success: boolean; linkedInId?: string; twitterId?: string }> {
  const results: { success: boolean; linkedInId?: string; twitterId?: string } = {
    success: false,
  }

  // Extract hashtags from content (if stored) or use defaults
  const hashtags = ['CorrespondenceClerk', 'BusinessOrganisation']

  // Post to LinkedIn if applicable
  if (content.platform === 'linkedin' || content.platform === 'both') {
    const linkedInContent = formatForLinkedIn(content.content, hashtags)
    const linkedInResult = await postToLinkedIn({ text: linkedInContent })

    if (linkedInResult.success) {
      results.linkedInId = linkedInResult.postId
      results.success = true
    } else {
      console.error('LinkedIn posting failed:', linkedInResult.error)
    }
  }

  // Post to Twitter if applicable
  if (content.platform === 'twitter' || content.platform === 'both') {
    const twitterContent = formatForTwitter(content.content, hashtags)
    const twitterResult = await postTweet({ text: twitterContent })

    if (twitterResult.success) {
      results.twitterId = twitterResult.tweetId
      results.success = true
    } else {
      console.error('Twitter posting failed:', twitterResult.error)
    }
  }

  // Update database
  await getSupabase()
    .from('social_content')
    .update({
      status: results.success ? 'posted' : 'failed',
      posted_at: results.success ? new Date().toISOString() : null,
      linkedin_post_id: results.linkedInId || null,
      twitter_post_id: results.twitterId || null,
      error_message: results.success
        ? null
        : 'Failed to post to one or more platforms',
    })
    .eq('id', content.id)

  return results
}

/**
 * Process all due content (called by cron)
 */
export async function processDueContent(): Promise<{
  processed: number
  posted: number
  failed: number
}> {
  const stats = { processed: 0, posted: 0, failed: 0 }

  const dueContent = await getDueContent()

  for (const content of dueContent) {
    stats.processed++

    const result = await postScheduledContent(content)

    if (result.success) {
      stats.posted++
    } else {
      stats.failed++
    }

    // Rate limit between posts
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  return stats
}

/**
 * Get upcoming scheduled content
 */
export async function getUpcomingContent(
  limit: number = 10
): Promise<ScheduledContent[]> {
  const { data, error } = await getSupabase()
    .from('social_content')
    .select('*')
    .eq('status', 'scheduled')
    .gte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Error fetching upcoming content:', error)
    return []
  }

  return data || []
}

/**
 * Cancel scheduled content
 */
export async function cancelContent(contentId: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('social_content')
    .update({ status: 'cancelled' })
    .eq('id', contentId)
    .eq('status', 'scheduled')

  return !error
}
