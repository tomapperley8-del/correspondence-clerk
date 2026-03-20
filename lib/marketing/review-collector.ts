/**
 * Review request automation
 * Identifies happy users and requests reviews
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

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

const sendGridApiKey = process.env.SENDGRID_API_KEY
if (sendGridApiKey) {
  sgMail.setApiKey(sendGridApiKey)
}

interface QualifiedUser {
  user_id: string
  organization_id: string
  email: string
  display_name: string
  days_active: number
  entry_count: number
}

/**
 * Criteria for requesting a review
 */
const REVIEW_CRITERIA = {
  MIN_DAYS_ACTIVE: 30, // User active for at least 30 days
  MIN_ENTRIES: 50, // At least 50 correspondence entries
  DAYS_SINCE_LAST_REQUEST: 90, // Don't ask more than once per 90 days
}

/**
 * Find users qualified for review requests
 */
export async function findQualifiedUsers(): Promise<QualifiedUser[]> {
  // Get users who have been active for 30+ days with 50+ entries
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - REVIEW_CRITERIA.MIN_DAYS_ACTIVE)

  const { data: profiles, error: profileError } = await getSupabase()
    .from('user_profiles')
    .select('id, organization_id, display_name')
    .lte('created_at', thirtyDaysAgo.toISOString())

  if (profileError || !profiles) {
    console.error('Error fetching profiles:', profileError)
    return []
  }

  const qualifiedUsers: QualifiedUser[] = []

  for (const profile of profiles) {
    // Check entry count for their organization
    const { count: entryCount } = await getSupabase()
      .from('correspondence')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)

    if (!entryCount || entryCount < REVIEW_CRITERIA.MIN_ENTRIES) {
      continue
    }

    // Check if we've already requested a review recently
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - REVIEW_CRITERIA.DAYS_SINCE_LAST_REQUEST)

    const { data: recentRequest } = await getSupabase()
      .from('review_requests')
      .select('id')
      .eq('user_id', profile.id)
      .gte('requested_at', ninetyDaysAgo.toISOString())
      .limit(1)
      .single()

    if (recentRequest) {
      continue // Already requested recently
    }

    // Get user's email from auth
    const { data: authUser } = await getSupabase().auth.admin.getUserById(profile.id)

    if (!authUser?.user?.email) {
      continue
    }

    qualifiedUsers.push({
      user_id: profile.id,
      organization_id: profile.organization_id,
      email: authUser.user.email,
      display_name: profile.display_name || 'there',
      days_active: Math.floor(
        (Date.now() - new Date(authUser.user.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      ),
      entry_count: entryCount,
    })
  }

  return qualifiedUsers
}

/**
 * Send review request email
 */
export async function sendReviewRequest(
  user: QualifiedUser,
  platform: 'g2' | 'capterra' | 'trustpilot' | 'google' = 'g2'
): Promise<boolean> {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@correspondenceclerk.com'

  // Review URLs (update these with actual URLs when available)
  const reviewUrls: Record<string, string> = {
    g2: 'https://www.g2.com/products/correspondence-clerk/reviews',
    capterra: 'https://www.capterra.com/p/correspondence-clerk/reviews/',
    trustpilot: 'https://www.trustpilot.com/review/correspondenceclerk.com',
    google: 'https://g.page/correspondence-clerk/review',
  }

  const subject = 'Would you mind leaving us a review?'
  const body = `Hi ${user.display_name},

You've been using Correspondence Clerk for a while now and have logged over ${user.entry_count} pieces of correspondence.

If you've found it useful, would you mind leaving us a quick review? It really helps other people discover us.

${reviewUrls[platform]}

Takes about 2 minutes. No pressure at all if you'd rather not.

Thanks,
Tom

P.S. If there's anything we could do better, reply to this email instead - I read every response.`

  // Development mode
  if (!sendGridApiKey || process.env.NODE_ENV === 'development') {
    console.log('='.repeat(80))
    console.log('REVIEW REQUEST EMAIL (dev mode)')
    console.log('='.repeat(80))
    console.log(`To: ${user.email}`)
    console.log(`Subject: ${subject}`)
    console.log('')
    console.log(body)
    console.log('='.repeat(80))

    // Still record the request in dev
    await recordReviewRequest(user, platform)
    return true
  }

  try {
    await sgMail.send({
      to: user.email,
      from: {
        email: fromEmail,
        name: 'Tom at Correspondence Clerk',
      },
      subject,
      text: body,
    })

    await recordReviewRequest(user, platform)
    return true
  } catch (error) {
    console.error('SendGrid error:', error)
    return false
  }
}

/**
 * Record that we requested a review
 */
async function recordReviewRequest(
  user: QualifiedUser,
  platform: string
): Promise<void> {
  await getSupabase().from('review_requests').insert({
    user_id: user.user_id,
    organization_id: user.organization_id,
    platform,
    status: 'requested',
  })
}

/**
 * Process review requests (called by cron)
 */
export async function processReviewRequests(): Promise<{
  qualified: number
  sent: number
  errors: number
}> {
  const stats = { qualified: 0, sent: 0, errors: 0 }

  const qualifiedUsers = await findQualifiedUsers()
  stats.qualified = qualifiedUsers.length

  // Limit to 10 per day to avoid spam
  const usersToContact = qualifiedUsers.slice(0, 10)

  for (const user of usersToContact) {
    const sent = await sendReviewRequest(user, 'g2')
    if (sent) {
      stats.sent++
    } else {
      stats.errors++
    }

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return stats
}
