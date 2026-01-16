'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Contact = {
  id: string
  business_id: string
  name: string
  email: string | null
  normalized_email: string | null
  role: string | null
  phone: string | null
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

  return { data }
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

  return { data }
}

export async function createContact(formData: {
  business_id: string
  name: string
  email?: string
  role?: string
  phone?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Normalize email for uniqueness check
  const normalized_email = formData.email
    ? formData.email.toLowerCase().trim()
    : null

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      business_id: formData.business_id,
      name: formData.name.trim(),
      email: formData.email?.trim() || null,
      normalized_email,
      role: formData.role?.trim() || null,
      phone: formData.phone?.trim() || null,
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

  revalidatePath(`/businesses/${formData.business_id}`)
  return { data }
}

export async function updateContact(
  id: string,
  formData: {
    name?: string
    email?: string
    role?: string
    phone?: string
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
  if (formData.email !== undefined) {
    updateData.email = formData.email?.trim() || null
    updateData.normalized_email = formData.email
      ? formData.email.toLowerCase().trim()
      : null
  }
  if (formData.role !== undefined) updateData.role = formData.role?.trim() || null
  if (formData.phone !== undefined) updateData.phone = formData.phone?.trim() || null

  const { data, error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
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

  return { data }
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
