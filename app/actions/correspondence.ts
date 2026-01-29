'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'

const createCorrespondenceSchema = z.object({
  business_id: z.string().uuid('Invalid business ID'),
  contact_id: z.string().uuid('Invalid contact ID'),
  cc_contact_ids: z.array(z.string().uuid('Invalid CC contact ID')).optional(),
  bcc_contact_ids: z.array(z.string().uuid('Invalid BCC contact ID')).optional(),
  raw_text_original: z.string().min(1, 'Correspondence text is required').max(100000, 'Text too long'),
  entry_date: z.string().optional(),
  subject: z.string().max(500).optional(),
  type: z.enum(['Email', 'Call', 'Meeting']).optional(),
  direction: z.enum(['received', 'sent']).optional(),
  action_needed: z.enum(['none', 'prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal']).optional(),
  due_at: z.string().optional(),
  ai_metadata: z.record(z.string(), z.unknown()).optional(),
})

export type Correspondence = {
  id: string
  business_id: string
  contact_id: string
  cc_contact_ids: string[] | null
  bcc_contact_ids: string[] | null
  user_id: string
  raw_text_original: string
  formatted_text_original: string | null
  formatted_text_current: string | null
  entry_date: string | null
  subject: string | null
  type: 'Email' | 'Call' | 'Meeting' | null
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
  contact: {
    name: string
    role: string | null
  }
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
  limit: number = 20,
  offset: number = 0
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error, count } = await supabase
    .from('correspondence')
    .select(
      `
      *,
      contact:contacts(name, role)
    `,
      { count: 'exact' }
    )
    .eq('business_id', businessId)
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
      data.forEach((entry) => {
        if (entry.cc_contact_ids && Array.isArray(entry.cc_contact_ids)) {
          entry.cc_contacts = entry.cc_contact_ids
            .map((id: string) => contactMap.get(id))
            .filter(Boolean)
        } else {
          entry.cc_contacts = []
        }
        if (entry.bcc_contact_ids && Array.isArray(entry.bcc_contact_ids)) {
          entry.bcc_contacts = entry.bcc_contact_ids
            .map((id: string) => contactMap.get(id))
            .filter(Boolean)
        } else {
          entry.bcc_contacts = []
        }
      })
    }
  }

  return { data, count }
}

export async function createCorrespondence(formData: {
  business_id: string
  contact_id: string
  cc_contact_ids?: string[]
  bcc_contact_ids?: string[]
  raw_text_original: string
  entry_date?: string
  subject?: string
  type?: 'Email' | 'Call' | 'Meeting'
  direction?: 'received' | 'sent'
  action_needed?: 'none' | 'prospect' | 'follow_up' | 'waiting_on_them' | 'invoice' | 'renewal'
  due_at?: string
  ai_metadata?: Record<string, unknown>
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

  const { data, error } = await supabase
    .from('correspondence')
    .insert({
      business_id: formData.business_id,
      contact_id: formData.contact_id,
      cc_contact_ids: formData.cc_contact_ids || [],
      bcc_contact_ids: formData.bcc_contact_ids || [],
      user_id: user.id,
      raw_text_original: formData.raw_text_original,
      entry_date: formData.entry_date || new Date().toISOString(),
      subject: formData.subject || null,
      type: formData.type || null,
      direction: formData.direction || null,
      action_needed: formData.action_needed || 'none',
      due_at: formData.due_at || null,
      ai_metadata: formData.ai_metadata || null,
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

  return { data }
}

/**
 * Update formatted_text_current for manual corrections
 * Per CLAUDE.md: Edits are human corrections, never AI rewrites
 * Preserves raw_text_original and formatted_text_original
 */
export async function updateFormattedText(
  correspondenceId: string,
  formattedTextCurrent: string,
  entryDate?: string | null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const updateData: {
    formatted_text_current: string
    edited_at: string
    edited_by: string
    entry_date?: string | null
  } = {
    formatted_text_current: formattedTextCurrent,
    edited_at: new Date().toISOString(),
    edited_by: user.id,
  }

  // Only update entry_date if explicitly provided
  if (entryDate !== undefined) {
    updateData.entry_date = entryDate
  }

  const { data, error } = await supabase
    .from('correspondence')
    .update(updateData)
    .eq('id', correspondenceId)
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
 * Update correspondence direction
 * Per user request: keep detection logic but allow manual correction
 */
export async function updateCorrespondenceDirection(
  correspondenceId: string,
  direction: 'received' | 'sent' | null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    // Update direction and edited metadata
    const { error: updateError } = await supabase
      .from('correspondence')
      .update({
        direction: direction,
        edited_at: new Date().toISOString(),
        edited_by: user.id,
      })
      .eq('id', correspondenceId)

    if (updateError) {
      return { error: updateError.message }
    }

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: errorMessage }
  }
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

  // Get business_id before deleting
  const { data: entry } = await supabase
    .from('correspondence')
    .select('business_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('correspondence').delete().eq('id', id)

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
