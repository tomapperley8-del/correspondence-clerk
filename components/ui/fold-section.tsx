'use client'

import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { KIND, bandClass, bandStyle, type KindColour } from '@/components/ui/kind'

// One folded section with its count (Stage 14c, Decision 29 Oct "nothing out
// of sight"): every section of a page shows as a one-line heading, so they all
// sit on the first screen; opening one shows its rows, and long ones scroll
// inside it. Which sections are open is remembered in this browser under
// `cc.fold.<storageKey>`. The heading is a real button, so Enter and Space
// toggle it, and it carries aria-expanded. Used on Today and every tab.
//
// House style (Stage 14d): a page's main box (`big`) has a solid header band
// in its own colour (`band`); sections inside a box are plain lines, with a
// coloured edge for their kind (`kind`), no grey bars.

const STORE = 'cc.fold.'

/**
 * Open state for a folded section, remembered in this browser. `narrowOpen`
 * is the default below 1024px wide, where the page is one column. With
 * `anchorId`, a link to `#anchorId` (a summary tile) opens the section.
 */
export function useFold(storageKey: string, defaultOpen = false, narrowOpen?: boolean, anchorId?: string) {
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
  useEffect(() => {
    if (!anchorId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page was opened at this section
    if (window.location.hash === `#${anchorId}`) setOpen(true)
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest(`a[href="#${anchorId}"]`)) setOpen(true)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [anchorId])
  const toggle = () =>
    setOpen((o) => {
      try {
        window.localStorage.setItem(STORE + storageKey, o ? '0' : '1')
      } catch {
        // storage blocked
      }
      return !o
    })
  return [open, toggle, setOpen] as const
}

export function FoldSection({
  storageKey,
  title,
  count,
  badge,
  tone = 'plain',
  defaultOpen = false,
  narrowOpen,
  openOnMount = false,
  controls,
  hint,
  scroll = 'max-h-[45vh]',
  heading = 'h2',
  big = false,
  band = 'attention',
  kind,
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
  /** 'alert' marks the heading red (Overdue). */
  tone?: 'plain' | 'alert'
  defaultOpen?: boolean
  /** The default below 1024px wide, if different. */
  narrowOpen?: boolean
  /** Open whatever was saved, because a link asked for this section (?board=1). */
  openOnMount?: boolean
  /** Buttons beside the heading (Add, Download, Full screen), outside the toggle. */
  controls?: React.ReactNode
  /** One line under the heading while open. */
  hint?: React.ReactNode
  /** Height cap for the open body (it scrolls inside); '' for none. */
  scroll?: string
  heading?: 'h2' | 'h3'
  /** A page's main box: serif heading on a coloured band. */
  big?: boolean
  /** The band's colour for a main box (default the header's slate). */
  band?: KindColour
  /** For a plain-line section: a coloured edge for its kind. */
  kind?: KindColour
  id?: string
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const [open, toggle, setOpen] = useFold(storageKey, defaultOpen, narrowOpen, id)
  useEffect(() => {
    if (openOnMount) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, [])
  const bodyId = useId()
  const H = heading
  const alert = tone === 'alert'
  const hideShow = (
    <span className={cn('ml-auto pl-2 text-xs font-semibold hidden sm:inline', big ? 'text-white/90' : 'text-brand-navy')} style={{ fontFamily: 'var(--font-sans)' }}>
      {open ? 'Hide' : 'Show'}
    </span>
  )
  const chevron = (
    <span aria-hidden="true" className={cn('inline-block w-3 text-sm transition-transform duration-200 ease-out motion-reduce:transition-none', open && 'rotate-90')}>▸</span>
  )
  const countEl = count !== undefined && (
    <span className="tabular-nums font-normal text-sm" style={{ fontFamily: 'var(--font-sans)' }}>{count}</span>
  )
  const buttonBase =
    'w-full flex items-center gap-2 px-3 text-left font-semibold transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-inset'

  if (big) {
    return (
      <section id={id} className={cn('border border-black/[0.08] rounded-sm bg-white min-w-0', className)}>
        <div className={cn('flex items-center gap-1 pr-1.5 rounded-t-sm', bandClass(band), !open && 'rounded-b-sm')} style={bandStyle(band)}>
          <H className="flex-1 min-w-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={toggle}
              className={cn(buttonBase, 'min-h-11 md:min-h-10 pointer-coarse:min-h-11 text-lg hover:bg-white/10 focus-visible:ring-white')}
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {chevron}
              <span className="truncate">{title}</span>
              {countEl}
              {badge}
              {hideShow}
            </button>
          </H>
          {controls && <div className="cc-band-controls shrink-0 flex items-center gap-1">{controls}</div>}
        </div>
        <div id={bodyId} hidden={!open} className={cn(scroll && `${scroll} overflow-y-auto overscroll-contain`, bodyClassName)}>
          {hint && <p className="text-xs text-gray-700 px-3 pt-1.5">{hint}</p>}
          {open && children}
        </div>
      </section>
    )
  }

  // A section inside a box: a plain line, with its kind's colour as an edge.
  const edge = alert ? 'overdue' : kind
  return (
    <section id={id} className={cn('min-w-0 border-t border-black/[0.08] first:border-t-0', className)}>
      <div className={cn('flex items-center gap-1 pr-1 border-l-4', edge ? KIND[edge].edge : 'border-transparent')}>
        <H className="flex-1 min-w-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
            className={cn(
              buttonBase,
              'min-h-10 md:min-h-9 pointer-coarse:min-h-10 text-sm hover:bg-black/[0.035] focus-visible:ring-brand-navy',
              alert ? KIND.overdue.text : 'text-brand-dark',
            )}
          >
            {chevron}
            <span className="truncate">{title}</span>
            {countEl}
            {badge}
            {hideShow}
          </button>
        </H>
        {controls && <div className="shrink-0 flex items-center gap-1">{controls}</div>}
      </div>
      <div id={bodyId} hidden={!open} className={cn(scroll && `${scroll} overflow-y-auto overscroll-contain`, open && 'border-t border-black/[0.06]', bodyClassName)}>
        {hint && <p className="text-xs text-gray-700 px-3 pt-1.5">{hint}</p>}
        {open && children}
      </div>
    </section>
  )
}
