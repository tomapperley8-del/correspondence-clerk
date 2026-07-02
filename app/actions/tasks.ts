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

export type TaskCategory = {
  id: string
  organization_id: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
}

export type Task = {
  id: string
  organization_id: string
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
  status: 'open' | 'done'
  is_priority: boolean
  category: 'work' | 'personal'
  source: 'manual' | 'contract_renewal' | 'follow_up' | 'club_card_checkin' | 'advertiser_stats'
  type: TaskType
  task_category_id: string | null
  renewal_stage: RenewalStage
  business_id: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
  business?: TaskBusiness | null
  task_category?: TaskCategory | null
}

export async function getTasks(): Promise<{ data?: Task[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('tasks')
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end), task_category:task_categories(id, organization_id, name, color, sort_order, is_active)')
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data as Task[] }
}

export async function createTask(input: {
  title: string
  due_date?: string | null
  due_time?: string | null
  category?: 'work' | 'personal'
  notes?: string | null
  type?: TaskType
  task_category_id?: string | null
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
      due_time: input.due_time || null,
      category: input.category || 'work',
      notes: input.notes || null,
      type: input.type || 'task',
      task_category_id: input.task_category_id || null,
      status: 'open',
      is_priority: false,
      source: 'manual',
      organization_id: orgId,
      position: 0,
    })
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end), task_category:task_categories(id, organization_id, name, color, sort_order, is_active)')
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
    due_time?: string | null
    status?: 'open' | 'done'
    is_priority?: boolean
    category?: 'work' | 'personal'
    notes?: string | null
    type?: TaskType
    task_category_id?: string | null
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
  if (updates.due_time !== undefined) updateData.due_time = updates.due_time
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.is_priority !== undefined) updateData.is_priority = updates.is_priority
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.task_category_id !== undefined) updateData.task_category_id = updates.task_category_id
  if (updates.renewal_stage !== undefined) updateData.renewal_stage = updates.renewal_stage

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*, business:businesses!tasks_business_id_fkey(id, name, is_club_card, is_advertiser, contract_renewal_type, contract_end), task_category:task_categories(id, organization_id, name, color, sort_order, is_active)')
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

export async function getTaskCategories(): Promise<{ data?: TaskCategory[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('task_categories')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return { error: error.message }
  return { data: data as TaskCategory[] }
}

export async function createTaskCategory(input: {
  name: string
  color: string
}): Promise<{ data?: TaskCategory; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { count } = await supabase
    .from('task_categories')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const { data, error } = await supabase
    .from('task_categories')
    .insert({
      organization_id: orgId,
      name: input.name.trim(),
      color: input.color,
      sort_order: (count ?? 0),
    })
    .select('*')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath('/settings')
  return { data: data as TaskCategory }
}

export async function updateTaskCategory(
  id: string,
  updates: { name?: string; color?: string; sort_order?: number }
): Promise<{ data?: TaskCategory; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const updateData: Record<string, unknown> = {}
  if (updates.name !== undefined) updateData.name = updates.name.trim()
  if (updates.color !== undefined) updateData.color = updates.color
  if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order

  const { data, error } = await supabase
    .from('task_categories')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath('/settings')
  return { data: data as TaskCategory }
}

export async function deleteTaskCategory(id: string): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { error } = await supabase
    .from('task_categories')
    .update({ is_active: false })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/todos')
  revalidatePath('/settings')
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

const CC_ADVERTISING_CATEGORY_ID = 'e0e7097b-342f-43f1-8ddb-f4dc9ba31e01'

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function generateBusinessScheduledTasks(
  businessId: string
): Promise<{ created: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { created: 0, error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { created: 0, error: 'No organization found' }

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id, name, is_club_card, is_advertiser, contract_start, contract_end')
    .eq('id', businessId)
    .eq('organization_id', orgId)
    .single()

  if (bizError || !business) return { created: 0, error: bizError?.message || 'Business not found' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toDateStr(today)

  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('due_date, source')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .in('source', ['club_card_checkin', 'advertiser_stats'])

  const existingDates = new Set(
    (existingTasks || []).map(t => `${t.source}:${t.due_date}`)
  )

  const tasksToCreate: Array<{
    title: string
    due_date: string
    source: string
    business_id: string
    organization_id: string
    task_category_id: string
    status: string
    is_priority: boolean
    category: string
    type: string
    position: number
  }> = []

  if (business.is_club_card) {
    const startDate = business.contract_start ? new Date(business.contract_start) : today
    for (let i = 1; i <= 4; i++) {
      const dueDate = addMonths(startDate, i * 3)
      const dueDateStr = toDateStr(dueDate)
      if (dueDateStr < todayStr) continue
      if (existingDates.has(`club_card_checkin:${dueDateStr}`)) continue
      tasksToCreate.push({
        title: `Check in with ${business.name}`,
        due_date: dueDateStr,
        source: 'club_card_checkin',
        business_id: business.id,
        organization_id: orgId,
        task_category_id: CC_ADVERTISING_CATEGORY_ID,
        status: 'open',
        is_priority: false,
        category: 'work',
        type: 'task',
        position: 0,
      })
    }
  }

  if (business.is_advertiser) {
    const startDate = business.contract_start ? new Date(business.contract_start) : today
    const endDate = business.contract_end
      ? new Date(business.contract_end)
      : addMonths(startDate, 12)
    let current = addMonths(startDate, 1)
    while (current <= endDate) {
      const dueDateStr = toDateStr(current)
      if (dueDateStr >= todayStr && !existingDates.has(`advertiser_stats:${dueDateStr}`)) {
        tasksToCreate.push({
          title: `Send stats to ${business.name}`,
          due_date: dueDateStr,
          source: 'advertiser_stats',
          business_id: business.id,
          organization_id: orgId,
          task_category_id: CC_ADVERTISING_CATEGORY_ID,
          status: 'open',
          is_priority: false,
          category: 'work',
          type: 'task',
          position: 0,
        })
      }
      current = addMonths(current, 1)
    }
  }

  if (tasksToCreate.length === 0) return { created: 0 }

  const { error: insertError } = await supabase
    .from('tasks')
    .insert(tasksToCreate)

  if (insertError) return { created: 0, error: insertError.message }

  revalidatePath('/todos')
  revalidatePath('/dashboard')
  return { created: tasksToCreate.length }
}

export async function generateAllScheduledTasks(): Promise<{ created: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { created: 0, error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { created: 0, error: 'No organization found' }

  const { data: businesses, error: bizError } = await supabase
    .from('businesses')
    .select('id')
    .eq('organization_id', orgId)
    .or('is_club_card.eq.true,is_advertiser.eq.true')

  if (bizError) return { created: 0, error: bizError.message }
  if (!businesses || businesses.length === 0) return { created: 0 }

  let totalCreated = 0
  for (const biz of businesses) {
    const result = await generateBusinessScheduledTasks(biz.id)
    if (result.error) return { created: totalCreated, error: `Failed for business ${biz.id}: ${result.error}` }
    totalCreated += result.created
  }

  revalidatePath('/todos')
  revalidatePath('/dashboard')
  return { created: totalCreated }
}
