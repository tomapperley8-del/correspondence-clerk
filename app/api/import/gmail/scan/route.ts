import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { scanGmailEmails } from '@/lib/email-import/gmail-client'
import { buildContactEmailMapDirect } from '@/lib/email-import/contact-matcher'
import { groupEmailsIntoBusinesses } from '@/lib/email-import/domain-grouper'
import { makeGmailTokenRefreshHandler } from '@/lib/email-import/token-helpers'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  // Load Gmail tokens
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', user.id)
    .single()

  if (!profile?.google_access_token) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
  }

  const body = await request.json()
  const months: number = body.months ?? 3
  const since = new Date()
  since.setMonth(since.getMonth() - months)

  const tokens = {
    accessToken: profile.google_access_token,
    refreshToken: profile.google_refresh_token,
    tokenExpiry: profile.google_token_expiry,
  }

  const serviceClient = createServiceRoleClient()
  const onTokenRefresh = makeGmailTokenRefreshHandler(serviceClient, user.id)

  // Scan Gmail headers
  const emails = await scanGmailEmails(tokens, since, onTokenRefresh)

  // Build contact map
  const contactMap = await buildContactEmailMapDirect(supabase, orgId)

  // Get already-imported external IDs to detect duplicates at scan time
  // (We check by content_hash at execute time, but knowing existing IDs helps estimate)
  const ownEmails = new Set<string>()
  if (user.email) ownEmails.add(user.email.toLowerCase())

  // Group into businesses
  const scanResult = groupEmailsIntoBusinesses(
    emails,
    contactMap,
    ownEmails,
    new Set(), // alreadyImportedHashes — not checked at scan time (checked at execute)
    'gmail',
    months
  )

  // Store in temporary_email_data with 24h expiry
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
