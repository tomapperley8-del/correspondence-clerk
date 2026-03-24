import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { fetchOutlookFullEmail } from '@/lib/email-import/outlook-client'
import { enqueueForFormatting } from '@/lib/email-import/queue'
import type { ScanBusiness } from '@/lib/email-import/domain-grouper'

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
          let businessId = business.existingBusinessId

          if (!businessId) {
            const { data: newBusiness } = await supabase
              .from('businesses')
              .insert({
                organization_id: orgId,
                name: business.name,
                normalized_name: business.name.toLowerCase().trim(),
                status: 'prospect',
              })
              .select('id')
              .single()
            businessId = newBusiness?.id ?? null
          }

          if (!businessId) continue

          const activeContacts = business.contacts.filter((c) => !c.excluded)

          for (const contact of activeContacts) {
            let contactId = contact.existingContactId

            if (!contactId) {
              const { data: newContact } = await supabase
                .from('contacts')
                .insert({
                  business_id: businessId,
                  organization_id: orgId,
                  name: contact.name,
                  normalized_email: contact.email.toLowerCase(),
                  emails: JSON.stringify([contact.email.toLowerCase()]),
                })
                .select('id')
                .single()
              contactId = newContact?.id ?? null
            }

            if (!contactId) continue

            for (const emailId of contact.emailIds) {
              const fullEmail = await fetchOutlookFullEmail(tokens, emailId, onTokenRefresh)
              if (!fullEmail) {
                skipped++
                send('progress', { imported, skipped, total: totalEmails })
                continue
              }

              const rawText = `From: ${fullEmail.from}\nTo: ${fullEmail.to}\nDate: ${fullEmail.date}\nSubject: ${fullEmail.subject}\n\n${fullEmail.bodyText}`

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

              const fromEmail = fullEmail.from.toLowerCase()
              const isFromContact = fromEmail.includes(contact.email.toLowerCase())
              const direction: 'sent' | 'received' = isFromContact ? 'received' : 'sent'

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
                    source: 'outlook',
                    external_id: emailId,
                    imported_at: new Date().toISOString(),
                  },
                })
                .select('id')
                .single()

              if (entry) {
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
