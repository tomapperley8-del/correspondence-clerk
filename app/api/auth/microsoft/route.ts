import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Must be authenticated to connect Outlook
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
  const clientId = process.env.MICROSOFT_CLIENT_ID!
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI!

  // CSRF state
  const state = crypto.randomUUID()

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'Mail.Read offline_access',
    state,
    prompt: 'consent',
  })

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
