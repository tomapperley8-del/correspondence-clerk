'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// A labelled "More" menu (UI overhaul Stage 14). Text label, never an icon on
// its own (Hard Rule 9). Keyboard: Enter, Space or Down opens it on the first
// item, Up on the last; arrows, Home and End move; Escape closes and returns to
// the button; Tab closes. Items can be grouped under a heading (Snooze ...).
// Reused by Today, the Businesses table (Stage 13), templates (Stage 8) and the
// business page and Inbox (Stage 14b).

export type MenuItem = {
  label: string
  /** Shown under the label in smaller text. */
  hint?: string
  onSelect?: () => void
  href?: string
  /** Opens in a new tab (a website page, Outlook). */
  external?: boolean
  disabled?: boolean
}

export type MenuEntry = MenuItem | { group: string; items: MenuItem[] }

export const menuButtonClass =
  'inline-flex items-center justify-center gap-1 text-xs font-semibold px-2.5 min-h-10 md:min-h-8 pointer-coarse:min-h-10 border border-black/[0.12] rounded-sm bg-white text-brand-navy hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

const itemClass =
  'w-full text-left block px-3 py-2 min-h-10 text-sm text-brand-dark hover:bg-brand-warm focus:bg-brand-warm focus:outline-none aria-disabled:opacity-50 aria-disabled:pointer-events-none'

export function ActionMenu({
  entries,
  label = 'More',
  accessibleLabel,
  className,
}: {
  entries: MenuEntry[]
  label?: string
  /** A fuller name for screen readers; must start with the visible label. */
  accessibleLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const startAt = useRef<'first' | 'last'>('first')
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])

  const close = (focusButton: boolean) => {
    setOpen(false)
    if (focusButton) button.current?.focus()
  }

  // Open above the button when there is no room below, and keep it inside the window sideways.
  useLayoutEffect(() => {
    if (!open || !menu.current || !wrap.current) return
    const b = wrap.current.getBoundingClientRect()
    const h = menu.current.offsetHeight
    const w = menu.current.offsetWidth
    const up = b.bottom + h + 8 > window.innerHeight && b.top - h - 8 > 0
    const right = b.right - w >= 8 || b.left + w > window.innerWidth - 8
    Object.assign(menu.current.style, {
      top: up ? 'auto' : 'calc(100% + 4px)',
      bottom: up ? 'calc(100% + 4px)' : 'auto',
      right: right ? '0' : 'auto',
      left: right ? 'auto' : '0',
    })
    const list = items()
    ;(startAt.current === 'last' ? list[list.length - 1] : list[0])?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function onMenuKey(e: React.KeyboardEvent) {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => {
      e.preventDefault()
      list[(n + list.length) % list.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') setOpen(false)
  }

  function choose(item: MenuItem) {
    if (item.disabled) return
    close(true)
    item.onSelect?.()
  }

  function renderItem(item: MenuItem, key: string) {
    const body = (
      <>
        {item.label}
        {item.hint && <span className="block text-xs text-gray-600">{item.hint}</span>}
      </>
    )
    if (item.href) {
      const props = {
        role: 'menuitem',
        tabIndex: -1,
        className: itemClass,
        'aria-disabled': item.disabled || undefined,
        onClick: () => setOpen(false),
      }
      return item.external ? (
        <a key={key} href={item.href} target="_blank" rel="noopener noreferrer" {...props}>
          {body}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <Link key={key} href={item.href} {...props}>{body}</Link>
      )
    }
    return (
      <button key={key} type="button" role="menuitem" tabIndex={-1} aria-disabled={item.disabled || undefined} className={itemClass} onClick={() => choose(item)}>
        {body}
      </button>
    )
  }

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        ref={button}
        type="button"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={accessibleLabel}
        className={cn(menuButtonClass, className)}
        onClick={() => { startAt.current = 'first'; setOpen((o) => !o) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            startAt.current = e.key === 'ArrowUp' ? 'last' : 'first'
            setOpen(true)
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">▾</span>
      </button>
      {open && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-button`}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute top-full right-0 mt-1 z-[75] min-w-[13rem] max-w-[calc(100vw-2rem)] py-1 bg-white border border-black/[0.12] rounded-sm shadow-[var(--shadow-lg)]',
          )}
        >
          {entries.map((entry, k) =>
            'group' in entry ? (
              <div key={`g${k}`} role="group" aria-labelledby={`${id}-g${k}`} className="border-t border-black/[0.06] first:border-t-0 mt-1 first:mt-0 pt-1">
                <p id={`${id}-g${k}`} role="presentation" className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  {entry.group}
                </p>
                {entry.items.map((item, j) => renderItem(item, `g${k}-${j}`))}
              </div>
            ) : (
              renderItem(entry, `i${k}`)
            ),
          )}
        </div>
      )}
    </div>
  )
}
