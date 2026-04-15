'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AutoFiledItem } from '@/app/actions/inbound-email'

interface Props {
  items: AutoFiledItem[]
}

function formatDateGB(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function AutoFiledSection({ items }: Props) {
  const [open, setOpen] = useState(true)

  if (items.length === 0) return null

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs flex items-center gap-1"
        style={{ color: 'rgba(0,0,0,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.15s' }}>▶</span>
        {items.length} auto-filed recently
      </button>

      {open && (
        <div
          className="mt-2 rounded bg-brand-paper"
          style={{ border: '1px solid rgba(0,0,0,0.06)' }}
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
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: item.direction === 'sent' ? 'rgba(124,154,94,0.12)' : 'rgba(44,74,110,0.1)',
                  color: item.direction === 'sent' ? '#7C9A5E' : '#2C4A6E',
                  flexShrink: 0,
                }}
              >
                {item.direction === 'sent' ? 'SENT' : 'RCVD'}
              </span>
              <Link
                href={`/businesses/${item.business_id}`}
                className="font-medium hover:underline flex-shrink-0"
                style={{ color: 'var(--brand-dark)' }}
              >
                {item.business_name}
              </Link>
              <span className="truncate flex-1">{item.subject ?? '(No subject)'}</span>
              <span className="flex-shrink-0">{formatDateGB(item.entry_date)}</span>
              <Link
                href={`/businesses/${item.business_id}#entry-${item.id}`}
                className="flex-shrink-0 hover:underline"
                style={{ color: 'var(--link-blue)' }}
              >
                Edit
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
