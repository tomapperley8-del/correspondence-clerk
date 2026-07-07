'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'

export type ResourceCategory =
  | 'ad_report'
  | 'template'
  | 'sales_sheet'
  | 'rate_card'
  | 'media_pack'
  | 'spreadsheet'
  | 'other'

export type Resource = {
  id: string
  organization_id: string
  title: string
  description: string | null
  category: ResourceCategory
  file_url: string | null
  file_type: string | null
  is_uploaded: boolean
  storage_path: string | null
  linked_business_id: string | null
  tags: string[]
  is_pinned: boolean
  created_at: string
  updated_at: string
  linked_business?: { id: string; name: string } | null
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

function detectLinkType(url: string): string {
  if (url.includes('docs.google.com/spreadsheets')) return 'google_sheet'
  if (url.includes('docs.google.com/document')) return 'google_doc'
  if (url.includes('docs.google.com/presentation')) return 'google_slides'
  if (url.includes('drive.google.com')) return 'google_drive'
  return 'link'
}

const RESOURCE_SELECT = '*, linked_business:businesses!resources_linked_business_id_fkey(id, name)'

export async function getResources(): Promise<{ data?: Resource[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_SELECT)
    .eq('organization_id', orgId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data as unknown as Resource[] }
}

export async function getPinnedOrRecentResources(limit = 6): Promise<Resource[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return []

  const { data } = await supabase
    .from('resources')
    .select(RESOURCE_SELECT)
    .eq('organization_id', orgId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as unknown as Resource[]
}

export async function createResource(formData: FormData): Promise<{ data?: Resource; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const title = (formData.get('title') as string | null)?.trim()
  if (!title) return { error: 'Title is required' }

  const category = (formData.get('category') as string | null) || 'other'
  const description = (formData.get('description') as string | null)?.trim() || null
  const linkedBusinessId = (formData.get('linked_business_id') as string | null) || null
  const tagsRaw = (formData.get('tags') as string | null) || ''
  const tags = tagsRaw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)

  const file = formData.get('file') as File | null
  const externalUrl = (formData.get('external_url') as string | null)?.trim() || null

  let fileUrl: string | null = null
  let fileType: string | null = null
  let isUploaded = false
  let storagePath: string | null = null

  if (file && file.size > 0) {
    const detected = ALLOWED_TYPES[file.type]
    if (!detected) {
      return { error: `File type not allowed: ${file.type || 'unknown'}. Accepted: PDF, images, text, CSV, Word, Excel, PowerPoint.` }
    }
    if (file.size > MAX_FILE_SIZE) {
      return { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.` }
    }

    storagePath = `${orgId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('resources')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

    fileType = detected
    isUploaded = true
  } else if (externalUrl) {
    if (!/^https?:\/\//i.test(externalUrl)) {
      return { error: 'External link must start with http:// or https://' }
    }
    fileUrl = externalUrl
    fileType = detectLinkType(externalUrl)
  } else {
    return { error: 'Upload a file or paste an external link' }
  }

  const { data, error } = await supabase
    .from('resources')
    .insert({
      organization_id: orgId,
      title,
      description,
      category,
      file_url: fileUrl,
      file_type: fileType,
      is_uploaded: isUploaded,
      storage_path: storagePath,
      linked_business_id: linkedBusinessId,
      tags,
    })
    .select(RESOURCE_SELECT)
    .single()

  if (error) {
    if (storagePath) await supabase.storage.from('resources').remove([storagePath])
    return { error: error.message }
  }

  revalidatePath('/resources')
  return { data: data as unknown as Resource }
}

export async function updateResource(
  id: string,
  updates: {
    title?: string
    description?: string | null
    category?: ResourceCategory
    linked_business_id?: string | null
    tags?: string[]
    is_pinned?: boolean
  }
): Promise<{ data?: Resource; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.linked_business_id !== undefined) updateData.linked_business_id = updates.linked_business_id
  if (updates.tags !== undefined) updateData.tags = updates.tags
  if (updates.is_pinned !== undefined) updateData.is_pinned = updates.is_pinned

  const { data, error } = await supabase
    .from('resources')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select(RESOURCE_SELECT)
    .single()

  if (error) return { error: error.message }
  revalidatePath('/resources')
  return { data: data as unknown as Resource }
}

export async function deleteResource(id: string): Promise<{ error?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data: resource } = await supabase
    .from('resources')
    .select('storage_path, is_uploaded')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (!resource) return { error: 'Resource not found' }

  if (resource.is_uploaded && resource.storage_path) {
    await supabase.storage.from('resources').remove([resource.storage_path])
  }

  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }
  revalidatePath('/resources')
  return { error: null }
}

export async function getResourceOpenUrl(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const { data: resource } = await supabase
    .from('resources')
    .select('file_url, is_uploaded, storage_path')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (!resource) return { error: 'Resource not found' }

  if (resource.is_uploaded && resource.storage_path) {
    const { data } = await supabase.storage
      .from('resources')
      .createSignedUrl(resource.storage_path, 3600) // 1 hour
    if (!data?.signedUrl) return { error: 'Could not generate download link' }
    return { url: data.signedUrl }
  }

  if (resource.file_url) return { url: resource.file_url }
  return { error: 'Resource has no file or link' }
}
