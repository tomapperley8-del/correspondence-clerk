import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // OAuth error from Google (e.g. user denied access)
  if (error) {
    return NextResponse.redirect(new URL('/import?error=google_denied', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/import?error=google_invalid', request.url))
  }

  // Verify CSRF state
  const savedState = request.cookies.get('oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/import?error=google_state', request.url))
  }

  // Must be authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL('/import?error=google_no_token', request.url))
    }

    // Save tokens to user_profiles via service role
    // Never overwrite an existing refresh token with null
    const serviceClient = createServiceRoleClient()
    const { data: existing } = await serviceClient
      .from('user_profiles')
      .select('google_refresh_token')
      .eq('id', user.id)
      .single()

    const updateData: Record<string, string | null> = {
      google_access_token: tokens.access_token,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
    }

    // Only update refresh token if we received one (Google only sends on first consent)
    if (tokens.refresh_token) {
      updateData.google_refresh_token = tokens.refresh_token
    } else if (!existing?.google_refresh_token) {
      // No existing refresh token and none returned — something's wrong
      return NextResponse.redirect(new URL('/import?error=google_no_refresh', request.url))
    }

    await serviceClient
      .from('user_profiles')
      .update(updateData)
      .eq('id', user.id)

    const response = NextResponse.redirect(new URL('/import/gmail', request.url))
    response.cookies.delete('oauth_state')
    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Google OAuth callback error:', msg)
    return NextResponse.redirect(new URL(`/import?error=google_failed&detail=${encodeURIComponent(msg)}`, request.url))
  }
}
