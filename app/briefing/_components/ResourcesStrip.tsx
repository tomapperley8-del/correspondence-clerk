'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Resource } from '@/app/actions/resources'
import { getResourceOpenUrl } from '@/app/actions/resources'
import { categoryMeta, fileTypeLabel } from '@/lib/resource-meta'
import { toast } from '@/lib/toast'

export function ResourcesStrip({ resources }: { resources: Resource[] }) {
  const [openingId, setOpeningId] = useState<string | null>(null)
  const router = useRouter()

  async function handleOpen(resource: Resource) {
    // Pasted-text resources are viewed/copied on the full Resource Hub page.
    if (resource.file_type === 'text') {
      router.push('/resources')
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

  if (resources.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No resources yet.{' '}
        <Link href="/resources" className="text-brand-navy hover:text-brand-olive font-medium transition-colors">
          Add your first →
        </Link>
      </p>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {resources.map(resource => {
        const cat = categoryMeta(resource.category)
        return (
          <button
            key={resource.id}
            onClick={() => handleOpen(resource)}
            disabled={openingId === resource.id}
            className="flex-shrink-0 bg-white border border-gray-200 px-3 py-2 text-left hover:shadow-[var(--shadow-sm)] transition-shadow max-w-[220px]"
          >
            <p className="text-xs font-semibold text-brand-navy truncate">
              {resource.is_pinned && <span className="text-amber-500 mr-1">★</span>}
              {resource.title}
              {openingId === resource.id && <span className="text-gray-400 font-normal ml-1">...</span>}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              <span className={`px-1 py-0.5 mr-1 font-medium ${cat.badge}`}>{cat.label}</span>
              {fileTypeLabel(resource.file_type)}
            </p>
          </button>
        )
      })}
    </div>
  )
}
