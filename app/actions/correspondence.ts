'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'
import { checkAndResolveActions } from '@/lib/ai/action-resolution'
import { detectTier1Action, detectPaymentResolution, TIER1_FINANCIAL, PAYMENT_RESOLUTION, TIER2_RECEIVED_COMMITMENTS, TIER2_INTEREST_SIGNALS, COMMITMENT_REGEX_PATTERNS, INTEREST_REGEX_PATTERNS } from '@/lib/ai/keyword-detection'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'

const createCorrespondenceSchema = z.object({
  business_id: z.string().uuid('Invalid business ID'),
  contact_id: z.string().uuid('Invalid contact ID').optional(),
  cc_contact_ids: z.array(z.string().uuid('Invalid CC contact ID')).optional(),
  bcc_contact_ids: z.array(z.string().uuid('Invalid BCC contact ID')).optional(),
  raw_text_original: z.string().min(1, 'Correspondence text is required').max(100000, 'Text too long'),
  entry_date: z.string().optional(),
  subject: z.string().max(500).optional(),
  type: z.enum(['Email', 'Call', 'Meeting', 'Email Thread', 'Note']).optional(),
  direction: z.enum(['received', 'sent']).optional(),
  action_needed: z.enum(['none', 'prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal']).optional(),
  due_at: z.string().optional(),
  ai_metadata: z.record(z.string(), z.unknown()).optional(),
  thread_participants: z.string().max(500).optional(),
  internal_sender: z.string().max(100).optional(),
})

export type Correspondence = {
  id: string
  business_id: string
  contact_id: string | null
  cc_contact_ids: string[] | null
  bcc_contact_ids: string[] | null
  user_id: string
  raw_text_original: string
  formatted_text_original: string | null
  formatted_text_current: string | null
  entry_date: string | null
  subject: string | null
  type: 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note' | null
  direction: 'received' | 'sent' | null
  action_needed:
    | 'none'
    | 'prospect'
    | 'follow_up'
    | 'waiting_on_them'
    | 'invoice'
    | 'renewal'
  due_at: string | null
  formatting_status: 'formatted' | 'unformatted' | 'failed'
  content_hash: string | null
  ai_metadata: Record<string, unknown> | null
  organization_id: string
  created_at: string
  updated_at: string
  edited_at: string | null
  edited_by: string | null
  is_pinned: boolean
  thread_participants: string | null
  internal_sender: string | null
  thread_id: string | null
  contact: {
    name: string
    role: string | null
    is_active?: boolean
  } | null
  cc_contacts?: Array<{
    id: string
    name: string
    role: string | null
  }>
  bcc_contacts?: Array<{
    id: string
    name: string
    role: string | null
  }>
}

export async function getCorrespondenceEntry(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { data, error } = await supabase
    .from('correspondence')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()
  if (error || !data) return { error: error?.message ?? 'Not found' }
  return { data: data as Correspondence }
}

export async function getCorrespondenceByBusiness(
  businessId: string,
  options: {
    limit?: number
    offset?: number
    contactId?: string
    direction?: 'all' | 'received' | 'sent' | 'conversation'
  } = {}
) {
  const { limit = 100, offset = 0, contactId, direction } = options
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Select only columns needed for list view (excludes large text fields for performance)
  let query = supabase
    .from('correspondence')
    .select(
      `
      id, business_id, contact_id, cc_contact_ids, bcc_contact_ids, user_id,
      raw_text_original, formatted_text_original, formatted_text_current,
      entry_date, subject, type, direction, formatting_status, action_needed,
      due_at, content_hash, ai_metadata, organization_id, created_at, updated_at, edited_at, edited_by,
      is_pinned, thread_participants, internal_sender, thread_id,
      contact:contacts(name, role, is_active)
    `,
      { count: 'exact' }
    )
    .eq('business_id', businessId)

  if (contactId && contactId !== 'all') {
    query = query.eq('contact_id', contactId)
  }
  if (direction === 'received' || direction === 'sent') {
    query = query.eq('direction', direction)
  } else if (direction === 'conversation') {
    query = query.in('direction', ['received', 'sent'])
  }

  const { data, error, count } = await query
    .order('is_pinned', { ascending: false })
    .order('entry_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return { error: error.message }
  }

  // Fetch CC and BCC contacts for entries that have them
  if (data && data.length > 0) {
    // Collect all unique CC and BCC contact IDs
    const allCcContactIds = new Set<string>()
    const allBccContactIds = new Set<string>()
    data.forEach((entry) => {
      if (entry.cc_contact_ids && Array.isArray(entry.cc_contact_ids)) {
        entry.cc_contact_ids.forEach((id: string) => allCcContactIds.add(id))
      }
      if (entry.bcc_contact_ids && Array.isArray(entry.bcc_contact_ids)) {
        entry.bcc_contact_ids.forEach((id: string) => allBccContactIds.add(id))
      }
    })

    // Combine all IDs for a single query
    const allContactIds = new Set([...allCcContactIds, ...allBccContactIds])

    if (allContactIds.size > 0) {
      // Fetch all CC/BCC contacts in one query
      const { data: extraContacts } = await supabase
        .from('contacts')
        .select('id, name, role')
        .in('id', Array.from(allContactIds))

      // Create a map for quick lookup
      const contactMap = new Map(
        (extraContacts || []).map((c) => [c.id, c])
      )

      // Add cc_contacts and bcc_contacts to each entry
      // Using type assertion for dynamic property assignment
      type ContactInfo = { id: string; name: string; role: string | null }
      type EntryWithExtras = typeof data[0] & {
        cc_contacts?: ContactInfo[]
        bcc_contacts?: ContactInfo[]
      }
      data.forEach((entry) => {
        const entryWithExtras = entry as EntryWithExtras
        if (entry.cc_contact_ids && Array.isArray(entry.cc_contact_ids)) {
          entryWithExtras.cc_contacts = entry.cc_contact_ids
            .map((id: string) => contactMap.get(id))
            .filter((c): c is ContactInfo => c !== undefined)
        } else {
          entryWithExtras.cc_contacts = []
        }
        if (entry.bcc_contact_ids && Array.isArray(entry.bcc_contact_ids)) {
          entryWithExtras.bcc_contacts = entry.bcc_contact_ids
            .map((id: string) => contactMap.get(id))
            .filter((c): c is ContactInfo => c !== undefined)
        } else {
          entryWithExtras.bcc_contacts = []
        }
      })
    }
  }

  // Supabase returns contact as object for foreign key joins, normalize for consistent typing
  const normalizedData = (data || []).map((entry) => {
    // Handle contact - could be object (normal) or array (edge case) or null
    // Note: contact_id is nullable for Note type entries
    let contact: { name: string; role: string | null; is_active?: boolean } | null
    if (Array.isArray(entry.contact)) {
      contact = entry.contact[0] || null
    } else if (entry.contact && typeof entry.contact === 'object') {
      contact = entry.contact as { name: string; role: string | null; is_active?: boolean }
    } else {
      contact = null
    }
    return {
      ...entry,
      contact,
      is_pinned: entry.is_pinned ?? false,
      thread_participants: (entry as Record<string, unknown>).thread_participants as string | null ?? null,
      internal_sender: (entry as Record<string, unknown>).internal_sender as string | null ?? null,
      thread_id: (entry as Record<string, unknown>).thread_id as string | null ?? null,
    }
  }) as Correspondence[]

  return { data: normalizedData, count }
}

