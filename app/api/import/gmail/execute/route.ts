import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { fetchGmailFullEmail } from '@/lib/email-import/gmail-client'
import { enqueueForFormatting } from '@/lib/email-import/queue'
import type { ScanBusiness, ScanResult } from '@/lib/email-import/domain-grouper'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return new Response('No organisation', { status: 403 })

  const body = await request.json()
  const { scanId, businesses }: { scanId: string; businesses: ScanBusiness[] } = body

  if (!scanId || !businesses) return new Response('Missing scanId or businesses', { status: 400 })

  // Load Gmail tokens
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', user.id)
    .single()

  if (!profile?.google_access_token) {
    return new Response('Gmail not connected', { status: 400 })
  }

  const tokens = {
    accessToken: profile.google_access_token,
    refreshToken: profile.google_refresh_token,
    tokenExpiry: profile.google_token_expiry,
  }

  const serviceClient = createServiceRoleClient()

  const onTokenRefresh = async (newAccessToken: string, newExpiry: Date | null) => {
    await serviceClient
      .from('user_profiles')
      .update({
        google_access_token: newAccessToken,
        google_token_expiry: newExpiry?.toISOString() ?? null,
      })
      .eq('id', user.id)
  }

  // SSE stream
  const encoder = new TextEncoder()
  let imported = 0
  let skipped = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const activeBusinesses = businesses.filter((b) => !b.excluded)
        const totalEmails = activeBusinesses.reduce(
          (s, b) => s + b.contacts.filter((c) => !c.excluded).reduce((cs, c) => cs + c.emailIds.length, 0),
          0
        )
        send('start', { total: totalEmails })

        for (const business of activeBusinesses) {
          // Resolve or create business
          let businessId = business.existingBusinessId

          if (!businessId) {
            const { data: newBusiness } = await supabase
              .from('businesses')
              .insert({
                organization_id: orgId,
                name: business.name,
                status: 'prospect',
              })
              .select('id')
              .single()
            businessId = newBusiness?.id ?? null
          }

          if (!businessId) continue

          const activeContacts = business.contacts.filter((c) => !c.excluded)

          for (const contact of activeContacts) {
            // Resolve or create contact
            let contactId = contact.existingContactId

            if (!contactId) {
              const { data: newContact } = await supabase
                .from('contacts')
                .insert({
                  business_id: businessId,
                  name: contact.name,
                  normalized_email: contact.email.toLowerCase(),
                  emails: JSON.stringify([contact.email.toLowerCase()]),
                })
                .select('id')
                .single()
              contactId = newContact?.id ?? null
            }

            if (!contactId) continue

            // Determine direction: if contact email matches from → received, else sent
            for (const emailId of contact.emailIds) {
              const fullEmail = await fetchGmailFullEmail(tokens, emailId, onTokenRefresh)
              if (!fullEmail) {
                skipped++
                send('progress', { imported, skipped, total: totalEmails })
                continue
              }

              // Build raw_text in standard format (same as import-email route)
              const rawText = `From: ${fullEmail.from}\nTo: ${fullEmail.to}\nDate: ${fullEmail.date}\nSubject: ${fullEmail.subject}\n\n${fullEmail.bodyText}`

              // Compute content hash and check for duplicate
              const { data: hashData } = await supabase.rpc('compute_content_hash', { raw_text: rawText })
              const contentHash = hashData as string | null

              if (contentHash) {
                const { data: existing } = await supabase
                  .from('correspondence')
                  .select('id')
                  .eq('organization_id', orgId)
                  .eq('content_hash', contentHash)
                  .limit(1)
                  .single()

                if (existing) {
                  skipped++
                  send('progress', { imported, skipped, total: totalEmails })
                  continue
                }
              }

              // Determine direction
              const fromEmail = fullEmail.from.toLowerCase()
              const isFromContact = fromEmail.includes(contact.email.toLowerCase())
              const direction: 'sent' | 'received' = isFromContact ? 'received' : 'sent'

              // Create correspondence entry
              const { data: entry } = await supabase
                .from('correspondence')
                .insert({
                  organization_id: orgId,
                  business_id: businessId,
                  contact_id: contactId,
                  user_id: user.id,
                  raw_text_original: rawText,
                  formatted_text_original: null,
                  formatted_text_current: null,
                  entry_date: fullEmail.date,
                  subject: fullEmail.subject,
                  type: 'Email',
                  direction,
                  action_needed: 'none',
                  formatting_status: 'unformatted',
                  content_hash: contentHash,
                  ai_metadata: {
                    bulk_import: true,
                    source: 'gmail',
                    external_id: emailId,
                    imported_at: new Date().toISOString(),
                  },
                })
                .select('id')
                .single()

              if (entry) {
                // Update business last_contacted_at if this email is newer
                await supabase
                  .from('businesses')
                  .update({ last_contacted_at: fullEmail.date })
                  .eq('id', businessId!)
                  .lt('last_contacted_at', fullEmail.date)

                await enqueueForFormatting(serviceClient, orgId, entry.id)
                imported++
              } else {
                skipped++
              }

              send('progress', { imported, skipped, total: totalEmails })
            }
          }
        }

        send('done', { imported, skipped })
      } catch (err) {
        console.error('Gmail execute error:', err)
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
