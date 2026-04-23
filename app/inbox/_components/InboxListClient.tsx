'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import InboxCard from './InboxCard'
import { bulkDiscardInboundEmails } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'
import type { InboundQueueItem } from '@/app/actions/inbound-email'
import type { Business } from '@/app/actions/businesses'

interface Props {
  items: InboundQueueItem[]
  businesses: Business[]
}

export default function InboxListClient({ items, businesses }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [discarding, setDiscarding] = useState(false)

  const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id))
  const someSelected = selectedIds.size > 0

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  async function handleBulkDiscard() {
    const ids = Array.from(selectedIds)
    setDiscarding(true)
    const result = await bulkDiscardInboundEmails(ids)
    setDiscarding(false)
    if (result.error) {
      toast.error(`Failed to discard: ${result.error}`)
    } else {
      toast.success(`${ids.length} ${ids.length === 1 ? 'email' : 'emails'} discarded`)
      setSelectedIds(new Set())
      router.refresh()
    }
  }

  return (
    <div>
      {/* Bulk actions toolbar — shown whenever ≥1 item exists */}
      <div
        className="flex items-center gap-3 mb-3 px-1"
        style={{ minHeight: 32 }}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            aria-label="Select all emails"
            className="cursor-pointer"
            style={{ accentColor: 'var(--brand-navy)', width: 15, height: 15 }}
          />
          {someSelected ? `${selectedIds.size} selected` : 'Select all'}
        </label>

        {someSelected && (
          <button
            onClick={handleBulkDiscard}
            disabled={discarding}
            className="px-3 py-1 text-sm font-medium rounded-sm transition-colors"
            style={{
              color: discarding ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(0,0,0,0.18)',
              cursor: discarding ? 'not-allowed' : 'pointer',
            }}
          >
            {discarding ? 'Discarding…' : `Discard ${selectedIds.size}`}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {items.map(item => (
          <InboxCard
            key={item.id}
            item={item}
            businesses={businesses}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleItem(item.id)}
          />
        ))}
      </div>
    </div>
  )
}