export async function createCorrespondence(formData: {
  business_id: string
  contact_id?: string
  cc_contact_ids?: string[]
  bcc_contact_ids?: string[]
  raw_text_original: string
  entry_date?: string
  subject?: string
  type?: 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note'
  direction?: 'received' | 'sent'
  action_needed?: 'none' | 'prospect' | 'follow_up' | 'waiting_on_them' | 'invoice' | 'renewal'
  due_at?: string
  ai_metadata?: Record<string, unknown>
  thread_participants?: string
  internal_sender?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Validate input
  const parsed = createCorrespondenceSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Get user's organization
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Validate contact belongs to the same business (prevents cross-business data corruption)
  if (formData.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('business_id')
      .eq('id', formData.contact_id)
      .single()
    if (!contact || contact.business_id !== formData.business_id) {
      return { error: 'Contact does not belong to this business' }
    }
  }

  // For Meeting/Call/Note entries where no action was explicitly set by the user,
  // run Tier 1 keyword detection as a backstop. These entry types skip AI formatting
  // so action flags would otherwise be silent for all financial/obligation language.
  let resolvedActionNeeded = formData.action_needed || 'none'
  let resolvedDueAt = formData.due_at || null
  const isMeetingCallNote =
    !formData.action_needed || formData.action_needed === 'none'
      ? formData.type === 'Meeting' || formData.type === 'Call' || formData.type === 'Note'
      : false

  if (isMeetingCallNote) {
    const keywordMatch = detectTier1Action(formData.raw_text_original, formData.direction ?? null)
    if (keywordMatch) {
      resolvedActionNeeded = keywordMatch.action_type
      // Default due date: 7 days from entry date
      const base = formData.entry_date ? new Date(formData.entry_date) : new Date()
      base.setDate(base.getDate() + 7)
      resolvedDueAt = base.toISOString().split('T')[0]
    }
  }

  const { data, error } = await supabase
    .from('correspondence')
    .insert({
      business_id: formData.business_id,
      contact_id: formData.contact_id || null,
      cc_contact_ids: formData.cc_contact_ids || [],
      bcc_contact_ids: formData.bcc_contact_ids || [],
      user_id: user.id,
      raw_text_original: formData.raw_text_original,
      entry_date: formData.entry_date || new Date().toISOString(),
      subject: formData.subject || null,
      type: formData.type || null,
      direction: formData.direction || null,
      action_needed: resolvedActionNeeded,
      due_at: resolvedDueAt,
      ai_metadata: formData.ai_metadata || null,
      thread_participants: formData.thread_participants || null,
      internal_sender: formData.internal_sender || null,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update business last_contacted_at
  await supabase
    .from('businesses')
    .update({
      last_contacted_at: formData.entry_date || new Date().toISOString(),
    })
    .eq('id', formData.business_id)

  revalidatePath(`/businesses/${formData.business_id}`)
  revalidatePath('/dashboard')
  revalidatePath('/search')

  // Fast-path: if this entry contains payment confirmation language, immediately
  // resolve any open invoice/waiting_on_them flags for this business without
  // waiting for the Haiku AI call (which may miss this signal).
  if (detectPaymentResolution(formData.raw_text_original)) {
    try {
      const supabaseService = await createClient()
      const { data: paymentFlags } = await supabaseService
        .from('correspondence')
        .select('id')
        .eq('business_id', formData.business_id)
        .eq('organization_id', organizationId)
        .in('action_needed', ['invoice', 'waiting_on_them'])
        .neq('id', data.id)
      if (paymentFlags && paymentFlags.length > 0) {
        await supabaseService
          .from('correspondence')
          .update({ action_needed: 'none', due_at: null })
          .in('id', paymentFlags.map((f: { id: string }) => f.id))
          .eq('organization_id', organizationId)
        revalidatePath('/actions')
      }
    } catch (err) {
      console.error('Payment fast-path resolution failed:', err)
    }
  }

  // Run action resolution + structural promotion in parallel.
  // Both are fire-and-forget: errors are caught inside and never block the return.
  const [actionsResolved, threadsPromoted] = await Promise.all([
    checkAndResolveActions(
      organizationId,
      formData.business_id,
      formData.raw_text_original,
      formData.subject ?? null
    ).catch(err => { console.error('Action resolution check failed:', err); return 0 }),
    promoteOpenThreadsToActions(organizationId, formData.business_id)
      .catch(err => { console.error('promoteOpenThreadsToActions failed:', err); return 0 }),
  ])

  return { data, actionsResolved, threadsPromoted }
}

/**
 * Update formatted_text_current for manual corrections
 * Per CLAUDE.md: Edits are human corrections, never AI rewrites
 * Preserves raw_text_original and formatted_text_original
 */
export async function updateFormattedText(
  correspondenceId: string,
  formattedTextCurrent: string,
  entryDate?: string | null,
  subject?: string | null,
  internalSender?: string | null,
  actionNeeded?: string | null,
  dueAt?: string | null,
  direction?: 'received' | 'sent' | null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const updateData: Record<string, unknown> = {
    formatted_text_current: formattedTextCurrent,
    formatting_status: 'formatted',
    edited_at: new Date().toISOString(),
    edited_by: user.id,
  }

  // Only update entry_date if explicitly provided
  if (entryDate !== undefined) {
    updateData.entry_date = entryDate
  }

  // Only update subject if explicitly provided
  if (subject !== undefined) {
    updateData.subject = subject
  }

  // Only update internal_sender if explicitly provided
  if (internalSender !== undefined) {
    updateData.internal_sender = internalSender
  }

  if (actionNeeded !== undefined) {
    updateData.action_needed = actionNeeded || 'none'
  }

  if (dueAt !== undefined) {
    updateData.due_at = dueAt || null
  }

  if (direction !== undefined) {
    updateData.direction = direction
  }

  const { data, error } = await supabase
    .from('correspondence')
    .update(updateData)
    .eq('id', correspondenceId)
    .eq('organization_id', organizationId)
    .select('*, business_id')
    .single()

  if (error) {
    return { error: error.message }
  }

  if (data?.business_id) {
    revalidatePath(`/businesses/${data.business_id}`)
    revalidatePath('/search')
  }
  revalidatePath('/actions')

  return { data }
}


/**
 * Delete a correspondence entry
 */
export async function deleteCorrespondence(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Get business_id before deleting
  const { data: entry } = await supabase
    .from('correspondence')
    .select('business_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('correspondence').delete().eq('id', id).eq('organization_id', organizationId)

  if (error) {
    return { error: error.message }
  }

  if (entry) {
    revalidatePath(`/businesses/${entry.business_id}`)
  }
  revalidatePath('/dashboard')
  revalidatePath('/search')
  revalidatePath('/actions')

  return { success: true }
}

/**
 * Delete multiple correspondence entries at once
 */
export async function deleteMultipleCorrespondence(ids: string[]) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  if (ids.length === 0) {
    return { error: 'No entries to delete' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Get business_ids before deleting (for path revalidation)
  const { data: entries } = await supabase
    .from('correspondence')
    .select('business_id')
    .in('id', ids)

  const { error } = await supabase.from('correspondence').delete().in('id', ids).eq('organization_id', organizationId)

  if (error) {
    return { error: error.message }
  }

  // Revalidate all affected business pages
  const businessIds = new Set((entries || []).map((e) => e.business_id))
  for (const bizId of businessIds) {
    revalidatePath(`/businesses/${bizId}`)
  }
  revalidatePath('/dashboard')
  revalidatePath('/search')
  revalidatePath('/actions')

  return { success: true, deletedCount: ids.length }
}

/**
 * Update correspondence contact_id (reassign to different contact)
 * Verifies the new contact belongs to the same business
 */
export async function updateCorrespondenceContact(
  correspondenceId: string,
  newContactId: string
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    // Get the correspondence to find its business_id
    const { data: correspondence, error: fetchError } = await supabase
      .from('correspondence')
      .select('business_id')
      .eq('id', correspondenceId)
      .single()

    if (fetchError || !correspondence) {
      return { error: 'Correspondence not found' }
    }

    // Verify the new contact belongs to the same business
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, business_id')
      .eq('id', newContactId)
      .single()

    if (contactError || !contact) {
      return { error: 'Contact not found' }
    }

    if (contact.business_id !== correspondence.business_id) {
      return { error: 'Contact must belong to the same business' }
    }

    // Update the correspondence with the new contact_id
    const { error: updateError } = await supabase
      .from('correspondence')
      .update({
        contact_id: newContactId,
        edited_at: new Date().toISOString(),
        edited_by: user.id,
      })
      .eq('id', correspondenceId)

    if (updateError) {
      return { error: updateError.message }
    }

    revalidatePath(`/businesses/${correspondence.business_id}`)

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: errorMessage }
  }
}

/**
 * Check if correspondence with same content already exists for this business
 * Returns existing entry if duplicate found
 *
 * Checks both:
 * - Raw text hash (catches pasting same email twice)
 * - Formatted text match (catches copying from page display)
 */
export async function checkForDuplicates(
  rawText: string,
  businessId: string
): Promise<{ isDuplicate: boolean; existingEntry?: Correspondence }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { isDuplicate: false }
  }

  // Compute hash of pasted text
  const { data: contentHash, error: hashError } = await supabase.rpc('compute_content_hash', {
    raw_text: rawText,
  })

  if (hashError || !contentHash) {
    // If hash computation fails, allow save (fail gracefully)
    return { isDuplicate: false }
  }

  // First check: Does content_hash match any existing entry?
  const { data: existing, error } = await supabase
    .from('correspondence')
    .select('*, contact:contacts(name, role)')
    .eq('content_hash', contentHash)
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    // If query fails, allow save (fail gracefully)
    return { isDuplicate: false }
  }

  if (existing) {
    return {
      isDuplicate: true,
      existingEntry: existing as Correspondence,
    }
  }

  // Second check: SQL-level text comparison instead of fetching all rows
  // Catches when user copies from page display (formatted text matches raw paste)
  const normalizedPasted = rawText.trim().toLowerCase()
  const { data: textMatch } = await supabase
    .from('correspondence')
    .select('*, contact:contacts(name, role)')
    .eq('business_id', businessId)
    .or(`formatted_text_current.ilike.${normalizedPasted},formatted_text_original.ilike.${normalizedPasted}`)
    .limit(1)
    .maybeSingle()

  if (textMatch) {
    return {
      isDuplicate: true,
      existingEntry: textMatch as Correspondence,
    }
  }

  return { isDuplicate: false }
}

