'use client'

import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'

// One folded section with its count (Stage 14c, Decision 29 Oct "nothing out
// of sight"): every section of a page shows as a one-line heading, so they all
// sit on the first screen; opening one shows its rows, and long ones scroll
// inside it. Which sections are open is remembered in this browser under
// `cc.fold.<storageKey>`. The heading is a real button, so Enter and Space
// toggle it, and it carries aria-expanded. Used on Today and every tab.

const STORE = 'cc.fold.'

/**
 * Open state for a folded section, remembered in this browser. `narrowOpen`
 * is the default below 1024px wide, where the page is one column.
 */
export function useFold(storageKey: string, defaultOpen = false, narrowOpen?: boolean) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE + storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of a saved preference on mount
      if (saved !== null) setOpen(saved === '1')
      else if (narrowOpen !== undefined && !window.matchMedia('(min-width: 1024px)').matches) setOpen(narrowOpen)
    } catch {
      // storage blocked: keep the default
    }
  }, [storageKey, narrowOpen])
  const toggle = () =>
    setOpen((o) => {
      try {
        window.localStorage.setItem(STORE + storageKey, o ? '0' : '1')
      } catch {
        // storage blocked
      }
      return !o
    })
  return [open, toggle] as const
}

export function FoldSection({
  storageKey,
  title,
  count,
  badge,
  tone = 'plain',
  defaultOpen = false,
  narrowOpen,
  controls,
  hint,
  scroll = 'max-h-[45vh]',
  heading = 'h2',
  big = false,
  id,
  className,
  bodyClassName,
  children,
}: {
  storageKey: string
  title: React.ReactNode
  /** Shown after the title; leave out when the section has nothing to count. */
  count?: number | string
  /** A small pill after the count, such as "2 overdue". */
  badge?: React.ReactNode
  /** 'alert' tints the heading red (Overdue). */
  tone?: 'plain' | 'alert'
  defaultOpen?: boolean
  /** The default below 1024px wide, if different. */
  narrowOpen?: boolean
  /** Buttons beside the heading (Add, Download, Full screen), outside the toggle. */
  controls?: React.ReactNode
  /** One line under the heading while open. */
  hint?: React.ReactNode
  /** Height cap for the open body (it scrolls inside); '' for none. */
  scroll?: string
  heading?: 'h2' | 'h3'
  /** Serif heading, for a page's main boxes. */
  big?: boolean
  id?: string
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const [open, toggle] = useFold(storageKey, defaultOpen, narrowOpen)
  const bodyId = useId()
  const H = heading
  return (
    <section id={id} className={cn('border border-black/[0.08] rounded-sm bg-white min-w-0', className)}>
      <div className={cn('flex items-center gap-1 pr-1', tone === 'alert' ? 'bg-ms-red/40' : 'bg-brand-warm', open && 'border-b border-black/[0.06]')}>
        <H className="flex-1 min-w-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
            className={cn(
              'w-full flex items-center gap-2 px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 text-left font-semibold transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy',
              tone === 'alert' ? 'text-ms-red-text hover:bg-ms-red/30' : 'text-brand-dark hover:bg-ms-green/40',
              big ? 'text-lg' : 'text-sm',
            )}
            style={big ? { fontFamily: 'var(--font-serif)' } : undefined}
          >
            <span aria-hidden="true" className={cn('inline-block w-3 text-sm transition-transform duration-200 ease-out motion-reduce:transition-none', open && 'rotate-90')}>▸</span>
            <span className="truncate">{title}</span>
            {count !== undefined && <span className="tabular-nums font-normal text-sm" style={{ fontFamily: 'var(--font-sans)' }}>{count}</span>}
            {badge}
            <span className="ml-auto pl-2 text-xs font-semibold text-brand-navy hidden sm:inline" style={{ fontFamily: 'var(--font-sans)' }}>{open ? 'Hide' : 'Show'}</span>
          </button>
        </H>
        {controls && <div className="shrink-0 flex items-center gap-1">{controls}</div>}
      </div>
      <div id={bodyId} hidden={!open} className={cn(scroll && `${scroll} overflow-y-auto overscroll-contain`, bodyClassName)}>
        {hint && <p className="text-xs text-gray-700 px-3 pt-1.5">{hint}</p>}
        {open && children}
      </div>
    </section>
  )
}
