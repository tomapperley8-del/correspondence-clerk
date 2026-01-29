'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'

const emailSchema = z.string().email('Invalid email format').max(254)

const createContactSchema = z.object({
  business_id: z.string().uuid('Invalid business ID'),
  name: z.string().min(1, 'Contact name is required').max(200, 'Contact name too long'),
  email: z.string().email('Invalid email format').max(254).or(z.literal('')).optional(),
  role: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  emails: z.array(emailSchema.or(z.literal(''))).optional(),
  phones: z.array(z.string().max(50)).optional(),
  notes: z.string().max(5000).optional(),
})

const updateContactSchema = z.object({
  name: z.string().min(1, 'Contact name is required').max(200).optional(),
  email: z.string().email('Invalid email format').max(254).or(z.literal('')).optional(),
  role: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  emails: z.array(emailSchema.or(z.literal(''))).optional(),
  phones: z.array(z.string().max(50)).optional(),
  notes: z.string().max(5000).optional(),
})

export type Contact = {
  id: string
  business_id: string
  name: string
  email: string | null // Deprecated: use emails array
  normalized_email: string | null
  role: string | null
  phone: string | null // Deprecated: use phones array
  emails: string[]
  phones: string[]
  notes: string | null
  organization_id: string
  created_at: string
  updated_at: string
}

export async function getContactsByBusiness(businessId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('business_id', businessId)
    .order('name', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields
  const parsedData = data?.map(contact => ({
    ...contact,
    emails: typeof contact.emails === 'string' ? JSON.parse(contact.emails) : (contact.emails || []),
    phones: typeof contact.phones === 'string' ? JSON.parse(contact.phones) : (contact.phones || []),
  })) || []

  return { data: parsedData }
}

export async function getContactById(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields
  const parsedData = {
    ...data,
    emails: typeof data.emails === 'string' ? JSON.parse(data.emails) : (data.emails || []),
    phones: typeof data.phones === 'string' ? JSON.parse(data.phones) : (data.phones || []),
  }

  return { data: parsedData }
}

export async function createContact(formData: {
  business_id: string
  name: string
  email?: string
  role?: string
  phone?: string
  emails?: string[]
  phones?: string[]
  notes?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Validate input
  const parsed = createContactSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Get user's organization
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  // Use new emails/phones arrays if provided, otherwise fall back to single values
  const emailsArray = formData.emails && formData.emails.length > 0
    ? formData.emails.map(e => e.trim()).filter(e => e)
    : formData.email ? [formData.email.trim()] : []

  const phonesArray = formData.phones && formData.phones.length > 0
    ? formData.phones.map(p => p.trim()).filter(p => p)
    : formData.phone ? [formData.phone.trim()] : []

  // Keep first email for backward compatibility with old normalized_email field
  const normalized_email = emailsArray.length > 0
    ? emailsArray[0].toLowerCase().trim()
    : null

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      business_id: formData.business_id,
      name: formData.name.trim(),
      email: emailsArray[0] || null, // Keep for backward compatibility
      normalized_email,
      role: formData.role?.trim() || null,
      phone: phonesArray[0] || null, // Keep for backward compatibility
      emails: JSON.stringify(emailsArray),
      phones: JSON.stringify(phonesArray),
      notes: formData.notes?.trim() || null,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Unique violation
      return { error: 'A contact with this email already exists for this business' }
    }
    return { error: error.message }
  }

  // Parse JSONB fields before returning
  const parsedData = {
    ...data,
    emails: typeof data.emails === 'string' ? JSON.parse(data.emails) : (data.emails || []),
    phones: typeof data.phones === 'string' ? JSON.parse(data.phones) : (data.phones || []),
  }

  revalidatePath(`/businesses/${formData.business_id}`)
  return { data: parsedData }
}

export async function updateContact(
  id: string,
  formData: {
    name?: string
    email?: string
    role?: string
    phone?: string
    emails?: string[]
    phones?: string[]
    notes?: string
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Validate input
  const parsed = updateContactSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const updateData: Record<string, unknown> = {}

  if (formData.name !== undefined) updateData.name = formData.name.trim()

  // Handle emails array
  if (formData.emails !== undefined) {
    const emailsArray = formData.emails.map(e => e.trim()).filter(e => e)
    updateData.emails = JSON.stringify(emailsArray)
    // Update backward compatibility fields
    updateData.email = emailsArray[0] || null
    updateData.normalized_email = emailsArray[0] ? emailsArray[0].toLowerCase().trim() : null
  } else if (formData.email !== undefined) {
    // Fallback for old single email interface
    updateData.email = formData.email?.trim() || null
    updateData.normalized_email = formData.email ? formData.email.toLowerCase().trim() : null
    updateData.emails = formData.email ? JSON.stringify([formData.email.trim()]) : JSON.stringify([])
  }

  // Handle phones array
  if (formData.phones !== undefined) {
    const phonesArray = formData.phones.map(p => p.trim()).filter(p => p)
    updateData.phones = JSON.stringify(phonesArray)
    // Update backward compatibility field
    updateData.phone = phonesArray[0] || null
  } else if (formData.phone !== undefined) {
    // Fallback for old single phone interface
    updateData.phone = formData.phone?.trim() || null
    updateData.phones = formData.phone ? JSON.stringify([formData.phone.trim()]) : JSON.stringify([])
  }

  if (formData.role !== undefined) updateData.role = formData.role?.trim() || null
  if (formData.notes !== undefined) updateData.notes = formData.notes?.trim() || null

  const { data, error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields before returning
  const parsedData = {
    ...data,
    emails: typeof data.emails === 'string' ? JSON.parse(data.emails) : (data.emails || []),
    phones: typeof data.phones === 'string' ? JSON.parse(data.phones) : (data.phones || []),
  }

  // Get business_id to revalidate the business page
  const { data: contact } = await supabase
    .from('contacts')
    .select('business_id')
    .eq('id', id)
    .single()

  if (contact) {
    revalidatePath(`/businesses/${contact.business_id}`)
  }

  return { data: parsedData }
}

export async function deleteContact(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get contact details before deleting
  const { data: contact } = await supabase
    .from('contacts')
    .select('business_id, name')
    .eq('id', id)
    .single()

  if (!contact) {
    return { error: 'Contact not found' }
  }

  // Check if contact has any correspondence entries
  const { count: correspondenceCount } = await supabase
    .from('correspondence')
    .select('*', { count: 'exact', head: true })
    .eq('contact_id', id)

  if (correspondenceCount && correspondenceCount > 0) {
    return {
      error: `Cannot delete "${contact.name}" because they have ${correspondenceCount} correspondence ${correspondenceCount === 1 ? 'entry' : 'entries'}. Please reassign or delete those entries first.`
    }
  }

  // Also check if contact is used as CC in any correspondence
  const { data: ccUsage } = await supabase
    .from('correspondence')
    .select('id')
    .contains('cc_contact_ids', [id])
    .limit(1)

  if (ccUsage && ccUsage.length > 0) {
    return {
      error: `Cannot delete "${contact.name}" because they are CC'd on correspondence entries. Please remove them from CC first.`
    }
  }

  const { error } = await supabase.from('contacts').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/businesses/${contact.business_id}`)

  return { success: true }
}
