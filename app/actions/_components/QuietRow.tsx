'use client'

import Link from 'next/link'
import { LogPanel } from './LogPanel'
import type { BusinessItem, Badge } from '../_types'

type QuietRowProps = {
  item: BusinessItem & { badge: Badge; urgencyScore: number; badgeLabel: string }
  logOpen: boolean
  onLogToggle: () => void
  onLogSave: (markDone: boolean) => void
  onDone: () => void
}

export function QuietRow({ item, logOpen, onLogToggle, onLogSave, onDone }: QuietRowProps) {
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/businesses/${item.business_id}?from=actions`}
              className="font-medium text-gray-900 hover:text-brand-navy hover:underline text-sm"
              onClick={e => e.stopPropagation()}
            >
              {item.business_name}
            </Link>
            <span className="text-xs text-gray-400">{item.badgeLabel}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{item.entry_count} {item.entry_count === 1 ? 'entry' : 'entries'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDone() }}
            className="px-2.5 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={e => { e.stopPropagation(); onLogToggle() }}
            className={`px-2.5 py-1 text-xs font-medium border transition-colors ${logOpen ? 'bg-brand-navy border-brand-navy text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Log
          </button>
        </div>
      </div>
      {logOpen && (
        <LogPanel
          businessId={item.business_id}
          contactId={null}
          showMarkDone={false}
          onSave={onLogSave}
          onCancel={onLogToggle}
        />
      )}
    </div>
  )
}
