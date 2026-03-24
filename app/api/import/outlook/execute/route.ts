import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { fetchOutlookFullEmail } from '@/lib/email-import/outlook-client'
import { executeChunk } from '@/lib/email-import/execute-chunk'
import type { ScanBusiness } from '@/lib/email-import/domain-grouper'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return new Response('No organisation', { status: 403 })

  const body = await request.json()
  const {
    scanId,
    businesses,
    offset = 0,
    importedSoFar = 0,
    skippedSoFar = 0,
  }: {
    scanId: string
    businesses: ScanBusiness[]
    offset?: number
    importedSoFar?: number
    skippedSoFar?: number
  } = body

  if (!scanId || !businesses) return new Response('Missing scanId or businesses', { status: 400 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('microsoft_access_token, microsoft_refresh_token, microsoft_token_expiry')
    .eq('id', user.id)
    .single()

  if (!profile?.microsoft_access_token) {
    return new Response('Outlook not connected', { status: 400 })
  }

  let tokens = {
    accessToken: profile.microsoft_access_token,
    refreshToken: profile.microsoft_refresh_token,
    tokenExpiry: profile.microsoft_token_expiry,
  }

  const serviceClient = createServiceRoleClient()

  const onTokenRefresh = async (newTokens: typeof tokens) => {
    tokens = newTokens
    await serviceClient
      .from('user_profiles')
      .update({
        microsoft_access_token: newTokens.accessToken,
        microsoft_refresh_token: newTokens.refreshToken,
        microsoft_token_expiry: newTokens.tokenExpiry,
      })
      .eq('id', user.id)
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await executeChunk({
          supabase,
          serviceClient,
          orgId,
          userId: user.id,
          businesses,
          offset,
          importedSoFar,
          skippedSoFar,
          source: 'outlook',
          fetchEmail: (emailId) => fetchOutlookFullEmail(tokens, emailId, onTokenRefresh),
          send,
        })
      } catch (err) {
        console.error('Outlook execute error:', err)
        send('error', { message: err instanceof Error ? err.message : 'Import failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
