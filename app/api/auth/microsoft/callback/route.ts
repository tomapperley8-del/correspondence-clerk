import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/import?error=microsoft_denied', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/import?error=microsoft_invalid', request.url))
  }

  const savedState = request.cookies.get('oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/import?error=microsoft_state', request.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
      scope: 'Mail.Read offline_access',
    })

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/import?error=microsoft_token_failed', request.url))
    }

    const tokens = await tokenRes.json()

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL('/import?error=microsoft_no_token', request.url))
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const serviceClient = createServiceRoleClient()
    const { data: existing } = await serviceClient
      .from('user_profiles')
      .select('microsoft_refresh_token')
      .eq('id', user.id)
      .single()

    const updateData: Record<string, string | null> = {
      microsoft_access_token: tokens.access_token,
      microsoft_token_expiry: expiresAt,
    }

    if (tokens.refresh_token) {
      updateData.microsoft_refresh_token = tokens.refresh_token
    } else if (!existing?.microsoft_refresh_token) {
      return NextResponse.redirect(new URL('/import?error=microsoft_no_refresh', request.url))
    }

    await serviceClient
      .from('user_profiles')
      .update(updateData)
      .eq('id', user.id)

    const response = NextResponse.redirect(new URL('/import/outlook', request.url))
    response.cookies.delete('oauth_state')
    return response
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err)
    return NextResponse.redirect(new URL('/import?error=microsoft_failed', request.url))
  }
}
