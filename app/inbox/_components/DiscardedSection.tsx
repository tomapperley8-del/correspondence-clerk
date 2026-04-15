'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { rescueDiscardedEmail } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'
import type { DiscardedQueueItem } from '@/app/actions/inbound-email'

interface Props {
  items: DiscardedQueueItem[]
}

function formatDateGB(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function DiscardedSection({ items: initialItems }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(initialItems)
  const [rescuing, setRescuing] = useState<string | null>(null)

  if (items.length === 0) return null

  const handleRescue = async (id: string) => {
    setRescuing(id)
    const result = await rescueDiscardedEmail(id)
    setRescuing(null)
    if (result.error) {
      toast.error(`Failed to rescue: ${result.error}`)
    } else {
      setItems(prev => prev.filter(i => i.id !== id))
      router.refresh()
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs flex items-center gap-1"
        style={{ color: 'rgba(0,0,0,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.15s' }}>▶</span>
        {items.length} filtered out
      </button>

      {open && (
        <div
          className="mt-2 rounded bg-brand-paper"
          style={{ border: '1px solid rgba(0,0,0,0.06)' }}
        >
          {items.map((item, i) => {
            const senderLabel = item.from_name && item.from_name !== item.from_email
              ? `${item.from_name} <${item.from_email}>`
              : item.from_email
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
                style={{
                  borderBottom: i < items.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                  color: 'rgba(0,0,0,0.45)',
                }}
              >
                <span className="flex-shrink-0 truncate" style={{ maxWidth: '180px' }}>{senderLabel}</span>
                <span className="truncate flex-1">{item.subject ?? '(No subject)'}</span>
                <span className="flex-shrink-0">{formatDateGB(item.received_at)}</span>
                <button
                  onClick={() => handleRescue(item.id)}
                  disabled={rescuing === item.id}
                  className="flex-shrink-0 text-xs px-2 py-1 rounded-sm"
                  style={{
                    border: '1px solid rgba(0,0,0,0.15)',
                    color: rescuing === item.id ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.5)',
                    background: 'white',
                    cursor: rescuing === item.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {rescuing === item.id ? '…' : 'Rescue'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
