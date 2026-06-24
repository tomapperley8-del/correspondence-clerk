'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type TaskBusiness = {
  id: string
  name: string
  is_club_card: boolean
  is_advertiser: boolean
  contract_renewal_type: string | null
  contract_end: string | null
}

export type RenewalStage = 'not_started' | 'in_progress' | 'agreed' | 'not_renewing' | 'done'
export type TaskType = 'task' | 'call' | 'event'

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
  type: TaskType
  renewal_stage: RenewalStage
  business_id: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
  business?: TaskBusiness | null
}

export async function getTasks(): Promise<{ data?: Task[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('tasks')
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end)')
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
  type?: TaskType
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
      type: input.type || 'task',
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
    })
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end)')
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
    type?: TaskType
    renewal_stage?: RenewalStage
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
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.renewal_stage !== undefined) updateData.renewal_stage = updates.renewal_stage

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end)')
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

export async function migrateCrmRenewalDates(): Promise<{ migrated: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { migrated: 0, error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { migrated: 0, error: 'No organisation found' }

  const { data: rows, error: fetchErr } = await supabase
    .from('tasks')
    .select('id, due_date, business:businesses!tasks_business_id_fkey(id, contract_end, is_club_card, is_advertiser)')
    .eq('organization_id', orgId)
    .eq('source', 'contract_renewal')
    .eq('status', 'open')
    .not('business_id', 'is', null)

  if (fetchErr || !rows) return { migrated: 0, error: fetchErr?.message }

  let migrated = 0
  for (const row of rows) {
    const bizArr = row.business as unknown as { id: string; contract_end: string | null; is_club_card: boolean; is_advertiser: boolean }[] | null
    const biz = Array.isArray(bizArr) ? bizArr[0] ?? null : bizArr
    if (!biz?.contract_end) continue
    if (row.due_date !== biz.contract_end) continue

    const leadDays = biz.is_advertiser ? 28 : 21
    const end = new Date(biz.contract_end + 'T00:00:00')
    end.setDate(end.getDate() - leadDays)
    const newDate = end.toISOString().slice(0, 10)

    const { error: upErr } = await supabase
      .from('tasks')
      .update({ due_date: newDate })
      .eq('id', row.id)
      .eq('organization_id', orgId)

    if (!upErr) migrated++
  }

  if (migrated > 0) revalidatePath('/todos')
  return { migrated }
}

export async function createTaskFromCorrespondence(input: {
  correspondenceId: string
  businessId: string
  businessName: string
  subject: string | null
}): Promise<{ data?: Task; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7)

  const title = input.subject
    ? `Re: ${input.subject} (${input.businessName})`
    : `Follow up with ${input.businessName}`

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      due_date: dueDate.toISOString().slice(0, 10),
      category: 'work' as const,
      notes: null,
      status: 'open' as const,
      is_priority: false,
      source: 'manual' as const,
      business_id: input.businessId,
      organization_id: orgId,
      position: 0,
    })
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end)')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/todos')
  return { data: data as Task }
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
