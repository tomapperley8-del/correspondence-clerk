'use client'

import { cn } from '@/lib/utils'

// Filter chips with counts (UI overhaul Stage 14): one is chosen at a time.
// Toggle buttons with aria-pressed, so the choice is said in words and shown
// by a filled chip and a tick, not by colour alone.

export type Chip<K extends string> = { key: K; label: string; count: number }

export function FilterChips<K extends string>({
  chips,
  value,
  onChange,
  label,
  className,
}: {
  chips: Chip<K>[]
  value: K
  onChange: (key: K) => void
  /** What the chips filter, for screen readers ("Show"). */
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {chips.map((c) => {
        const on = c.key === value
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            aria-label={`${c.label}, ${c.count}`}
            onClick={() => onChange(c.key)}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-semibold px-3 min-h-10 md:min-h-8 pointer-coarse:min-h-10 rounded-full border transition-colors duration-200 ease-out whitespace-nowrap',
              on ? 'bg-brand-navy border-brand-navy text-white' : 'bg-white border-black/[0.12] text-brand-dark hover:bg-brand-warm',
            )}
          >
            {on && <span aria-hidden="true">✓</span>}
            {c.label}
            <span className={cn('tabular-nums font-normal', on ? 'text-white' : 'text-gray-600')}>{c.count}</span>
          </button>
        )
      })}
    </div>
  )
}
