/**
 * Twitter/X API client for social media posting
 * API Documentation: https://developer.twitter.com/en/docs/twitter-api
 */

const TWITTER_API_KEY = process.env.TWITTER_API_KEY
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN

const API_BASE_URL = 'https://api.twitter.com/2'

export interface Tweet {
  text: string
  reply_to?: string
}

export interface TweetResult {
  success: boolean
  tweetId?: string
  error?: string
}

/**
 * Post a tweet
 * Note: Requires OAuth 1.0a for user context (posting)
 */
export async function postTweet(tweet: Tweet): Promise<TweetResult> {
  if (!TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
    console.error('Twitter credentials not configured')
    return { success: false, error: 'Twitter not configured' }
  }

  // Validate tweet length
  if (tweet.text.length > 280) {
    return { success: false, error: 'Tweet exceeds 280 characters' }
  }

  try {
    // Using OAuth 1.0a for user context
    const oauthHeaders = await generateOAuthHeaders(
      'POST',
      `${API_BASE_URL}/tweets`,
      {}
    )

    const response = await fetch(`${API_BASE_URL}/tweets`, {
      method: 'POST',
      headers: {
        ...oauthHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: tweet.text,
        ...(tweet.reply_to && {
          reply: { in_reply_to_tweet_id: tweet.reply_to },
        }),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`Twitter API error: ${response.status}`, errorData)
      return { success: false, error: errorData.detail || `API error: ${response.status}` }
    }

    const result = await response.json()
    return { success: true, tweetId: result.data?.id }
  } catch (error) {
    console.error('Twitter posting error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Get tweet engagement metrics
 */
export async function getTweetMetrics(
  tweetId: string
): Promise<{
  likes: number
  retweets: number
  replies: number
  impressions: number
} | null> {
  if (!TWITTER_BEARER_TOKEN) {
    return null
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/tweets/${tweetId}?tweet.fields=public_metrics`,
      {
        headers: {
          'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const metrics = data.data?.public_metrics

    return {
      likes: metrics?.like_count || 0,
      retweets: metrics?.retweet_count || 0,
      replies: metrics?.reply_count || 0,
      impressions: metrics?.impression_count || 0,
    }
  } catch (error) {
    console.error('Error fetching tweet metrics:', error)
    return null
  }
}

/**
 * Verify Twitter connection
 */
export async function verifyTwitterConnection(): Promise<boolean> {
  if (!TWITTER_BEARER_TOKEN) {
    return false
  }

  try {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      headers: {
        'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
      },
    })

    return response.ok
  } catch {
    return false
  }
}

/**
 * Format content for Twitter (ensure under 280 chars)
 */
export function formatForTwitter(
  content: string,
  hashtags: string[]
): string {
  let formatted = content.trim()

  // Calculate space needed for hashtags
  const hashtagString = hashtags
    .slice(0, 2) // Max 2 hashtags for Twitter
    .map((h) => `#${h.replace(/^#/, '')}`)
    .join(' ')

  // If content + hashtags fit, add them
  if (formatted.length + hashtagString.length + 2 <= 280) {
    formatted = `${formatted} ${hashtagString}`
  } else if (formatted.length > 280) {
    // Truncate content to fit
    formatted = formatted.slice(0, 277) + '...'
  }

  return formatted
}

/**
 * Generate OAuth 1.0a headers for Twitter API
 * Simplified implementation - in production, use a proper OAuth library
 */
async function generateOAuthHeaders(
  method: string,
  url: string,
  params: Record<string, string>
): Promise<Record<string, string>> {
  const crypto = await import('crypto')

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: TWITTER_API_KEY!,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: TWITTER_ACCESS_TOKEN!,
    oauth_version: '1.0',
  }

  // Create signature base string
  const allParams = { ...oauthParams, ...params }
  const paramString = Object.keys(allParams)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
    .join('&')

  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`

  // Create signing key
  const signingKey = `${encodeURIComponent(TWITTER_API_SECRET!)}&${encodeURIComponent(TWITTER_ACCESS_SECRET!)}`

  // Generate signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')

  oauthParams.oauth_signature = signature

  // Build OAuth header
  const oauthHeader =
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ')

  return {
    Authorization: oauthHeader,
  }
}
