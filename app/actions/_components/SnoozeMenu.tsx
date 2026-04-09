'use client'

import { useEffect, useRef } from 'react'

type SnoozeMenuProps = {
  open: boolean
  onToggle: () => void
  onSnooze: (days: number) => void
  disabled: boolean
}

export function SnoozeMenu({ open, onToggle, onSnooze, disabled }: SnoozeMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        Snooze ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 shadow-md z-10">
          {[{ label: '3 days', days: 3 }, { label: '1 week', days: 7 }, { label: '1 month', days: 30 }].map(({ label, days }) => (
            <button
              key={days}
              onClick={() => onSnooze(days)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
