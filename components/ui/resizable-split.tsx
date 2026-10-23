'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Two columns with a draggable divider (UI overhaul Stage 14). From the `lg`
// width up; below that the columns stack, the first one on top. Drag the
// divider, or Tab to it and use the arrow keys (Home and End for the limits);
// it says the left column's share. "Reset size" goes back to the default. The
// size is remembered in this browser under `storageKey`.

const STEP = 2

export function ResizableSplit({
  first,
  second,
  storageKey,
  defaultPercent = 58,
  min = 35,
  max = 75,
  label = 'Resize the columns',
}: {
  first: React.ReactNode
  second: React.ReactNode
  storageKey: string
  defaultPercent?: number
  min?: number
  max?: number
  label?: string
}) {
  const [pct, setPct] = useState(defaultPercent)
  const [dragging, setDragging] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)))

  // Browser storage is read after the first paint, so the server and the browser agree on the first render.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(storageKey))
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of a saved preference on mount
      if (saved >= min && saved <= max) setPct(saved)
    } catch {
      // storage blocked: keep the default
    }
  }, [storageKey, min, max])

  const save = (n: number) => {
    setPct(n)
    try {
      if (n === defaultPercent) window.localStorage.removeItem(storageKey)
      else window.localStorage.setItem(storageKey, String(n))
    } catch {
      // storage blocked: the size lasts until the page is left
    }
  }

  function fromPointer(clientX: number) {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0) return pct
    return clamp(((clientX - r.left) / r.width) * 100)
  }

  return (
    <div>
      {pct !== defaultPercent && (
        <div className="hidden lg:flex justify-end -mt-1 mb-2">
          <button
            type="button"
            onClick={() => save(defaultPercent)}
            className="text-xs font-semibold text-brand-navy hover:underline px-1 min-h-8"
          >
            Reset size
          </button>
        </div>
      )}
      <div
        ref={box}
        className={cn('flex flex-col gap-8 lg:grid lg:gap-0 lg:[grid-template-columns:var(--split-a)_1.5rem_minmax(0,1fr)]', dragging && 'select-none')}
        style={{ '--split-a': `minmax(0, ${pct}%)` } as React.CSSProperties}
      >
        <div className="min-w-0">{first}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={pct}
          aria-valuetext={`Left column ${pct}% of the width`}
          tabIndex={0}
          title="Drag to resize, or use the arrow keys"
          className="hidden lg:flex group justify-center cursor-col-resize touch-none rounded-sm"
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }}
          onPointerMove={(e) => {
            if (dragging) setPct(fromPointer(e.clientX))
          }}
          onPointerUp={(e) => {
            if (!dragging) return
            setDragging(false)
            save(fromPointer(e.clientX))
          }}
          onDoubleClick={() => save(defaultPercent)}
          onKeyDown={(e) => {
            const to =
              e.key === 'ArrowLeft' ? pct - STEP : e.key === 'ArrowRight' ? pct + STEP : e.key === 'Home' ? min : e.key === 'End' ? max : null
            if (to === null) return
            e.preventDefault()
            save(clamp(to))
          }}
        >
          <span aria-hidden="true" className="relative block w-px h-full">
            <span
              className={cn(
                'absolute inset-0 transition-colors duration-200 ease-out',
                dragging ? 'bg-brand-navy' : 'bg-black/[0.08] group-hover:bg-brand-navy/60 group-focus-visible:bg-brand-navy',
              )}
            />
            {/* A grip that stays in view while the page scrolls */}
            <span
              className={cn(
                'sticky top-[45vh] -ml-[3px] block w-[7px] h-10 rounded-full border transition-colors duration-200 ease-out',
                dragging ? 'bg-brand-navy border-brand-navy' : 'bg-white border-black/[0.2] group-hover:border-brand-navy group-focus-visible:border-brand-navy',
              )}
            />
          </span>
        </div>
        <div className="min-w-0">{second}</div>
      </div>
    </div>
  )
}
