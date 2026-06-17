'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type Task = {
  id: string
  organization_id: string
  title: string
  notes: string | null
  due_date: string | null
  status: 'open' | 'done'
  is_priority: boolean
  category: 'work' | 'personal'
  source: 'manual' | 'contract_renewal' | 'follow_up'
  business_id: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
  business?: { id: string; name: string } | null
}

export async function getTasks(): Promise<{ data?: Task[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('tasks')
    .select('*, business:businesses!tasks_business_id_fkey(id, name)')
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data as Task[] }
}

export async function createTask(input: {
  title: string
  due_date?: string | null
  category?: 'work' | 'personal'
  notes?: string | null
}): Promise<{ data?: Task; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title.trim(),
      due_date: input.due_date || null,
      category: input.category || 'work',
      notes: input.notes || null,
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
    })
    .select('*, business:businesses!tasks_business_id_fkey(id, name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { data: data as Task }
}

export async function updateTask(
  id: string,
  updates: {
    title?: string
    due_date?: string | null
    status?: 'open' | 'done'
    is_priority?: boolean
    category?: 'work' | 'personal'
    notes?: string | null
  }
): Promise<{ data?: Task; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.due_date !== undefined) updateData.due_date = updates.due_date
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.is_priority !== undefined) updateData.is_priority = updates.is_priority
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.notes !== undefined) updateData.notes = updates.notes

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*, business:businesses!tasks_business_id_fkey(id, name)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { data: data as Task }
}

export async function deleteTask(id: string): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { error: null }
}

export async function setPriority(id: string): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  // Clear any existing priority
  await supabase
    .from('tasks')
    .update({ is_priority: false })
    .eq('organization_id', orgId)
    .eq('is_priority', true)
    .eq('status', 'open')

  // Set new priority
  const { error } = await supabase
    .from('tasks')
    .update({ is_priority: true })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { error: null }
}

export async function clearPriority(id: string): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { error } = await supabase
    .from('tasks')
    .update({ is_priority: false })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { error: null }
}

export async function refreshTaskCommitments(): Promise<{ count?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase.rpc('refresh_task_commitments')
  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { count: data as number }
}
