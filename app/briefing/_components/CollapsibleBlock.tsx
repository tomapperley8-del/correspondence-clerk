'use client'

import { useState } from 'react'
import Link from 'next/link'

export function CollapsibleBlock({
  title,
  count,
  countHighlight,
  linkHref,
  linkLabel,
  defaultOpen,
  children,
}: {
  title: string
  count: number
  countHighlight?: boolean
  linkHref?: string
  linkLabel?: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="bg-white border border-gray-200">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-3 text-left"
          aria-expanded={open}
        >
          <h2 className="text-lg font-bold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>
            {title}
          </h2>
          <span
            className={`min-w-[22px] h-[22px] px-1.5 text-xs font-bold flex items-center justify-center ${
              countHighlight && count > 0
                ? 'bg-brand-olive text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {count}
          </span>
          <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
        </button>
        {linkHref && (
          <Link href={linkHref} className="text-xs font-medium text-brand-navy hover:text-brand-olive transition-colors">
            {linkLabel ?? 'View all'}
          </Link>
        )}
      </div>
      {open && <div className="p-4 sm:p-5">{children}</div>}
    </section>
  )
}
