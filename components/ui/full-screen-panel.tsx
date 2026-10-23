'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// A panel with a labelled "Full screen" button (UI overhaul Stage 14). Full
// screen fills the window over the page; "Exit full screen" or Escape returns,
// with focus back on the button. While it is open, Tab stays inside it.
// Children read useFullScreen() to use the room (taller calendar days, all rows).
// Reused by the Businesses table (Stage 13), the business page and Inbox (14b).

const FullScreenContext = createContext(false)

/** True while the surrounding panel is in full screen. */
export function useFullScreen() {
  return useContext(FullScreenContext)
}

export const panelButtonClass =
  'inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 md:min-h-8 pointer-coarse:min-h-10 border border-black/[0.12] rounded-sm bg-white text-brand-navy hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function FullScreenPanel({
  title,
  headingId,
  controls,
  children,
  className,
  id,
}: {
  title: React.ReactNode
  headingId: string
  /** Extra buttons in the header, before "Full screen". */
  controls?: React.ReactNode
  /** Or a function of whether the panel is in full screen. */
  children: React.ReactNode | ((full: boolean) => React.ReactNode)
  className?: string
  id?: string
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
          full ? 'fixed inset-0 m-0 z-[70] overflow-y-auto bg-brand-paper px-4 py-4 sm:px-8 sm:py-6' : 'min-w-0',
          className,
        )}
      >
        <div className={cn('flex flex-wrap items-center gap-2 mb-2', full && 'mx-auto max-w-[1800px]')}>
          <h2 id={headingId} className="text-2xl font-semibold text-brand-dark mr-auto" style={{ fontFamily: 'var(--font-serif)' }}>
            {title}
          </h2>
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
        <div className={cn(full && 'mx-auto max-w-[1800px]')}>{typeof children === 'function' ? children(full) : children}</div>
      </section>
    </FullScreenContext.Provider>
  )
}
