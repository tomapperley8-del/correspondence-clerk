'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'
import { checkAndResolveActions } from '@/lib/ai/action-resolution'
import { detectTier1Action, detectPaymentResolution, TIER1_FINANCIAL, PAYMENT_RESOLUTION, TIER2_RECEIVED_COMMITMENTS, TIER2_INTEREST_SIGNALS } from '@/lib/ai/keyword-detection'

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
  const [actionsResolved] = await Promise.all([
    checkAndResolveActions(
      organizationId,
      formData.business_id,
      formData.raw_text_original,
      formData.subject ?? null
    ).catch(err => { console.error('Action resolution check failed:', err); return 0 }),
    promoteOpenThreadsToActions(organizationId, formData.business_id)
      .catch(err => { console.error('promoteOpenThreadsToActions failed:', err); return 0 }),
  ])

  return { data, actionsResolved }
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
 * Structural detection of open/unresolved threads — no AI, pure JS.
 * Detects 4 signal types across a 180-day window:
 *   1. sent_invoice           — Tom sent invoice keywords, no payment confirmation received since
 *   2. received_commitment    — They promised to follow up, no sent reply from Tom since
 *   3. meeting_call_followup  — Meeting/Call with no subsequent sent entry
 *   4. interest_signal        — Inbound enquiry/interest with no reply sent
 *
 * Only covers entries where action_needed='none' (already-flagged records handled by Actions page).
 * Optionally scoped to one business via options.businessId.
 */
