'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import {
  getBusinessFiles,
  getOrgStorageUsed,
  uploadBusinessFile,
  deleteBusinessFile,
  getFileDownloadUrl,
  type BusinessFile,
} from '@/app/actions/files'

const MAX_ORG_STORAGE = 50 * 1024 * 1024 // 50MB — keep in sync with server

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'text/plain': 'Text',
    'text/csv': 'CSV',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  }
  return map[mimeType] ?? mimeType.split('/').pop()?.toUpperCase() ?? 'File'
}

interface BusinessFilesProps {
  businessId: string
}

export function BusinessFiles({ businessId }: BusinessFilesProps) {
  const [files, setFiles] = useState<BusinessFile[]>([])
  const [storageUsed, setStorageUsed] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BusinessFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    const [fileData, usage] = await Promise.all([
      getBusinessFiles(businessId),
      getOrgStorageUsed(),
    ])
    setFiles(fileData)
    setStorageUsed(usage)
    // Auto-expand if files exist
    if (fileData.length > 0) setIsExpanded(true)
  }, [businessId])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await uploadBusinessFile(businessId, formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Uploaded ${file.name}`)
        await loadFiles()
      }
    } catch {
      toast.error('Upload failed unexpectedly')
    } finally {
      setUploading(false)
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteBusinessFile(deleteTarget.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Deleted ${deleteTarget.filename}`)
        await loadFiles()
      }
    } catch {
      toast.error('Delete failed unexpectedly')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleDownload = async (file: BusinessFile) => {
    const result = await getFileDownloadUrl(file.id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    if (result.url) {
      window.open(result.url, '_blank')
    }
  }

  const storagePercent = Math.min((storageUsed / MAX_ORG_STORAGE) * 100, 100)

  return (
    <>
      <div className="bg-white border p-6 mb-6 rounded-sm" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-sm text-gray-500 transition-transform" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            <h2 className="text-xl font-bold font-serif">
              Files ({files.length})
            </h2>
          </button>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.doc,.docx"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-brand-navy text-white hover:bg-brand-navy-hover px-4 py-2 text-sm font-semibold rounded-sm transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </Button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-4">
            {/* Storage usage */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Organisation storage</span>
                <span>{formatFileSize(storageUsed)} / {formatFileSize(MAX_ORG_STORAGE)} used</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-navy rounded-full transition-all"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>

            {/* File list */}
            {files.length === 0 ? (
              <p className="text-gray-600 text-sm">
                No files uploaded yet. Upload PDFs, images, or documents.
              </p>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 border rounded-sm"
                    style={{ borderColor: 'rgba(0,0,0,0.06)' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-sm whitespace-nowrap">
                        {fileTypeLabel(file.file_type)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.file_size_bytes)} · {formatDateGB(file.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => handleDownload(file)}
                        className="text-sm text-brand-navy hover:text-brand-dark transition-colors px-2 py-1"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => setDeleteTarget(file)}
                        className="text-sm text-red-600 hover:text-red-800 transition-colors px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete file"
        description={`Are you sure you want to delete "${deleteTarget?.filename}"? This cannot be undone.`}
        confirmLabel="Delete"
        loadingLabel="Deleting..."
        destructive
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
