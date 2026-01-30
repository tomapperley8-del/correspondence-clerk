import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number
  /** Window size in milliseconds */
  windowMs: number
  /** Endpoint identifier for grouping rate limits */
  endpoint: string
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Remaining requests in the current window */
  remaining: number
  /** Milliseconds until the window resets */
  resetIn: number
}

/**
 * Check if a request is within rate limits
 * Uses Supabase for persistence across serverless instances
 */
export async function checkRateLimit(
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const identifier = user?.id || 'anonymous'
  const now = new Date()
  const expiresAt = new Date(now.getTime() + config.windowMs)

  try {
    // Try to get existing rate limit entry
    const { data: existing } = await supabase
      .from('rate_limits')
      .select('id, request_count, window_start, expires_at')
      .eq('identifier', identifier)
      .eq('endpoint', config.endpoint)
      .single()

    if (existing) {
      const windowExpired = new Date(existing.expires_at) < now

      if (windowExpired) {
        // Window expired - reset the counter
        const { error: updateError } = await supabase
          .from('rate_limits')
          .update({
            request_count: 1,
            window_start: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          })
          .eq('id', existing.id)

        if (updateError) {
          console.error('Rate limit update error:', updateError)
          // Fail open - allow request if rate limiting fails
          return { allowed: true, remaining: config.limit - 1, resetIn: config.windowMs }
        }

        return {
          allowed: true,
          remaining: config.limit - 1,
          resetIn: config.windowMs,
        }
      } else {
        // Window still active - increment counter
        const newCount = existing.request_count + 1
        const resetIn = new Date(existing.expires_at).getTime() - now.getTime()

        const { error: updateError } = await supabase
          .from('rate_limits')
          .update({ request_count: newCount })
          .eq('id', existing.id)

        if (updateError) {
          console.error('Rate limit increment error:', updateError)
          // Fail open
          return { allowed: true, remaining: Math.max(0, config.limit - newCount), resetIn }
        }

        return {
          allowed: newCount <= config.limit,
          remaining: Math.max(0, config.limit - newCount),
          resetIn,
        }
      }
    } else {
      // No existing entry - create one
      const { error: insertError } = await supabase
        .from('rate_limits')
        .insert({
          identifier,
          endpoint: config.endpoint,
          request_count: 1,
          window_start: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })

      if (insertError) {
        // Could be a race condition - another request created the entry
        // Try to increment instead
        if (insertError.code === '23505') { // Unique violation
          return checkRateLimit(config) // Retry
        }
        console.error('Rate limit insert error:', insertError)
        // Fail open
        return { allowed: true, remaining: config.limit - 1, resetIn: config.windowMs }
      }

      return {
        allowed: true,
        remaining: config.limit - 1,
        resetIn: config.windowMs,
      }
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Fail open - don't block requests if rate limiting fails
    return { allowed: true, remaining: config.limit, resetIn: config.windowMs }
  }
}

/**
 * Create a 429 Too Many Requests response
 */
export function rateLimitResponse(resetIn: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(resetIn / 1000)),
      },
    }
  )
}

/**
 * Rate limit error for server actions
 */
export function rateLimitError(resetIn: number): { error: string } {
  const seconds = Math.ceil(resetIn / 1000)
  return { error: `Rate limit exceeded. Please wait ${seconds} seconds.` }
}

/**
 * Clean up expired rate limit entries
 * Call this from a scheduled job or cron
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('cleanup_expired_rate_limits')

  if (error) {
    console.error('Rate limit cleanup error:', error)
    return 0
  }

  return data || 0
}