export async function getOpenThreads(options?: { businessId?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const window180dAgo = new Date(Date.now() - 180 * 86400000)

  let query = supabase
    .from('correspondence')
    .select('id, business_id, direction, type, entry_date, action_needed, subject, formatted_text_current, businesses!inner(id, name)')
    .eq('organization_id', orgId)
    .gte('entry_date', window180dAgo.toISOString())
    .order('entry_date', { ascending: true })
    .limit(2000)

  if (options?.businessId) {
    query = query.eq('business_id', options.businessId)
  }

  const { data: rawData, error: rawError } = await query
  if (rawError) return { error: rawError.message }

  const entries = rawData || []
  const now = Date.now()

  // Group by business
  const byBusiness = new Map<string, typeof entries>()
  for (const e of entries) {
    const arr = byBusiness.get(e.business_id) || []
    arr.push(e)
    byBusiness.set(e.business_id, arr)
  }

  const openThreads: OpenThread[] = []

  for (const bizEntries of byBusiness.values()) {
    const bizRaw = bizEntries[0].businesses as unknown as { id: string; name: string } | { id: string; name: string }[] | null
    const bizInfo = Array.isArray(bizRaw) ? bizRaw[0] : bizRaw
    const businessName = bizInfo?.name ?? ''
    const businessId = bizEntries[0].business_id

    for (const entry of bizEntries) {
      if (!entry.entry_date) continue
      // Skip entries already flagged — open threads only surfaces missed detections
      if (entry.action_needed !== 'none') continue

      const entryDate = new Date(entry.entry_date)
      const daysSince = Math.floor((now - entryDate.getTime()) / 86400000)
      const text = (entry.formatted_text_current || '').toLowerCase()

      // All entries filed after this one for the same business
      const later = bizEntries.filter(e => e.entry_date && new Date(e.entry_date) > entryDate)

      // --- Signal 1: Sent invoice/payment terms, no payment confirmation received (14–180d) ---
      if (entry.direction === 'sent' && daysSince >= 14 && daysSince <= 180) {
        const hasFinancial = TIER1_FINANCIAL.some(kw => text.includes(kw))
        if (hasFinancial) {
          const paymentReceived = later.some(e => {
            if (e.direction !== 'received') return false
            const t = (e.formatted_text_current || '').toLowerCase()
            return PAYMENT_RESOLUTION.some(p => t.includes(p))
          })
          if (!paymentReceived) {
            openThreads.push({
              thread_type: 'sent_invoice',
              entry_id: entry.id,
              business_id: businessId,
              business_name: businessName,
              entry_date: entry.entry_date,
              subject: entry.subject,
              days_since: daysSince,
              snippet: threadSnippet(entry.formatted_text_current),
            })
            continue
          }
        }
      }

      // --- Signal 2: They committed to follow up, no sent reply from Tom (7–60d) ---
      if (entry.direction === 'received' && daysSince >= 7 && daysSince <= 60) {
        const hasCommitment = TIER2_RECEIVED_COMMITMENTS.some(kw => text.includes(kw))
        if (hasCommitment) {
          const hasSentReply = later.some(e => e.direction === 'sent')
          if (!hasSentReply) {
            openThreads.push({
              thread_type: 'received_commitment',
              entry_id: entry.id,
              business_id: businessId,
              business_name: businessName,
              entry_date: entry.entry_date,
              subject: entry.subject,
              days_since: daysSince,
              snippet: threadSnippet(entry.formatted_text_current),
            })
            continue
          }
        }
      }

      // --- Signal 3: Meeting/Call with no subsequent sent entry or further meeting (3–90d) ---
      if ((entry.type === 'Meeting' || entry.type === 'Call') && daysSince >= 3 && daysSince <= 90) {
        const hasFollowUp = later.some(e => e.direction === 'sent' || e.type === 'Meeting' || e.type === 'Call')
        if (!hasFollowUp) {
          openThreads.push({
            thread_type: 'meeting_call_followup',
            entry_id: entry.id,
            business_id: businessId,
            business_name: businessName,
            entry_date: entry.entry_date,
            subject: entry.subject,
            days_since: daysSince,
            snippet: threadSnippet(entry.formatted_text_current),
          })
          continue
        }
      }

      // --- Signal 4: Inbound enquiry/interest signal, no reply sent (7–60d) ---
      if (entry.direction === 'received' && daysSince >= 7 && daysSince <= 60) {
        const hasInterest = TIER2_INTEREST_SIGNALS.some(kw => text.includes(kw))
        if (hasInterest) {
          const hasSentReply = later.some(e => e.direction === 'sent')
          if (!hasSentReply) {
            openThreads.push({
              thread_type: 'interest_signal',
              entry_id: entry.id,
              business_id: businessId,
              business_name: businessName,
              entry_date: entry.entry_date,
              subject: entry.subject,
              days_since: daysSince,
              snippet: threadSnippet(entry.formatted_text_current),
            })
          }
        }
      }
    }
  }

  // Oldest first — most likely to be genuinely stale
  openThreads.sort((a, b) => b.days_since - a.days_since)

  return { data: openThreads }
}

/**
 * Structural promotion of open threads → action flags.
 * Called at filing time (after createCorrespondence), scoped to one business.
 * Reuses the same 4-signal detection logic as getOpenThreads() but UPDATEs rows
 * instead of returning them. Pure SQL — no AI calls, $0 cost.
 *
 * Only promotes entries where action_needed = 'none' and reply_dismissed_at IS NULL.
 */
export async function promoteOpenThreadsToActions(orgId: string, businessId: string): Promise<number> {
  const supabase = await createClient()

  const window180dAgo = new Date(Date.now() - 180 * 86400000)
  const { data: rawEntries, error } = await supabase
    .from('correspondence')
    .select('id, direction, type, entry_date, action_needed, reply_dismissed_at, formatted_text_current')
    .eq('organization_id', orgId)
    .eq('business_id', businessId)
    .eq('action_needed', 'none')
    .is('reply_dismissed_at', null)
    .gte('entry_date', window180dAgo.toISOString())
    .order('entry_date', { ascending: true })

  if (error || !rawEntries || rawEntries.length === 0) return 0

  const now = Date.now()
  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + 7)
  const dueAtStr = dueAt.toISOString().split('T')[0]

  // Collect promotion decisions: { id, action_needed }
  const toPromote: Array<{ id: string; action_needed: string }> = []

  for (const entry of rawEntries) {
    if (!entry.entry_date) continue

    const entryDate = new Date(entry.entry_date)
    const daysSince = Math.floor((now - entryDate.getTime()) / 86400000)
    const text = (entry.formatted_text_current || '').toLowerCase()

    // All entries filed after this one for the same business (within the fetched window)
    const later = rawEntries.filter(e => e.entry_date && new Date(e.entry_date) > entryDate)

    // Signal 1: Sent invoice/payment terms, no payment confirmation received (14–180d)
    if (entry.direction === 'sent' && daysSince >= 14 && daysSince <= 180) {
      const hasFinancial = TIER1_FINANCIAL.some(kw => text.includes(kw))
      if (hasFinancial) {
        const paymentReceived = later.some(e => {
          if (e.direction !== 'received') return false
          const t = (e.formatted_text_current || '').toLowerCase()
          return PAYMENT_RESOLUTION.some(p => t.includes(p))
        })
        if (!paymentReceived) {
          toPromote.push({ id: entry.id, action_needed: 'waiting_on_them' })
          continue
        }
      }
    }

    // Signal 2: They committed to follow up, no sent reply from Tom (7–60d)
    if (entry.direction === 'received' && daysSince >= 7 && daysSince <= 60) {
      const hasCommitment = TIER2_RECEIVED_COMMITMENTS.some(kw => text.includes(kw))
      if (hasCommitment) {
        const hasSentReply = later.some(e => e.direction === 'sent')
        if (!hasSentReply) {
          toPromote.push({ id: entry.id, action_needed: 'waiting_on_them' })
          continue
        }
      }
    }

    // Signal 3: Meeting/Call with financial/commitment keywords + no follow-up (3–90d)
    if ((entry.type === 'Meeting' || entry.type === 'Call') && daysSince >= 3 && daysSince <= 90) {
      const hasKeywords = TIER1_FINANCIAL.some(kw => text.includes(kw)) ||
        TIER2_RECEIVED_COMMITMENTS.some(kw => text.includes(kw))
      if (hasKeywords) {
        const hasFollowUp = later.some(e => e.direction === 'sent' || e.type === 'Meeting' || e.type === 'Call')
        if (!hasFollowUp) {
          toPromote.push({ id: entry.id, action_needed: 'invoice' })
          continue
        }
      }
    }

    // Signal 4: Inbound interest/enquiry, no reply sent (7–60d)
    if (entry.direction === 'received' && daysSince >= 7 && daysSince <= 60) {
      const hasInterest = TIER2_INTEREST_SIGNALS.some(kw => text.includes(kw))
      if (hasInterest) {
        const hasSentReply = later.some(e => e.direction === 'sent')
        if (!hasSentReply) {
          toPromote.push({ id: entry.id, action_needed: 'prospect' })
        }
      }
    }
  }

  if (toPromote.length === 0) return 0

  // Batch updates grouped by action type
  const byAction = new Map<string, string[]>()
  for (const p of toPromote) {
    const ids = byAction.get(p.action_needed) || []
    ids.push(p.id)
    byAction.set(p.action_needed, ids)
  }

  for (const [actionNeeded, ids] of byAction) {
    await supabase
      .from('correspondence')
      .update({ action_needed: actionNeeded, due_at: dueAtStr })
      .in('id', ids)
      .eq('organization_id', orgId)
  }

  revalidatePath('/actions')
  return toPromote.length
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

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, contract_end, contract_amount, contract_currency')
    .eq('organization_id', orgId)
    .not('contract_end', 'is', null)
    .not('contract_renewal_type', 'eq', 'one_off')
    .gte('contract_end', ninetyDaysAgo.toISOString().split('T')[0])
    .lte('contract_end', in90Days.toISOString().split('T')[0])
    .order('contract_end', { ascending: true })

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { data: [] }

  // Fetch the most recent correspondence for each business (for snippet + dismissal auto-detection)
  const businessIds = data.map(b => b.id)
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
  for (const b of data) {
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

  const results = data
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