/**
 * Find duplicate correspondence entries within a business
 * Uses content_hash (SHA256) to identify entries with identical text
 * Excludes pairs that have been dismissed by users
 */
export async function findDuplicatesInBusiness(businessId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { duplicates: [] }
  }

  // Get recent correspondence with their hashes (limited to 500 for performance)
  // Duplicates are typically recent, so limiting to last 500 entries is acceptable
  const { data: entries } = await supabase
    .from('correspondence')
    .select('id, content_hash, subject, entry_date, contact:contacts(name)')
    .eq('business_id', businessId)
    .not('content_hash', 'is', null)
    .order('entry_date', { ascending: false })
    .limit(500)

  if (!entries) return { duplicates: [] }

  // Get dismissed pairs
  const { data: dismissals } = await supabase
    .from('duplicate_dismissals')
    .select('entry_id_1, entry_id_2')
    .eq('business_id', businessId)

  const dismissedPairs = new Set(
    (dismissals || []).map(d => [d.entry_id_1, d.entry_id_2].sort().join('|'))
  )

  // Group by content_hash to find duplicates
  const hashGroups = new Map<string, typeof entries>()
  for (const entry of entries) {
    if (!entry.content_hash) continue
    const existing = hashGroups.get(entry.content_hash) || []
    existing.push(entry)
    hashGroups.set(entry.content_hash, existing)
  }

  // Define the entry type for duplicate groups
  type DuplicateEntry = {
    id: string
    content_hash: string | null
    subject: string | null
    entry_date: string | null
    contact: { name: string } | null
  }

  // Filter to groups with 2+ entries, excluding dismissed pairs
  const duplicates: Array<{
    hash: string
    entries: DuplicateEntry[]
  }> = []

  for (const [hash, group] of hashGroups) {
    if (group.length < 2) continue

    // For groups with exactly 2 entries, check if this pair is dismissed
    if (group.length === 2) {
      const pairKey = [group[0].id, group[1].id].sort().join('|')
      if (dismissedPairs.has(pairKey)) continue
    }

    // Map entries to normalize the contact field (Supabase returns it as array)
    const normalizedEntries: DuplicateEntry[] = group.map(entry => ({
      id: entry.id,
      content_hash: entry.content_hash,
      subject: entry.subject,
      entry_date: entry.entry_date,
      contact: Array.isArray(entry.contact) ? entry.contact[0] || null : entry.contact
    }))

    // For groups with more than 2 entries, we show them all
    // (user would need to dismiss multiple pairs to hide them all)
    duplicates.push({
      hash,
      entries: normalizedEntries
    })
  }

  return { duplicates }
}

