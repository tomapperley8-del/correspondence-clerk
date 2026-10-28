'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { menuButtonClass } from '@/components/ui/action-menu'
import { COLUMN_DEFS, DEFAULT_COLUMNS, type ColumnKey } from './MastersheetTable'

// Choose the Businesses table's columns (Stage 13): tick to show or hide, Up
// and Down to reorder. The business name always comes first. The choice is
// kept in this browser and saved with "Save this view". Escape closes.
// Other tables (the Club Card tab, Stage 16b) pass their own `defs` and
// `defaults`; without them it lists the Businesses table's columns.

const btn =
  'text-xs font-semibold px-2 min-h-8 pointer-coarse:min-h-10 rounded-sm text-brand-navy hover:bg-brand-navy/[0.07] disabled:opacity-40 disabled:hover:bg-transparent'

export function ColumnChooser<K extends string = ColumnKey>({
  columns,
  onChange,
  widthsChanged,
  onResetWidths,
  defs = COLUMN_DEFS as unknown as { key: K; label: string }[],
  defaults = DEFAULT_COLUMNS as unknown as K[],
  firstLabel = 'Business',
}: {
  columns: K[]
  /** Null goes back to the standard columns. */
  onChange: (columns: K[] | null) => void
  widthsChanged?: boolean
  /** Leave out when the table has no adjustable widths. */
  onResetWidths?: () => void
  defs?: { key: K; label: string }[]
  defaults?: K[]
  /** The column that always comes first. */
  firstLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const hiddenCols = defs.filter((c) => !columns.includes(c.key))
  const label = (key: K) => defs.find((c) => c.key === key)?.label ?? key
  const move = (i: number, by: number) => {
    const next = [...columns]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
  }
  const isDefault = columns.length === defaults.length && columns.every((c, i) => c === defaults[i])

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className={`${menuButtonClass} text-brand-navy`}
        onClick={() => setOpen((o) => !o)}
      >
        Columns <span className="font-normal text-gray-600">{columns.length + 1}</span>
        <span aria-hidden="true" className="text-[10px]">▾</span>
      </button>
      {open && (
        <div
          id={`${id}-panel`}
          role="group"
          aria-label="Choose columns"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              button.current?.focus()
            }
          }}
          className="absolute right-0 top-full mt-1 z-[75] w-[19rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white border border-black/[0.12] rounded-sm shadow-[var(--shadow-lg)] p-2"
        >
          <p className="px-1 pb-1 text-xs text-gray-600">Tick to show, Up and Down to move. {firstLabel} always comes first.</p>
          <ol>
            {columns.map((key, i) => (
              <li key={key} className="flex items-center gap-1 py-0.5">
                <label className="flex items-center gap-2 flex-1 min-w-0 px-1 min-h-8 text-sm cursor-pointer">
                  <input type="checkbox" checked onChange={() => onChange(columns.filter((c) => c !== key))} className="accent-[var(--brand-navy)]" />
                  <span className="truncate">{label(key)}</span>
                </label>
                <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${label(key)} up`}>
                  Up
                </button>
                <button type="button" className={btn} disabled={i === columns.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${label(key)} down`}>
                  Down
                </button>
              </li>
            ))}
          </ol>
          {hiddenCols.length > 0 && (
            <>
              <p className="px-1 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 border-t border-black/[0.06] mt-1">Hidden</p>
              <ul>
                {hiddenCols.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-center gap-2 px-1 min-h-8 text-sm cursor-pointer">
                      <input type="checkbox" checked={false} onChange={() => onChange([...columns, c.key])} className="accent-[var(--brand-navy)]" />
                      <span className="text-gray-700">{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-1 border-t border-black/[0.06] mt-1 pt-1">
            <button type="button" className={btn} disabled={isDefault} onClick={() => onChange(null)}>
              Reset columns
            </button>
            {onResetWidths && (
              <button type="button" className={btn} disabled={!widthsChanged} onClick={onResetWidths}>
                Reset widths
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
