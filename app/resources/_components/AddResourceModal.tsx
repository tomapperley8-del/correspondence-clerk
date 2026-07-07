'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createResource } from '@/app/actions/resources'
import type { Resource } from '@/app/actions/resources'
import { RESOURCE_CATEGORIES } from '@/lib/resource-meta'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'
import { toast } from '@/lib/toast'

export function AddResourceModal({
  isOpen,
  onClose,
  onResourceAdded,
  businessNames,
}: {
  isOpen: boolean
  onClose: () => void
  onResourceAdded: (resource: Resource) => void
  businessNames: { id: string; name: string }[]
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('other')
  const [mode, setMode] = useState<'upload' | 'link'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [externalUrl, setExternalUrl] = useState('')
  const [tags, setTags] = useState('')
  const [businessSearch, setBusinessSearch] = useState('')
  const [linkedBusinessId, setLinkedBusinessId] = useState<string | null>(null)
  const [businessDropdownOpen, setBusinessDropdownOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useModalKeyboard(isOpen, onClose)

  const filteredBusinesses = businessSearch.trim()
    ? businessNames.filter(b => b.name.toLowerCase().includes(businessSearch.toLowerCase())).slice(0, 8)
    : []

  const selectedBusinessName = linkedBusinessId
    ? businessNames.find(b => b.id === linkedBusinessId)?.name ?? null
    : null

  function reset() {
    setTitle('')
    setDescription('')
    setCategory('other')
    setMode('upload')
    setFile(null)
    setExternalUrl('')
    setTags('')
    setBusinessSearch('')
    setLinkedBusinessId(null)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'upload' && !file) {
      setError('Choose a file to upload, or switch to external link')
      return
    }
    if (mode === 'link' && !externalUrl.trim()) {
      setError('Paste an external link, or switch to file upload')
      return
    }

    setIsLoading(true)
    const formData = new FormData()
    formData.set('title', title)
    formData.set('description', description)
    formData.set('category', category)
    formData.set('tags', tags)
    if (linkedBusinessId) formData.set('linked_business_id', linkedBusinessId)
    if (mode === 'upload' && file) formData.set('file', file)
    if (mode === 'link') formData.set('external_url', externalUrl.trim())

    const result = await createResource(formData)
    setIsLoading(false)

    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      toast.success('Resource added')
      onResourceAdded(result.data)
      reset()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Resource"
        className="bg-white border border-gray-200 w-full max-w-2xl p-6 shadow-[var(--shadow-lg)] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Add Resource</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm font-medium">Close</button>
        </div>

        {error && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 mb-6" role="alert">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="resource-title" className="block mb-2 font-semibold">
              Title <span className="text-red-600">*</span>
            </Label>
            <Input
              id="resource-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
              placeholder="e.g. Rate Card 2026"
            />
          </div>

          <div>
            <Label htmlFor="resource-description" className="block mb-2 font-semibold">Description</Label>
            <textarea
              id="resource-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={2}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
              placeholder="Optional notes or context"
            />
          </div>

          <div>
            <Label htmlFor="resource-category" className="block mb-2 font-semibold">Category</Label>
            <select
              id="resource-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isLoading}
              className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
            >
              {RESOURCE_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Upload / link toggle */}
          <div>
            <div className="flex border border-gray-300 w-fit mb-3" role="group" aria-label="File source">
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'upload' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
                aria-pressed={mode === 'upload'}
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={() => setMode('link')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'link' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
                aria-pressed={mode === 'link'}
              >
                External link
              </button>
            </div>

            {mode === 'upload' ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  const dropped = e.dataTransfer.files?.[0]
                  if (dropped) setFile(dropped)
                }}
                className={`border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer ${
                  isDragging ? 'border-brand-olive bg-brand-olive/5' : 'border-gray-300 hover:border-brand-navy/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                aria-label="Drop a file here or click to browse"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">{file.name}</span>
                    <span className="text-gray-400 ml-2">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null) }}
                      className="ml-3 text-red-600 hover:text-red-800 text-xs font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Drag and drop a file here, or <span className="text-brand-navy font-medium">browse</span>
                    <span className="block text-xs text-gray-400 mt-1">PDF, images, Word, Excel, PowerPoint, CSV — max 10MB</span>
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label htmlFor="resource-url" className="block mb-2 font-semibold">Link URL</Label>
                <Input
                  id="resource-url"
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                  placeholder="https://docs.google.com/spreadsheets/..."
                />
              </div>
            )}
          </div>

          {/* Linked business — searchable */}
          <div className="relative">
            <Label htmlFor="resource-business" className="block mb-2 font-semibold">Linked business (optional)</Label>
            {selectedBusinessName ? (
              <div className="flex items-center gap-2">
                <span className="text-sm bg-brand-warm border border-gray-200 px-3 py-1.5">{selectedBusinessName}</span>
                <button
                  type="button"
                  onClick={() => { setLinkedBusinessId(null); setBusinessSearch('') }}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="resource-business"
                  type="text"
                  value={businessSearch}
                  onChange={(e) => { setBusinessSearch(e.target.value); setBusinessDropdownOpen(true) }}
                  onFocus={() => setBusinessDropdownOpen(true)}
                  disabled={isLoading}
                  className="w-full"
                  placeholder="Search businesses..."
                  autoComplete="off"
                />
                {businessDropdownOpen && filteredBusinesses.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 shadow-[var(--shadow-md)] max-h-48 overflow-y-auto">
                    {filteredBusinesses.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setLinkedBusinessId(b.id)
                          setBusinessDropdownOpen(false)
                        }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-brand-warm"
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <Label htmlFor="resource-tags" className="block mb-2 font-semibold">Tags</Label>
            <Input
              id="resource-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={isLoading}
              className="w-full"
              placeholder="Comma-separated, e.g. 2026, pricing, newsletter"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-3 font-semibold"
            >
              {isLoading ? 'Adding...' : 'Add Resource'}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
