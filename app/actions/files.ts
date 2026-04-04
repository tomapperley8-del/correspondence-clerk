'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'

export type BusinessFile = {
  id: string
  business_id: string
  organization_id: string
  user_id: string
  filename: string
  storage_path: string
  file_type: string
  file_size_bytes: number
  parsed_text: string | null
  created_at: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_ORG_STORAGE = 50 * 1024 * 1024 // 50MB per org
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export async function getBusinessFiles(businessId: string): Promise<BusinessFile[]> {
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_files')
    .select('*')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  return (data ?? []) as BusinessFile[]
}

export async function getOrgStorageUsed(): Promise<number> {
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return 0
  const supabase = await createClient()
  const { data } = await supabase
    .from('business_files')
    .select('file_size_bytes')
    .eq('organization_id', orgId)
  return (data ?? []).reduce((sum, r) => sum + (r.file_size_bytes || 0), 0)
}

export async function uploadBusinessFile(businessId: string, formData: FormData) {
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorised' }

  const file = formData.get('file') as File
  if (!file) return { error: 'No file provided' }

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: `File type not allowed: ${file.type}. Accepted: PDF, images, text, CSV, Word documents.` }
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.` }
  }

  // Check org storage cap
  const currentUsage = await getOrgStorageUsed()
  if (currentUsage + file.size > MAX_ORG_STORAGE) {
    return { error: `Storage limit reached (${(MAX_ORG_STORAGE / 1024 / 1024).toFixed(0)}MB). Delete some files to make room.` }
  }

  // Upload to Supabase Storage
  const storagePath = `${orgId}/${businessId}/${Date.now()}_${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('business-files')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

  // Insert metadata row
  const { error: insertError } = await supabase.from('business_files').insert({
    business_id: businessId,
    organization_id: orgId,
    user_id: user.id,
    filename: file.name,
    storage_path: storagePath,
    file_type: file.type,
    file_size_bytes: file.size,
  })

  if (insertError) {
    // Clean up storage on DB failure
    await supabase.storage.from('business-files').remove([storagePath])
    return { error: `Failed to save file record: ${insertError.message}` }
  }

  revalidatePath(`/businesses/${businessId}`)
  return { success: true }
}

export async function deleteBusinessFile(fileId: string) {
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const supabase = await createClient()

  // Get the file record first
  const { data: file } = await supabase
    .from('business_files')
    .select('*')
    .eq('id', fileId)
    .eq('organization_id', orgId)
    .single()

  if (!file) return { error: 'File not found' }

  // Delete from storage
  await supabase.storage.from('business-files').remove([file.storage_path])

  // Delete from DB
  const { error } = await supabase
    .from('business_files')
    .delete()
    .eq('id', fileId)
    .eq('organization_id', orgId)

  if (error) return { error: error.message }

  revalidatePath(`/businesses/${file.business_id}`)
  return { success: true }
}

export async function getFileDownloadUrl(fileId: string): Promise<{ url?: string; error?: string }> {
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' }

  const supabase = await createClient()
  const { data: file } = await supabase
    .from('business_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('organization_id', orgId)
    .single()

  if (!file) return { error: 'File not found' }

  const { data } = await supabase.storage
    .from('business-files')
    .createSignedUrl(file.storage_path, 3600) // 1 hour

  if (!data?.signedUrl) return { error: 'Could not generate download link' }
  return { url: data.signedUrl }
}
