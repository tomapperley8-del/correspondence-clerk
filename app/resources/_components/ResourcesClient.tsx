'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Resource } from '@/app/actions/resources'
import { deleteResource, getResourceOpenUrl, updateResource } from '@/app/actions/resources'
import { RESOURCE_CATEGORIES, categoryMeta, fileTypeLabel } from '@/lib/resource-meta'
import { formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { AddResourceModal } from './AddResourceModal'

export function ResourcesClient({
  initialResources,
  initialError,
  businessNames,
}: {
  initialResources: Resource[]
  initialError: string | null
  businessNames: { id: string; name: string }[]
}) {
  const [resources, setResources] = useState<Resource[]>(initialResources)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = resources
    if (categoryFilter) list = list.filter(r => r.category === categoryFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        r =>
          r.title.toLowerCase().includes(q) ||
          r.tags.some(t => t.includes(q)) ||
          (r.description ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [resources, categoryFilter, search])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of resources) counts[r.category] = (counts[r.category] ?? 0) + 1
    return counts
  }, [resources])

  async function handleOpen(resource: Resource) {
    // Pasted-text resources have no URL — expand inline instead.
    if (resource.file_type === 'text') {
      setExpandedTextId(prev => (prev === resource.id ? null : resource.id))
      return
    }
    setOpeningId(resource.id)
    const result = await getResourceOpenUrl(resource.id)
    setOpeningId(null)
    if (result.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } else {
      toast.error(result.error ?? 'Could not open resource')
    }
  }

  async function handleCopyText(resource: Resource) {
    try {
      await navigator.clipboard.writeText(resource.content_text ?? '')
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy — expand and select the text instead')
    }
  }

  async function handleTogglePin(resource: Resource) {
    const next = !resource.is_pinned
    setResources(prev => prev.map(r => (r.id === resource.id ? { ...r, is_pinned: next } : r)))
    const result = await updateResource(resource.id, { is_pinned: next })
    if (result.error) {
      setResources(prev => prev.map(r => (r.id === resource.id ? { ...r, is_pinned: !next } : r)))
      toast.error(result.error)
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null)
    const previous = resources
    setResources(prev => prev.filter(r => r.id !== id))
    const result = await deleteResource(id)
    if (result.error) {
      setResources(previous)
      toast.error(result.error)
    } else {
      toast.success('Resource deleted')
    }
  }

  return (
    <div className="min-h-screen bg-brand-paper">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>
              Resources
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Reports, rate cards, templates and reference materials in one place
            </p>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-brand-navy text-white hover:bg-brand-navy-hover px-5 py-2.5 font-semibold"
          >
            Add Resource
          </Button>
        </div>

        {initialError && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 mb-6" role="alert">
            <p className="text-red-800 text-sm">{initialError}</p>
          </div>
        )}

        {/* Search + category filters */}
        <div className="mb-6 space-y-3">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or tag..."
            className="w-full sm:max-w-md bg-white"
            aria-label="Search resources"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`px-3 py-1 text-xs font-medium border transition-colors ${
                categoryFilter === null
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-brand-navy'
              }`}
              aria-pressed={categoryFilter === null}
            >
              All ({resources.length})
            </button>
            {RESOURCE_CATEGORIES.filter(c => (categoryCounts[c.value] ?? 0) > 0).map(c => (
              <button
                key={c.value}
                onClick={() => setCategoryFilter(categoryFilter === c.value ? null : c.value)}
                className={`px-3 py-1 text-xs font-medium border transition-colors ${
                  categoryFilter === c.value
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-brand-navy'
                }`}
                aria-pressed={categoryFilter === c.value}
              >
                {c.label} ({categoryCounts[c.value]})
              </button>
            ))}
          </div>
        </div>

        {/* Card grid */}
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 px-6 py-16 text-center">
            {resources.length === 0 ? (
              <>
                <p className="text-gray-600 font-medium mb-2">No resources yet</p>
                <p className="text-sm text-gray-400 mb-6">
                  Upload your first rate card, ad report or template to get started.
                </p>
                <Button
                  onClick={() => setAddOpen(true)}
                  className="bg-brand-navy text-white hover:bg-brand-navy-hover px-5 py-2.5 font-semibold"
                >
                  Add Resource
                </Button>
              </>
            ) : (
              <p className="text-gray-500 text-sm">No resources match your search.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(resource => {
              const cat = categoryMeta(resource.category)
              return (
                <div
                  key={resource.id}
                  className="bg-white border border-gray-200 p-4 flex flex-col gap-3 hover:shadow-[var(--shadow-md)] transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => handleOpen(resource)}
                      disabled={openingId === resource.id}
                      className="text-left font-semibold text-brand-navy hover:text-brand-olive transition-colors text-sm leading-snug"
                    >
                      {resource.is_pinned && <span className="text-amber-500 mr-1" title="Pinned">★</span>}
                      {resource.title}
                      {openingId === resource.id && <span className="text-gray-400 font-normal ml-2">Opening...</span>}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 ${cat.badge}`}>{cat.label}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600">
                      {fileTypeLabel(resource.file_type)}
                    </span>
                    {resource.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-brand-warm text-gray-500 border border-gray-200">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {resource.description && (
                    <p className="text-xs text-gray-500 line-clamp-2">{resource.description}</p>
                  )}

                  {resource.file_type === 'text' && (
                    <div>
                      {expandedTextId === resource.id ? (
                        <pre className="text-xs text-gray-700 bg-brand-warm border border-gray-200 p-2.5 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                          {resource.content_text}
                        </pre>
                      ) : (
                        resource.content_text && (
                          <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-2">
                            {resource.content_text}
                          </p>
                        )
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <button
                          onClick={() => setExpandedTextId(prev => (prev === resource.id ? null : resource.id))}
                          className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
                        >
                          {expandedTextId === resource.id ? 'Hide' : 'View'}
                        </button>
                        <button
                          onClick={() => handleCopyText(resource)}
                          className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-2 flex items-center justify-between border-t border-gray-100">
                    <div className="text-xs text-gray-400">
                      {formatDateGB(resource.created_at)}
                      {resource.linked_business && (
                        <>
                          {' · '}
                          <Link
                            href={`/businesses/${resource.linked_business.id}`}
                            className="text-brand-navy hover:text-brand-olive transition-colors"
                          >
                            {resource.linked_business.name}
                          </Link>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTogglePin(resource)}
                        className="text-xs text-gray-400 hover:text-amber-600 font-medium transition-colors"
                      >
                        {resource.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      {confirmDeleteId === resource.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(resource.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(resource.id)}
                          className="text-xs text-gray-400 hover:text-red-600 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AddResourceModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onResourceAdded={(r) => setResources(prev => [r, ...prev])}
        businessNames={businessNames}
      />
    </div>
  )
}
