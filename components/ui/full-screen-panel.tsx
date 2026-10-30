'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { bandClass, bandStyle, type KindColour } from '@/components/ui/kind'

// A panel with a labelled "Full screen" button (UI overhaul Stage 14). Full
// screen fills the window over the page; "Exit full screen" or Escape returns,
// with focus back on the button. While it is open, Tab stays inside it.
// Children read useFullScreen() to use the room (taller calendar days, all rows).
// Reused by the Businesses table (Stage 13), the business page and Inbox (14b).
// With `band` (Stage 14d house style) the heading sits on a solid band in the
// box's colour, and buttons in it turn white.

const FullScreenContext = createContext(false)

/** True while the surrounding panel is in full screen. */
export function useFullScreen() {
  return useContext(FullScreenContext)
}

export const panelButtonClass =
  'inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 md:min-h-8 pointer-coarse:min-h-10 rounded-sm text-brand-navy hover:bg-brand-navy/[0.07] transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function FullScreenPanel({
  title,
  headingId,
  controls,
  children,
  className,
  id,
  card = true,
  band,
  bodyClassName,
}: {
  title: React.ReactNode
  headingId: string
  /** Extra buttons in the header, before "Full screen". */
  controls?: React.ReactNode
  /** Or a function of whether the panel is in full screen. */
  children: React.ReactNode | ((full: boolean) => React.ReactNode)
  className?: string
  id?: string
  /** Drawn as a white card on the page (default); full screen fills the window instead. */
  card?: boolean
  /** A coloured header band (house style); the body gets its own padding. */
  band?: KindColour
  /** Padding for the body under a band (default p-2.5 sm:p-3 on a card). */
  bodyClassName?: string
}) {
  const [full, setFull] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const enter = useRef<HTMLButtonElement>(null)
  const exit = useRef<HTMLButtonElement>(null)
  const wasFull = useRef(false)

  useEffect(() => {
    if (!full) {
      if (wasFull.current) enter.current?.focus()
      wasFull.current = false
      return
    }
    wasFull.current = true
    exit.current?.focus()
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setFull(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = before
      document.removeEventListener('keydown', onKey)
    }
  }, [full])

  function trapTab(e: React.KeyboardEvent) {
    if (!full || e.key !== 'Tab' || !panel.current) return
    const list = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    if (list.length === 0) return
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <FullScreenContext.Provider value={full}>
      <section
        ref={panel}
        id={id}
        aria-labelledby={headingId}
        role={full ? 'dialog' : undefined}
        aria-modal={full || undefined}
        onKeyDown={trapTab}
        className={cn(
          full
            ? 'fixed inset-0 m-0 z-[70] overflow-y-auto bg-brand-paper px-4 py-4 sm:px-8 sm:py-6'
            : cn(
                'min-w-0',
                card && 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]',
                card && !band && 'p-4 sm:p-5',
              ),
          className,
        )}
      >
        <div
          className={cn(
            'flex flex-wrap items-center gap-2',
            band ? cn(bandClass(band), 'px-3 py-1 rounded-sm', !full && card && 'rounded-b-none') : 'mb-2',
            full && 'mx-auto max-w-[1800px]',
          )}
          style={band ? bandStyle(band) : undefined}
        >
          <h2
            id={headingId}
            className={cn('leading-tight font-semibold mr-auto', band ? 'text-[1.35rem] text-white' : 'text-[1.6rem] text-brand-dark')}
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {title}
          </h2>
          <div className={cn('contents', band && 'cc-band-controls')}>
            {controls}
            {full ? (
              <button ref={exit} type="button" className={panelButtonClass} onClick={() => setFull(false)}>
                Exit full screen
              </button>
            ) : (
              <button ref={enter} type="button" className={panelButtonClass} onClick={() => setFull(true)}>
                Full screen
              </button>
            )}
          </div>
        </div>
        <div className={cn(full && 'mx-auto max-w-[1800px]', band && (bodyClassName ?? (card && !full ? 'p-2.5 sm:p-3' : 'pt-2')))}>
          {typeof children === 'function' ? children(full) : children}
        </div>
      </section>
    </FullScreenContext.Provider>
  )
}
