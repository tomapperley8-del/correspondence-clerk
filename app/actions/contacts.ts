'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { z } from 'zod'
import { parseJsonArray } from '@/lib/validation'

const emailSchema = z.string().email('Invalid email format').max(254)

const createContactSchema = z.object({
  business_id: z.string().uuid('Invalid business ID'),
  name: z.string().min(1, 'Contact name is required').max(200, 'Contact name too long'),
  role: z.string().max(200).optional(),
  emails: z.array(emailSchema.or(z.literal(''))).optional(),
  phones: z.array(z.string().max(50)).optional(),
  notes: z.string().max(5000).optional(),
})

const updateContactSchema = z.object({
  name: z.string().min(1, 'Contact name is required').max(200).optional(),
  role: z.string().max(200).optional(),
  emails: z.array(emailSchema.or(z.literal(''))).optional(),
  phones: z.array(z.string().max(50)).optional(),
  notes: z.string().max(5000).optional(),
  is_active: z.boolean().optional(),
  route_to_inbox: z.boolean().optional(),
})

export type Contact = {
  id: string
  business_id: string
  name: string
  normalized_email: string | null
  role: string | null
  emails: string[]
  phones: string[]
  notes: string | null
  is_active: boolean
  route_to_inbox: boolean
  organization_id: string
  created_at: string
  updated_at: string
}

export async function getHasAnyContact(): Promise<boolean> {
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) return false
  const supabase = await createClient()
  const { count } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .limit(1)
  return (count ?? 0) > 0
}

export async function getContactsByBusiness(businessId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  // Select specific columns needed (avoids SELECT * overhead)
  const { data, error } = await supabase
    .from('contacts')
    .select('id, business_id, name, normalized_email, role, emails, phones, notes, is_active, route_to_inbox, organization_id, created_at, updated_at')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .order('is_active', { ascending: false }) // active contacts first
    .order('name', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields
  const parsedData = data?.map(contact => ({
    ...contact,
    emails: parseJsonArray(contact.emails),
    phones: parseJsonArray(contact.phones),
    is_active: contact.is_active ?? true,
    route_to_inbox: contact.route_to_inbox ?? false,
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

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  // Select specific columns needed (avoids SELECT * overhead)
  const { data, error } = await supabase
    .from('contacts')
    .select('id, business_id, name, normalized_email, role, emails, phones, notes, is_active, route_to_inbox, organization_id, created_at, updated_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields
  const parsedData = {
    ...data,
    emails: parseJsonArray(data.emails),
    phones: parseJsonArray(data.phones),
    is_active: data.is_active ?? true,
    route_to_inbox: data.route_to_inbox ?? false,
  }

  return { data: parsedData }
}

export async function createContact(formData: {
  business_id: string
  name: string
  role?: string
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

  const emailsArray = (formData.emails ?? []).map(e => e.trim().toLowerCase()).filter(e => e)
  const phonesArray = (formData.phones ?? []).map(p => p.trim()).filter(p => p)
  const normalized_email = emailsArray[0] ?? null

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      business_id: formData.business_id,
      name: formData.name.trim(),
      normalized_email,
      role: formData.role?.trim() || null,
      emails: emailsArray,
      phones: phonesArray,
      notes: formData.notes?.trim() || null,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields before returning
  const parsedData = {
    ...data,
    emails: parseJsonArray(data.emails),
    phones: parseJsonArray(data.phones),
  }

  revalidatePath(`/businesses/${formData.business_id}`)
  return { data: parsedData }
}

export async function updateContact(
  id: string,
  formData: {
    name?: string
    role?: string
    emails?: string[]
    phones?: string[]
    notes?: string
    is_active?: boolean
    route_to_inbox?: boolean
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

  if (formData.emails !== undefined) {
    const emailsArray = formData.emails.map(e => e.trim().toLowerCase()).filter(e => e)
    updateData.emails = emailsArray
    updateData.normalized_email = emailsArray[0] || null
  }

  if (formData.phones !== undefined) {
    updateData.phones = formData.phones.map(p => p.trim()).filter(p => p)
  }

  if (formData.role !== undefined) updateData.role = formData.role?.trim() || null
  if (formData.notes !== undefined) updateData.notes = formData.notes?.trim() || null
  if (formData.is_active !== undefined) updateData.is_active = formData.is_active
  if (formData.route_to_inbox !== undefined) updateData.route_to_inbox = formData.route_to_inbox

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Parse JSONB fields before returning
  const parsedData = {
    ...data,
    emails: parseJsonArray(data.emails),
    phones: parseJsonArray(data.phones),
  }

  // Get business_id to revalidate the business page (data already has it from the update select)
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

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  // Get contact details before deleting
  const { data: contact } = await supabase
    .from('contacts')
    .select('business_id, name')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (!contact) {
    return { error: 'Contact not found' }
  }

  // Check if contact is referenced in any correspondence (as primary, CC, or BCC)
  // Combined into single query for performance (3x fewer round-trips)
  const { count: usageCount, error: usageError } = await supabase
    .from('correspondence')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', contact.business_id)
    .or(`contact_id.eq.${id},cc_contact_ids.cs.{${id}},bcc_contact_ids.cs.{${id}}`)

  if (usageError) {
    return { error: usageError.message }
  }

  if (usageCount && usageCount > 0) {
    return {
      error: `Cannot delete "${contact.name}" because they are referenced in ${usageCount} correspondence ${usageCount === 1 ? 'entry' : 'entries'}. Please reassign or delete those entries first.`
    }
  }

  const { error } = await supabase.from('contacts').delete().eq('id', id).eq('organization_id', orgId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/businesses/${contact.business_id}`)

  return { success: true }
}
