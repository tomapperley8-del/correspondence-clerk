'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Loading screens for the tabs (loading.tsx). Soft grey outlines of a page's
 * boxes in the house style (header band, rows), marked aria-busy, with a slim
 * navy spinner and "Loading <page>…" once a page has taken more than a second.
 * The spinner and the pulse stop under prefers-reduced-motion (globals.css).
 */

function Bar({ className }: { className?: string }) {
  return <div className={cn('cc-skel h-3 rounded-sm', className)} />
}

/** One box: a header band and a few rows, like a FoldSection. */
export function SkeletonBox({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('border border-black/[0.06] rounded-sm bg-white overflow-hidden', className)}>
      <div className="bg-black/[0.035] px-4 py-3 flex items-center gap-3">
        <Bar className="h-4 w-40 bg-black/[0.08]" />
        <Bar className="h-4 w-8 ml-auto" />
      </div>
      <div className="divide-y divide-black/[0.05]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3">
            <Bar className={i % 2 ? 'w-1/3' : 'w-1/2'} />
            <Bar className="w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A row of summary tiles. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-black/[0.06] rounded-sm bg-white p-3 space-y-2">
          <Bar className="w-20" />
          <Bar className="h-6 w-12" />
        </div>
      ))}
    </div>
  )
}

/** A table: header line and rows. */
export function SkeletonTable({ rows = 10 }: { rows?: number }) {
  return (
    <div className="border border-black/[0.06] rounded-sm bg-white overflow-hidden">
      <div className="bg-black/[0.035] px-4 py-3 flex gap-6">
        {['w-32', 'w-20', 'w-16', 'w-16 hidden sm:block', 'w-12 hidden sm:block'].map((w, i) => <Bar key={i} className={cn('bg-black/[0.08]', w)} />)}
      </div>
      <div className="divide-y divide-black/[0.05]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 grid grid-cols-[2fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-6">
            <Bar className={i % 3 ? 'w-3/4' : 'w-1/2'} />
            <Bar className="w-2/3" />
            <Bar className="w-1/2" />
            <Bar className="w-2/3 hidden sm:block" />
            <Bar className="w-1/2 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** "Loading <page>…" with a spinner, shown only after a second. */
export function SlowNotice({ label }: { label: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 1000)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div role="status" aria-live="polite" className="h-6 flex items-center">
      {slow ? (
        <span className="inline-flex items-center gap-2 text-sm text-brand-navy whitespace-nowrap">
          <span aria-hidden="true" className="cc-spinner" />
          Loading {label}…
        </span>
      ) : (
        <span className="sr-only">Loading {label}…</span>
      )}
    </div>
  )
}

/** The frame every loading screen shares: width, title line, notice. */
export function PageSkeleton({
  label,
  width = 'max-w-[1400px]',
  children,
}: {
  label: string
  width?: string
  children: React.ReactNode
}) {
  return (
    <div aria-busy="true" className={cn('mx-auto px-4 py-4', width)}>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div className="space-y-2">
          <div className="text-2xl sm:text-3xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>{label}</div>
          <Bar className="w-72 max-w-[60vw]" />
        </div>
        <SlowNotice label={label} />
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
