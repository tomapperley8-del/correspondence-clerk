'use client'

import { useState } from 'react'

type CollapsibleSectionProps = {
  title: string
  count: number
  defaultExpanded?: boolean
  subtitle?: string
  children: React.ReactNode
}

export function CollapsibleSection({ title, count, defaultExpanded = false, subtitle, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultExpanded)
  if (count === 0) return null
  return (
    <div className="border border-gray-200 bg-white mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-gray-100 border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-sm shrink-0">
            {count}
          </span>
          {subtitle && !open && (
            <span className="text-[11px] text-gray-400 truncate hidden sm:block">{subtitle}</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}
