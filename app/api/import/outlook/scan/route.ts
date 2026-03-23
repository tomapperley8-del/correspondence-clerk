import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { scanOutlookEmails } from '@/lib/email-import/outlook-client'
import { buildContactEmailMapDirect } from '@/lib/email-import/contact-matcher'
import { groupEmailsIntoBusinesses } from '@/lib/email-import/domain-grouper'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('microsoft_access_token, microsoft_refresh_token, microsoft_token_expiry')
    .eq('id', user.id)
    .single()

  if (!profile?.microsoft_access_token) {
    return NextResponse.json({ error: 'Outlook not connected' }, { status: 400 })
  }

  const body = await request.json()
  const months: number = body.months ?? 3
  const since = new Date()
  since.setMonth(since.getMonth() - months)

  const tokens = {
    accessToken: profile.microsoft_access_token,
    refreshToken: profile.microsoft_refresh_token,
    tokenExpiry: profile.microsoft_token_expiry,
  }

  const serviceClient = createServiceRoleClient()

  const onTokenRefresh = async (newTokens: typeof tokens) => {
    await serviceClient
      .from('user_profiles')
      .update({
        microsoft_access_token: newTokens.accessToken,
        microsoft_refresh_token: newTokens.refreshToken,
        microsoft_token_expiry: newTokens.tokenExpiry,
      })
      .eq('id', user.id)
  }

  const emails = await scanOutlookEmails(tokens, since, onTokenRefresh)
  const contactMap = await buildContactEmailMapDirect(supabase, orgId)

  const ownEmails = new Set<string>()
  if (user.email) ownEmails.add(user.email.toLowerCase())

  const scanResult = groupEmailsIntoBusinesses(
    emails,
    contactMap,
    ownEmails,
    new Set(),
    'outlook',
    months
  )

  const scanId = crypto.randomUUID()
  await serviceClient.from('temporary_email_data').insert({
    user_id: user.id,
    token: scanId,
    email_data: scanResult,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  return NextResponse.json({
    scanId,
    totalScanned: scanResult.totalScanned,
    businessCount: scanResult.businesses.length,
    contactCount: scanResult.businesses.reduce((s, b) => s + b.contacts.length, 0),
    emailCount: scanResult.businesses.reduce(
      (s, b) => s + b.contacts.reduce((cs, c) => cs + c.emailIds.length, 0),
      0
    ),
  })
}