/**
 * Toggle is_pinned on a correspondence entry
 * Pinned entries appear at the top of each section
 */
export async function togglePinCorrespondence(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get current pin state
  const { data: entry } = await supabase
    .from('correspondence')
    .select('is_pinned, business_id')
    .eq('id', id)
    .single()

  if (!entry) {
    return { error: 'Entry not found' }
  }

  const { error } = await supabase
    .from('correspondence')
    .update({ is_pinned: !entry.is_pinned })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/businesses/${entry.business_id}`)
  return { success: true, is_pinned: !entry.is_pinned }
}

/**
 * Get all correspondence with due_at set (for reminders page)
 */
export async function getUpcomingReminders() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const { data, error } = await supabase
    .from('correspondence')
    .select(`
      id, business_id, contact_id, subject, type, direction, entry_date, due_at, action_needed,
      formatted_text_current,
      businesses!inner(id, name),
      contact:contacts(name, role)
    `)
    .eq('organization_id', organizationId)
    .not('due_at', 'is', null)
    .neq('action_needed', 'none')
    .order('due_at', { ascending: true })
    .limit(200)

  if (error) {
    return { error: error.message }
  }

  return { data: data || [] }
}

/**
 * Get all correspondence with action_needed != 'none' (for actions page)
 */
export async function getOutstandingActions() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const { data, error } = await supabase
    .from('correspondence')
    .select(`
      id, business_id, contact_id, subject, type, direction, entry_date, due_at, action_needed,
      formatted_text_current,
      businesses!inner(id, name),
      contact:contacts(name, role)
    `)
    .eq('organization_id', organizationId)
    .neq('action_needed', 'none')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('entry_date', { ascending: false })
    .limit(200)

  if (error) {
    return { error: error.message }
  }

  return { data: data || [] }
}

/**
 * Mark a correspondence entry as done (clears action_needed + due_at)
 */
export async function markCorrespondenceDone(id: string, resolution?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: entry } = await supabase
    .from('correspondence')
    .select('business_id, ai_metadata')
    .eq('id', id)
    .single()

  const updatePayload: Record<string, unknown> = {
    action_needed: 'none',
    due_at: null,
    reply_dismissed_at: new Date().toISOString(),
  }
  if (resolution) {
    const existingMeta = (entry?.ai_metadata as Record<string, unknown>) ?? {}
    updatePayload.ai_metadata = { ...existingMeta, resolution }
  }

  const { error } = await supabase
    .from('correspondence')
    .update(updatePayload)
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  if (entry) {
    revalidatePath(`/businesses/${entry.business_id}`)
  }
  revalidatePath('/actions')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function setCorrespondenceAction(id: string, actionNeeded: string, dueAt?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { data: entry } = await supabase.from('correspondence').select('business_id').eq('id', id).single()
  const update: Record<string, string | null> = { action_needed: actionNeeded }
  if (dueAt !== undefined) update.due_at = dueAt
  const { error } = await supabase.from('correspondence').update(update).eq('id', id).eq('organization_id', orgId)
  if (error) return { error: error.message }
  if (entry) revalidatePath(`/businesses/${entry.business_id}`)
  revalidatePath('/actions')
  return { success: true }
}

export async function snoozeCorrespondence(id: string, days: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }
  const { data: entry } = await supabase.from('correspondence').select('business_id').eq('id', id).single()
  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + days)
  const { error } = await supabase
    .from('correspondence')
    .update({ due_at: dueAt.toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  if (entry) revalidatePath(`/businesses/${entry.business_id}`)
  revalidatePath('/actions')
  return { success: true }
}

/**
 * Get received correspondence with no reply within 7 days (needs a reply).
 * Excludes entries where action_needed='waiting_on_them'.
 */
export async function getNeedsReply() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const oneYearAgo = new Date()
  oneYearAgo.setDate(oneYearAgo.getDate() - 365)

  const { data, error } = await supabase
    .from('correspondence')
    .select(`
      id, business_id, contact_id, subject, type, direction, entry_date, action_needed, due_at,
      formatted_text_current,
      businesses!inner(id, name),
      contact:contacts(name, role)
    `)
    .eq('organization_id', orgId)
    .gte('entry_date', oneYearAgo.toISOString())
    .is('reply_dismissed_at', null)
    .order('entry_date', { ascending: false })
    .limit(500)

  if (error) return { error: error.message }

  const entries = data || []

  // O(n) pre-pass: find latest non-received date per business
  const latestNonReceivedByBusiness = new Map<string, Date>()
  for (const entry of entries) {
    if (entry.direction === 'received' || !entry.entry_date) continue
    const d = new Date(entry.entry_date)
    const existing = latestNonReceivedByBusiness.get(entry.business_id)
    if (!existing || d > existing) latestNonReceivedByBusiness.set(entry.business_id, d)
  }

  const needsReply = entries.filter(entry => {
    if (entry.direction !== 'received') return false
    if (entry.action_needed === 'waiting_on_them') return false
    if (entry.due_at && new Date(entry.due_at) > new Date()) return false
    if (!entry.entry_date) return false
    const entryDate = new Date(entry.entry_date)
    const latestNonReceived = latestNonReceivedByBusiness.get(entry.business_id)
    return !latestNonReceived || latestNonReceived < entryDate
  })

  // Keep only the most recent unreplied received entry per business
  const seen = new Set<string>()
  const deduped = needsReply.filter(entry => {
    if (seen.has(entry.business_id)) return false
    seen.add(entry.business_id)
    return true
  })

  return { data: deduped }
}

/**
 * Get businesses gone quiet: last_contacted_at > 60 days ago AND at least 3 correspondence entries.
 */
export async function getGoneQuiet() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id, name, last_contacted_at,
      correspondence(count)
    `)
    .eq('organization_id', orgId)
    .lt('last_contacted_at', sixtyDaysAgo.toISOString())
    .not('last_contacted_at', 'is', null)
    .order('last_contacted_at', { ascending: true })
    .limit(100)

  if (error) return { error: error.message }

  const goneQuiet = (data || []).filter(biz => {
    const countArr = biz.correspondence as unknown as [{ count: number }]
    return (countArr?.[0]?.count ?? 0) >= 3
  })

  return { data: goneQuiet }
}

