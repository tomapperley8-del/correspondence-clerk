'use client'

import React, { useState } from 'react'

type CollapsibleSectionProps = {
  title: string
  count: number
  defaultExpanded?: boolean
  subtitle?: string
  initialLimit?: number
  children: React.ReactNode
}

export function CollapsibleSection({ title, count, defaultExpanded = false, subtitle, initialLimit, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultExpanded)
  const [showAll, setShowAll] = useState(false)

  if (count === 0) return null

  const childArray = React.Children.toArray(children)
  const limited = initialLimit && !showAll && childArray.length > initialLimit
  const visibleChildren = limited ? childArray.slice(0, initialLimit) : childArray
  const hiddenCount = limited ? childArray.length - initialLimit! : 0

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
          {subtitle && (
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
        <div className="divide-y divide-gray-200 border-t border-gray-200">
          {visibleChildren}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-2.5 text-xs text-gray-500 hover:text-brand-navy hover:bg-gray-50/60 transition-colors text-left"
            >
              Show {hiddenCount} more…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
