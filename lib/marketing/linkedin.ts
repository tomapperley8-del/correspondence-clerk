/**
 * LinkedIn API client for social media posting
 * API Documentation: https://learn.microsoft.com/en-us/linkedin/marketing/
 */

const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN
const LINKEDIN_ORGANIZATION_ID = process.env.LINKEDIN_ORGANIZATION_ID // For company page posts
const LINKEDIN_PERSON_ID = process.env.LINKEDIN_PERSON_ID // For personal posts
const API_BASE_URL = 'https://api.linkedin.com/v2'

export interface LinkedInPost {
  text: string
  visibility?: 'PUBLIC' | 'CONNECTIONS'
}

export interface LinkedInPostResult {
  success: boolean
  postId?: string
  error?: string
}

/**
 * Post to LinkedIn (personal profile or company page)
 */
export async function postToLinkedIn(
  post: LinkedInPost,
  asCompany: boolean = false
): Promise<LinkedInPostResult> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    console.error('LINKEDIN_ACCESS_TOKEN not configured')
    return { success: false, error: 'LinkedIn not configured' }
  }

  const authorId = asCompany
    ? `urn:li:organization:${LINKEDIN_ORGANIZATION_ID}`
    : `urn:li:person:${LINKEDIN_PERSON_ID}`

  if (!authorId || authorId.includes('undefined')) {
    return { success: false, error: 'LinkedIn author ID not configured' }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: authorId,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: post.text,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': post.visibility || 'PUBLIC',
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`LinkedIn API error: ${response.status} - ${errorText}`)
      return { success: false, error: `API error: ${response.status}` }
    }

    const result = await response.json()
    return { success: true, postId: result.id }
  } catch (error) {
    console.error('LinkedIn posting error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Get post engagement stats
 */
export async function getPostStats(
  postId: string
): Promise<{
  likes: number
  comments: number
  shares: number
  impressions: number
} | null> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    return null
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/socialActions/${encodeURIComponent(postId)}`,
      {
        headers: {
          'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    return {
      likes: data.likesSummary?.totalLikes || 0,
      comments: data.commentsSummary?.totalFirstLevelComments || 0,
      shares: data.shareStatistics?.shareCount || 0,
      impressions: data.impressionCount || 0,
    }
  } catch (error) {
    console.error('Error fetching LinkedIn stats:', error)
    return null
  }
}

/**
 * Verify LinkedIn connection is valid
 */
export async function verifyLinkedInConnection(): Promise<boolean> {
  if (!LINKEDIN_ACCESS_TOKEN) {
    return false
  }

  try {
    const response = await fetch(`${API_BASE_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      },
    })

    return response.ok
  } catch {
    return false
  }
}

/**
 * Format content for LinkedIn
 */
export function formatForLinkedIn(
  content: string,
  hashtags: string[]
): string {
  // Ensure content doesn't exceed LinkedIn's 3000 character limit
  let formatted = content.trim()

  // Add hashtags if they fit
  if (hashtags.length > 0) {
    const hashtagString = hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')
    const withHashtags = `${formatted}\n\n${hashtagString}`

    if (withHashtags.length <= 3000) {
      formatted = withHashtags
    }
  }

  // Truncate if still too long
  if (formatted.length > 3000) {
    formatted = formatted.slice(0, 2997) + '...'
  }

  return formatted
}