/**
 * Get correspondence entries with due_at set and action_needed='none' (pure reminders).
 */
export async function getPureReminders() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase
    .from('correspondence')
    .select(`
      id, business_id, contact_id, subject, type, direction, entry_date, due_at, action_needed,
      businesses!inner(id, name),
      contact:contacts(name, role)
    `)
    .eq('organization_id', orgId)
    .eq('action_needed', 'none')
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })
    .limit(200)

  if (error) return { error: error.message }
  return { data: data || [] }
}

// ---------------------------------------------------------------------------
// Open Threads — structural detection (pure JS, no AI)
// ---------------------------------------------------------------------------

export type OpenThread = {
  thread_type: 'sent_invoice' | 'received_commitment' | 'meeting_call_followup' | 'interest_signal'
  entry_id: string
  business_id: string
  business_name: string
  entry_date: string
  subject: string | null
  days_since: number
  snippet: string | null
}

function threadSnippet(text: string | null | undefined): string | null {
  if (!text) return null
  const stripped = text.replace(/\*\*|__|[_*#>`~]/g, '').replace(/\s+/g, ' ').trim()
  return stripped.length <= 120 ? stripped : stripped.slice(0, 120).replace(/\s\S*$/, '') + '…'
}

/**
 * Structural detection of open/unresolved threads — SQL RPC, no AI.
 * Detects 4 signal types across a 180-day window:
 *   1. sent_invoice           — sent invoice keywords, no payment confirmation received since
 *   2. received_commitment    — they promised to follow up, no sent reply since
 *   3. meeting_call_followup  — Meeting/Call with no subsequent sent entry
 *   4. interest_signal        — inbound enquiry/interest with no reply sent
 *
 * Only covers entries where action_needed='none'. Scoped to one business
 * via options.businessId, or all businesses in the org if omitted.
 */
export async function getOpenThreads(options?: { businessId?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { data, error } = await supabase.rpc('get_open_threads', {
    p_org_id:              orgId,
    p_business_id:         options?.businessId ?? null,
    p_tier1_financial:     TIER1_FINANCIAL,
    p_payment_resolution:  PAYMENT_RESOLUTION,
    p_tier2_commitments:   TIER2_RECEIVED_COMMITMENTS,
    p_tier2_interest:      TIER2_INTEREST_SIGNALS,
    p_commitment_patterns: COMMITMENT_REGEX_PATTERNS,
    p_interest_patterns:   INTEREST_REGEX_PATTERNS,
  })

  if (error) return { error: error.message }

  const openThreads: OpenThread[] = (data || []).map((row: {
    entry_id: string
    business_id: string
    business_name: string
    entry_date: string
    subject: string | null
    days_since: number
    snippet: string | null
    thread_type: string
  }) => ({
    thread_type: row.thread_type as OpenThread['thread_type'],
    entry_id:     row.entry_id,
    business_id:  row.business_id,
    business_name: row.business_name,
    entry_date:   row.entry_date,
    subject:      row.subject,
    days_since:   row.days_since,
    snippet:      threadSnippet(row.snippet),
  }))

  // Oldest first — most likely to be genuinely stale
  openThreads.sort((a, b) => b.days_since - a.days_since)

  return { data: openThreads }
}

/**
 * Structural promotion of open threads → action flags.
 * Called at filing time (after createCorrespondence), scoped to one business.
 *
 * Layer 1+2: SQL RPC — 4-signal keyword + regex detection, pure PostgreSQL, $0 cost.
 * Layer 3: Haiku fallback — fires on received entries that slipped past structural
 *           detection. Capped at 3 entries/filing. High-confidence only.
 *
 * Only promotes entries where action_needed = 'none' and reply_dismissed_at IS NULL.
 */
export async function promoteOpenThreadsToActions(orgId: string, businessId: string): Promise<number> {
  const supabase = await createClient()

  const { data: sqlCount, error } = await supabase.rpc('promote_open_threads_to_actions', {
    p_org_id: orgId,
    p_business_id: businessId,
    p_tier1_financial: TIER1_FINANCIAL,
    p_payment_resolution: PAYMENT_RESOLUTION,
    p_tier2_commitments: TIER2_RECEIVED_COMMITMENTS,
    p_tier2_interest: TIER2_INTEREST_SIGNALS,
    p_commitment_patterns: COMMITMENT_REGEX_PATTERNS,
    p_interest_patterns: INTEREST_REGEX_PATTERNS,
  })

  if (error) console.error('promoteOpenThreadsToActions RPC failed:', error.message)

  const rpcTotal = (sqlCount as number) ?? 0
  const haikuTotal = await _haikuFallbackCheck(orgId, businessId)
  const total = rpcTotal + haikuTotal

  if (total > 0) revalidatePath('/actions')
  return total
}

// Auto-reply / OOO phrases used to filter candidates in the Haiku fallback
const AUTO_REPLY_PHRASES = [
  'out of office', 'automatic reply', 'auto-reply', 'automated response',
  'this is an automated', 'do not reply to this', 'noreply', 'no-reply',
  'delivery failure', 'mail delivery', 'undeliverable',
]

/**
 * Layer 3: Haiku fallback for entries that slipped past all structural signals.
 *
 * Covers two pools:
 *   A) Received emails: 14–60d old, >100 chars, no sent reply since, not auto-reply
 *   B) Meeting/Call notes: 3–90d old, >100 chars, no follow-up since
 *
 * Both pools: action_needed = 'none', reply_dismissed_at IS NULL, due_at IS NULL
 * (snoozed/reminder entries are protected).
 *
 * All candidates are batched into a single Haiku call (one API round-trip).
 * Capped at 5 entries total. High-confidence results only.
 * Fire-and-forget safe — any error returns 0.
 */
async function _haikuFallbackCheck(orgId: string, businessId: string): Promise<number> {
  try {
    const supabase = await createClient()

    const cut60d = new Date(Date.now() - 60 * 86400000).toISOString()
    const cut14d = new Date(Date.now() - 14 * 86400000).toISOString()
    const cut90d = new Date(Date.now() - 90 * 86400000).toISOString()
    const cut3d  = new Date(Date.now() -  3 * 86400000).toISOString()

    // Fetch Pool A (received emails) and Pool B (Meeting/Call notes) in parallel
    const [{ data: poolA }, { data: poolB }] = await Promise.all([
      supabase
        .from('correspondence')
        .select('id, entry_date, formatted_text_current, subject, direction, type')
        .eq('organization_id', orgId)
        .eq('business_id', businessId)
        .eq('action_needed', 'none')
        .is('reply_dismissed_at', null)
        .is('due_at', null)
        .eq('direction', 'received')
        .gte('entry_date', cut60d)
        .lte('entry_date', cut14d)
        .order('entry_date', { ascending: false })
        .limit(8),
      supabase
        .from('correspondence')
        .select('id, entry_date, formatted_text_current, subject, direction, type')
        .eq('organization_id', orgId)
        .eq('business_id', businessId)
        .eq('action_needed', 'none')
        .is('reply_dismissed_at', null)
        .is('due_at', null)
        .in('type', ['Meeting', 'Call'])
        .gte('entry_date', cut90d)
        .lte('entry_date', cut3d)
        .order('entry_date', { ascending: false })
        .limit(5),
    ])

    // Fetch sent correspondence and follow-up entries for resolution checks
    const { data: sentEntries } = await supabase
      .from('correspondence')
      .select('entry_date, direction, type')
      .eq('organization_id', orgId)
      .eq('business_id', businessId)
      .gte('entry_date', cut90d)
      .order('entry_date', { ascending: true })

    const sentDates = (sentEntries || [])
      .filter(e => e.direction === 'sent')
      .map(e => new Date(e.entry_date).getTime())

    const followUpDates = (sentEntries || [])
      .filter(e => e.direction === 'sent' || e.type === 'Meeting' || e.type === 'Call')
      .map(e => new Date(e.entry_date).getTime())

    // Filter Pool A: substantial text, no auto-reply, no sent reply after
    const filteredA = (poolA || []).filter(c => {
      const text = (c.formatted_text_current || '')
      if (text.length <= 100) return false
      const lower = text.toLowerCase()
      if (AUTO_REPLY_PHRASES.some(p => lower.includes(p))) return false
      const entryTime = new Date(c.entry_date).getTime()
      return !sentDates.some(t => t > entryTime)
    })

    // Filter Pool B: substantial text, no follow-up (sent/meeting/call) after
    const filteredB = (poolB || []).filter(c => {
      if ((c.formatted_text_current || '').length <= 100) return false
      const entryTime = new Date(c.entry_date).getTime()
      return !followUpDates.some(t => t > entryTime)
    })

    // Most recent from each pool first; cap total at 5
    const candidates = [...filteredA.slice(0, 3), ...filteredB.slice(0, 2)]
    if (candidates.length === 0) return 0

    // Single batched Haiku call — one round-trip for all candidates
    const anthropic = getAnthropicClient()
    const entriesJson = candidates.map((c, i) => ({
      index: i,
      type: c.type || (c.direction === 'received' ? 'Email' : 'Note'),
      subject: c.subject || '(none)',
      text: (c.formatted_text_current || '').slice(0, 1200),
    }))

    const response = await anthropic.messages.create({
      model: AI_MODELS.ECONOMY,
      max_tokens: 300,
      system: `You are a correspondence assistant for a UK business relationship manager.
For each correspondence entry below, decide if a follow-up action is required.

Return a JSON array only — one object per entry, in the same order:
[{ "index": 0, "action": "waiting_on_them"|"prospect"|"invoice"|"none", "confidence": "high"|"low" }, ...]

Rules:
- "waiting_on_them": they committed to something (call back, send info, get approval) and haven't yet
- "prospect": they expressed genuine interest or made an enquiry about your services
- "invoice": meeting/call where money or a deal was discussed but no invoice sent yet
- "none": no follow-up needed (acknowledgement, thanks, general info only)
- Only use "high" confidence when you are very sure. When in doubt use "low".`,
      messages: [{
        role: 'user',
        content: JSON.stringify(entriesJson),
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    let results: Array<{ index: number; action: string; confidence: string }> = []
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      results = JSON.parse(cleaned)
    } catch {
      return 0
    }

    if (!Array.isArray(results)) return 0

    const dueAt = new Date()
    dueAt.setDate(dueAt.getDate() + 7)
    const dueAtStr = dueAt.toISOString().split('T')[0]

    let promoted = 0
    const validActions = new Set(['waiting_on_them', 'prospect', 'invoice'])

    for (const result of results) {
      if (
        typeof result.index !== 'number' ||
        result.confidence !== 'high' ||
        !validActions.has(result.action)
      ) continue

      const entry = candidates[result.index]
      if (!entry) continue

      const { error: uErr } = await supabase
        .from('correspondence')
        .update({ action_needed: result.action, due_at: dueAtStr, updated_at: new Date().toISOString() })
        .eq('id', entry.id)
        .eq('organization_id', orgId)
      if (!uErr) promoted++
    }

    return promoted
  } catch (err) {
    console.error('_haikuFallbackCheck failed:', err)
    return 0
  }
}

export async function getOutstandingActionsCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return 0
  const [flagged, reminders] = await Promise.all([
    supabase.from('correspondence').select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).neq('action_needed', 'none'),
    supabase.from('correspondence').select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('action_needed', 'none').not('due_at', 'is', null),
  ])
  return (flagged.count ?? 0) + (reminders.count ?? 0)
}

// Language in recent correspondence that signals a one-off arrangement — auto-suppresses renewal signal
const CONTRACT_DISMISSAL_KEYWORDS = [
  'one-off', 'one off', 'one time', 'one-time',
  "won't be renewing", 'will not be renewing', 'not renewing', 'not looking to renew',
  'not going to renew', 'not interested in renewing', 'decided not to renew',
  'short-term', 'short term', 'event only', 'no longer interested',
  "doesn't want to continue", 'does not want to continue',
]

export async function getContractExpiries() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(today.getDate() - 90)
  const in90Days = new Date(today)
  in90Days.setDate(today.getDate() + 90)

  // Include contract_renewal_type so we can filter one_off in JS.
  // Cannot use .not('contract_renewal_type', 'eq', 'one_off') at DB level —
  // PostgREST's != operator is NULL-unsafe, so it would exclude all rows where the
  // column is NULL (i.e. every business until explicitly set). JS filter is correct.
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, contract_end, contract_amount, contract_currency, contract_renewal_type')
    .eq('organization_id', orgId)
    .not('contract_end', 'is', null)
    .gte('contract_end', ninetyDaysAgo.toISOString().split('T')[0])
    .lte('contract_end', in90Days.toISOString().split('T')[0])
    .order('contract_end', { ascending: true })

  if (error) return { error: error.message }

  // Filter one_off contracts here — null and 'recurring' both surface normally
  const eligible = (data || []).filter(b => (b as Record<string, unknown>).contract_renewal_type !== 'one_off')
  if (eligible.length === 0) return { data: [] }

  // Fetch the most recent correspondence for each business (for snippet + dismissal auto-detection)
  const businessIds = eligible.map(b => b.id)
  const { data: corrData } = await supabase
    .from('correspondence')
    .select('business_id, entry_date, formatted_text_current')
    .in('business_id', businessIds)
    .eq('organization_id', orgId)
    .order('entry_date', { ascending: false })
    .limit(businessIds.length * 5)

  // Most recent correspondence per business (first occurrence wins — already sorted DESC)
  const latestByBusiness = new Map<string, { entry_date: string; formatted_text_current: string | null }>()
  for (const c of (corrData || [])) {
    if (!latestByBusiness.has(c.business_id)) {
      latestByBusiness.set(c.business_id, {
        entry_date: c.entry_date,
        formatted_text_current: c.formatted_text_current,
      })
    }
  }

  // Auto-detect one-off language in the most recent entry for each business
  const detectedOneOff: string[] = []
  for (const b of eligible) {
    const latest = latestByBusiness.get(b.id)
    if (!latest?.formatted_text_current) continue
    const text = latest.formatted_text_current.toLowerCase()
    if (CONTRACT_DISMISSAL_KEYWORDS.some(kw => text.includes(kw))) {
      detectedOneOff.push(b.id)
    }
  }

  // Silently persist auto-detected one-off businesses (idempotent, fire-and-forget)
  if (detectedOneOff.length > 0) {
    void (async () => {
      const { error: uErr } = await supabase
        .from('businesses')
        .update({ contract_renewal_type: 'one_off' })
        .in('id', detectedOneOff)
        .eq('organization_id', orgId)
      if (uErr) console.error('Auto-detect one_off update failed:', uErr.message)
    })()
  }

  const detectedSet = new Set(detectedOneOff)

  const results = eligible
    .filter(b => !detectedSet.has(b.id))
    .map(b => {
      const latest = latestByBusiness.get(b.id)
      const raw = latest?.formatted_text_current
      const snippet = raw
        ? raw.replace(/\*\*|__|[_*#>`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100).replace(/\s\S*$/, (s) => s.length > 1 ? '…' : s)
        : null
      return {
        ...b,
        last_correspondence_date: latest?.entry_date ?? null,
        last_correspondence_snippet: snippet,
      }
    })

  return { data: results }
}
