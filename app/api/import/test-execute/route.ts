/**
 * DEV-ONLY: Test execute endpoint for the bulk import pipeline.
 *
 * Identical to the Gmail execute route except it accepts pre-built email bodies
 * in the request JSON instead of fetching them from the Gmail API.
 * This lets us test the full DB-write path (business creation, contact creation,
 * correspondence insert, dedup, queue enqueue) with zero external dependencies.
 *
 * Returns 404 in production.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { enqueueForFormatting } from '@/lib/email-import/queue'
import type { ScanBusiness } from '@/lib/email-import/domain-grouper'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }

  // Accept Bearer token from Authorization header (dev script convenience)
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return new Response('Unauthorized', { status: 401 })

  // Create an anon client authenticated with the user's access token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

  // Verify token and get user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return new Response('Unauthorized', { status: 401 })

  // Get org id
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const orgId = profile?.organization_id
  if (!orgId) return new Response('No organisation', { status: 403 })

  const body = await request.json()
  const {
    businesses,
    emailBodies,
  }: {
    scanId?: string
    businesses: ScanBusiness[]
    emailBodies: Record<string, string>
  } = body

  if (!businesses || !emailBodies) {
    return new Response('Missing businesses or emailBodies', { status: 400 })
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
          (s, b) =>
            s + b.contacts.filter((c) => !c.excluded).reduce((cs, c) => cs + c.emailIds.length, 0),
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
                  emails: [contact.email.toLowerCase()],
                })
                .select('id')
                .single()
              contactId = newContact?.id ?? null
            }

            if (!contactId) continue

            for (const emailId of contact.emailIds) {
              const rawBody = emailBodies[emailId]
              if (!rawBody) {
                skipped++
                send('progress', { imported, skipped, total: totalEmails })
                continue
              }

              // Parse minimal headers from the raw body string
              const lines = rawBody.split('\n')
              const header = (prefix: string) =>
                lines.find((l) => l.toLowerCase().startsWith(prefix.toLowerCase()))?.slice(prefix.length).trim() ?? ''

              const fromHeader = header('From:')
              const subjectHeader = header('Subject:')
              const dateHeader = header('Date:')
              const bodyText = rawBody.split('\n\n').slice(1).join('\n\n').trim()

              const rawText = `From: ${fromHeader}\nTo: ${contact.email}\nDate: ${dateHeader}\nSubject: ${subjectHeader}\n\n${bodyText}`

              // Dedup check via content hash
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

              // Direction: if from header contains contact email → received, else sent
              const isFromContact = fromHeader.toLowerCase().includes(contact.email.toLowerCase())
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
                  entry_date: dateHeader || new Date().toISOString(),
                  subject: subjectHeader || '(No subject)',
                  type: 'Email',
                  direction,
                  action_needed: 'none',
                  formatting_status: 'unformatted',
                  content_hash: contentHash,
                  ai_metadata: {
                    bulk_import: true,
                    source: 'test',
                    external_id: emailId,
                    imported_at: new Date().toISOString(),
                  },
                })
                .select('id')
                .single()

              if (entry) {
                await supabase
                  .from('businesses')
                  .update({ last_contacted_at: dateHeader || new Date().toISOString() })
                  .eq('id', businessId!)
                  .lt('last_contacted_at', dateHeader || new Date().toISOString())

                await enqueueForFormatting(createServiceRoleClient(), orgId, entry.id)
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
        console.error('test-execute error:', err)
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
