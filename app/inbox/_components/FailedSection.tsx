'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { retryDeadLetter } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'
import type { DeadLetterItem } from '@/app/actions/inbound-email'

interface Props {
  items: DeadLetterItem[]
}

const FAILURE_POINT_LABELS: Record<string, string> = {
  auto_file_sent: 'Auto-file (sent)',
  auto_file_received: 'Auto-file (received)',
  queue_sent: 'Queue (sent)',
  queue_received: 'Queue (received)',
}

function formatDateGB(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function FailedSection({ items: initialItems }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(initialItems)
  const [retrying, setRetrying] = useState<string | null>(null)

  if (items.length === 0) return null

  const handleRetry = async (id: string) => {
    setRetrying(id)
    const result = await retryDeadLetter(id)
    setRetrying(null)
    if (result.error) {
      toast.error(`Retry failed: ${result.error}`)
    } else {
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success('Email re-queued — check your inbox')
      router.refresh()
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs flex items-center gap-1"
        style={{ color: 'rgba(180,0,0,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.15s' }}>▶</span>
        {items.length} failed to save
      </button>

      {open && (
        <div
          className="mt-2 rounded bg-brand-paper"
          style={{ border: '1px solid rgba(180,0,0,0.15)' }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5 text-xs"
              style={{
                borderBottom: i < items.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                color: 'rgba(0,0,0,0.55)',
              }}
            >
              <span className="flex-shrink-0 truncate" style={{ maxWidth: '150px' }}>
                {item.from_email ?? '(unknown sender)'}
              </span>
              <span className="truncate flex-1">{item.subject ?? '(No subject)'}</span>
              <span
                className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-sm"
                style={{ background: 'rgba(180,0,0,0.07)', color: 'rgba(140,0,0,0.6)' }}
                title={item.failure_reason}
              >
                {FAILURE_POINT_LABELS[item.failure_point] ?? item.failure_point}
              </span>
              <span className="flex-shrink-0" style={{ color: 'rgba(0,0,0,0.35)' }}>
                {formatDateGB(item.created_at)}
              </span>
              <button
                onClick={() => handleRetry(item.id)}
                disabled={retrying === item.id}
                className="flex-shrink-0 text-xs px-2 py-1 rounded-sm"
                style={{
                  border: '1px solid rgba(0,0,0,0.15)',
                  color: retrying === item.id ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.5)',
                  background: 'white',
                  cursor: retrying === item.id ? 'not-allowed' : 'pointer',
                }}
              >
                {retrying === item.id ? '…' : 'Retry'}
              </button>
            </div>
          ))}
          <p
            className="px-4 py-2 text-xs"
            style={{ color: 'rgba(0,0,0,0.35)', borderTop: '1px solid rgba(0,0,0,0.05)' }}
          >
            Retry re-queues the email into your inbox for manual filing.
          </p>
        </div>
      )}
    </div>
  )
}
