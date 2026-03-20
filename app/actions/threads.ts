'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type ConversationThread = {
  id: string
  business_id: string
  organization_id: string | null
  name: string
  created_at: string
}

export async function getThreadsByBusiness(businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('conversation_threads')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message }
  return { data: data as ConversationThread[] }
}

export async function createThread(businessId: string, name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('conversation_threads')
    .insert({
      business_id: businessId,
      organization_id: orgId,
      name: name.trim(),
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { data: data as ConversationThread }
}

export async function renameThread(threadId: string, businessId: string, name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('conversation_threads')
    .update({ name: name.trim() })
    .eq('id', threadId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { data: data as ConversationThread }
}

export async function deleteThread(threadId: string, businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // thread_id on correspondence will be set to NULL automatically (ON DELETE SET NULL)
  const { error } = await supabase
    .from('conversation_threads')
    .delete()
    .eq('id', threadId)

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { success: true }
}

export async function assignCorrespondenceToThread(correspondenceId: string, threadId: string | null, businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('correspondence')
    .update({ thread_id: threadId })
    .eq('id', correspondenceId)

  if (error) return { error: error.message }
  revalidatePath(`/businesses/${businessId}`)
  return { success: true }
}
