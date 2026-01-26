'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

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

  const updateData: any = {}

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

  // Get business_id before deleting
  const { data: contact } = await supabase
    .from('contacts')
    .select('business_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('contacts').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  if (contact) {
    revalidatePath(`/businesses/${contact.business_id}`)
  }

  return { success: true }
}
