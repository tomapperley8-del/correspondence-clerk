/**
 * Shared execute-chunk logic for Gmail and Outlook bulk import.
 *
 * Processes a slice of work items (one chunk) with:
 * - Parallel email fetching (FETCH_BATCH_SIZE at a time)
 * - Idempotent business/contact resolution (safe to re-run after timeout)
 * - Batched hash computation (parallel)
 * - Single batch dedup query per fetch batch
 * - SSE progress events throughout
 */

import { enqueueForFormatting } from './queue'
import type { ScanBusiness, ScanContact } from './domain-grouper'

export const CHUNK_SIZE = 150    // emails per server request (~50s on Hobby plan)
export const FETCH_BATCH_SIZE = 10 // concurrent email fetches per mini-batch

export type FullEmail = {
  from: string
  to: string
  date: string
  subject: string
  bodyText: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

type SendFn = (event: string, data: unknown) => void

export async function executeChunk({
  supabase,
  serviceClient,
  orgId,
  userId,
  businesses,
  offset,
  importedSoFar,
  skippedSoFar,
  source,
  fetchEmail,
  send,
}: {
  supabase: AnyClient
  serviceClient: AnyClient
  orgId: string
  userId: string
  businesses: ScanBusiness[]
  offset: number
  importedSoFar: number
  skippedSoFar: number
  source: 'gmail' | 'outlook'
  fetchEmail: (emailId: string) => Promise<FullEmail | null>
  send: SendFn
}): Promise<void> {
  // Flatten all work items in deterministic order
  type WorkItem = { business: ScanBusiness; contact: ScanContact; emailId: string }
  const allItems: WorkItem[] = []
  for (const business of businesses.filter((b) => !b.excluded)) {
    for (const contact of business.contacts.filter((c) => !c.excluded)) {
      for (const emailId of contact.emailIds) {
        allItems.push({ business, contact, emailId })
      }
    }
  }

  const totalEmails = allItems.length
  const chunk = allItems.slice(offset, offset + CHUNK_SIZE)

  // In-request ID caches — avoid redundant lookups within the same chunk
  const bizCache = new Map<string, string>()
  const contactCache = new Map<string, string>()

  // Idempotent: resolves existing ID or creates, safe to call across chunks.
  // Cache key uses existing ID when known (stable), falls back to normalised name.
  const resolveBiz = async (b: ScanBusiness): Promise<string | null> => {
    const key = b.existingBusinessId ?? b.name.toLowerCase().trim()
    if (bizCache.has(key)) return bizCache.get(key)!
    if (b.existingBusinessId) {
      bizCache.set(key, b.existingBusinessId)
      return b.existingBusinessId
    }
    const { data: found } = await supabase
      .from('businesses')
      .select('id')
      .eq('organization_id', orgId)
      .eq('normalized_name', key)
      .single()
    if (found) {
      bizCache.set(key, found.id)
      return found.id
    }
    const { data: created, error: createErr } = await supabase
      .from('businesses')
      .insert({ organization_id: orgId, name: b.name, normalized_name: key, status: 'prospect' })
      .select('id')
      .single()
    if (createErr?.code === '23505') {
      // Race condition: another chunk created this business concurrently — re-fetch it
      const { data: found2 } = await supabase
        .from('businesses')
        .select('id')
        .eq('organization_id', orgId)
        .eq('normalized_name', key)
        .single()
      if (found2) bizCache.set(key, found2.id)
      return found2?.id ?? null
    }
    if (created) bizCache.set(key, created.id)
    return created?.id ?? null
  }

  const resolveContact = async (c: ScanContact, businessId: string): Promise<string | null> => {
    const key = c.email.toLowerCase()
    if (contactCache.has(key)) return contactCache.get(key)!
    if (c.existingContactId) {
      contactCache.set(key, c.existingContactId)
      return c.existingContactId
    }
    const { data: found } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('normalized_email', key)
      .single()
    if (found) {
      contactCache.set(key, found.id)
      return found.id
    }
    const { data: created, error: createErr } = await supabase
      .from('contacts')
      .insert({
        business_id: businessId,
        organization_id: orgId,
        name: c.name,
        normalized_email: key,
        emails: [key],
      })
      .select('id')
      .single()
    if (createErr?.code === '23505') {
      // Race condition: another chunk created this contact concurrently — re-fetch it
      const { data: found2 } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('normalized_email', key)
        .single()
      if (found2) contactCache.set(key, found2.id)
      return found2?.id ?? null
    }
    if (created) contactCache.set(key, created.id)
    return created?.id ?? null
  }

  let imported = importedSoFar
  let skipped = skippedSoFar

  send('start', { total: totalEmails, offset })

  for (let i = 0; i < chunk.length; i += FETCH_BATCH_SIZE) {
    const fetchBatch = chunk.slice(i, i + FETCH_BATCH_SIZE)

    // Resolve business/contact IDs sequentially to avoid creation races
    type Resolved = { businessId: string; contactId: string; contactEmail: string } | null
    const resolved: Resolved[] = []
    for (const item of fetchBatch) {
      const bizId = await resolveBiz(item.business)
      if (!bizId) { resolved.push(null); continue }
      const cId = await resolveContact(item.contact, bizId)
      resolved.push(cId ? { businessId: bizId, contactId: cId, contactEmail: item.contact.email } : null)
    }

    // Fetch all emails in the batch concurrently
    const fetched = await Promise.allSettled(
      fetchBatch.map((item, idx) =>
        resolved[idx] ? fetchEmail(item.emailId) : Promise.resolve(null)
      )
    )

    // Build the list of successfully fetched emails ready for DB work
    type ReadyEmail = Resolved & {
      emailId: string
      rawText: string
      date: string
      subject: string
    }
    const toProcess: NonNullable<ReadyEmail>[] = []

    for (let j = 0; j < fetched.length; j++) {
      const res = resolved[j]
      const fr = fetched[j]
      if (!res || fr.status === 'rejected' || !fr.value) {
        skipped++
        send('progress', { imported, skipped, total: totalEmails })
        continue
      }
      const em = fr.value
      const rawText = `From: ${em.from}\nTo: ${em.to}\nDate: ${em.date}\nSubject: ${em.subject}\n\n${em.bodyText}`
      toProcess.push({
        ...res,
        emailId: fetchBatch[j].emailId,
        rawText,
        date: em.date,
        subject: em.subject,
      })
    }

    if (toProcess.length === 0) continue

    // Compute all hashes in parallel
    const hashes = await Promise.all(
      toProcess.map(({ rawText }) =>
        supabase
          .rpc('compute_content_hash', { raw_text: rawText })
          .then((r: { data: string | null }) => r.data)
      )
    )

    // Single batch dedup query for the whole fetch batch
    const hashList = hashes.filter((h: string | null): h is string => !!h)
    const existingHashes = new Set<string>()
    if (hashList.length > 0) {
      const { data: existing } = await supabase
        .from('correspondence')
        .select('content_hash')
        .eq('organization_id', orgId)
        .in('content_hash', hashList)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existing?.forEach((r: any) => { if (r.content_hash) existingHashes.add(r.content_hash) })
    }

    // Insert non-duplicates
    for (let j = 0; j < toProcess.length; j++) {
      const { businessId, contactId, contactEmail, emailId, rawText, date, subject } = toProcess[j]
      const hash: string | null = hashes[j]

      if (hash && existingHashes.has(hash)) {
        skipped++
        send('progress', { imported, skipped, total: totalEmails })
        continue
      }

      const fromLine = rawText.split('\n')[0] ?? ''
      const direction: 'sent' | 'received' = fromLine.toLowerCase().includes(contactEmail.toLowerCase())
        ? 'received'
        : 'sent'

      const { data: entry } = await supabase
        .from('correspondence')
        .insert({
          organization_id: orgId,
          business_id: businessId,
          contact_id: contactId,
          user_id: userId,
          raw_text_original: rawText,
          formatted_text_original: null,
          formatted_text_current: null,
          entry_date: date,
          subject: subject || '(No subject)',
          type: 'Email',
          direction,
          action_needed: 'none',
          formatting_status: 'unformatted',
          content_hash: hash,
          ai_metadata: {
            bulk_import: true,
            source,
            external_id: emailId,
            imported_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single()

      if (entry) {
        await supabase
          .from('businesses')
          .update({ last_contacted_at: date })
          .eq('id', businessId)
          .lt('last_contacted_at', date)
        await enqueueForFormatting(serviceClient, orgId, entry.id)
        imported++
      } else {
        skipped++
      }

      send('progress', { imported, skipped, total: totalEmails })
    }
  }

  const nextOffset = offset + CHUNK_SIZE
  if (nextOffset >= totalEmails) {
    send('done', { imported, skipped })
  } else {
    send('chunk_done', { nextOffset, imported, skipped, total: totalEmails })
  }
}
