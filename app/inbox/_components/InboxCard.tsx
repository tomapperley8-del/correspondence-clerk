'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BusinessSelector } from '@/components/BusinessSelector'
import { fileInboundEmail, discardInboundEmail } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'
import type { InboundQueueItem } from '@/app/actions/inbound-email'
import type { Business } from '@/app/actions/businesses'

interface Props {
  item: InboundQueueItem
  businesses: Business[]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hrs = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hrs}:${mins}`
}

export default function InboxCard({ item, businesses }: Props) {
  const router = useRouter()
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [filing, setFiling] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  const handleFile = async () => {
    if (!selectedBusinessId) return
    setFiling(true)
    const result = await fileInboundEmail(item.id, selectedBusinessId)
    setFiling(false)
    if (result.error) {
      toast.error(`Failed to file: ${result.error}`)
    } else {
      toast.success('Email filed')
      setVisible(false)
      router.refresh()
    }
  }

  const handleDiscard = async () => {
    setDiscarding(true)
    const result = await discardInboundEmail(item.id)
    setDiscarding(false)
    if (result.error) {
      toast.error(`Failed to discard: ${result.error}`)
    } else {
      setVisible(false)
      router.refresh()
    }
  }

  return (
    <div
      className="bg-white p-5 rounded"
      style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--brand-dark)' }}>
            {item.from_name && item.from_name !== item.from_email
              ? `${item.from_name} <${item.from_email}>`
              : item.from_email}
          </p>
          <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: 'var(--brand-dark)' }}>
            {item.subject ?? '(No subject)'}
          </p>
        </div>
        <p className="text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'rgba(0,0,0,0.4)' }}>
          {formatDate(item.received_at)}
        </p>
      </div>

      {/* Body preview */}
      {item.body_preview && (
        <p
          className="text-sm italic mb-4 line-clamp-3"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          {item.body_preview}
        </p>
      )}

      {/* Filing controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <BusinessSelector
            businesses={businesses}
            selectedBusinessId={selectedBusinessId}
            onSelect={setSelectedBusinessId}
            onAddNew={() => {
              // Navigate to new-entry which has the AddBusiness flow
              router.push('/new-entry')
            }}
          />
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleFile}
            disabled={!selectedBusinessId || filing}
            className="px-4 py-2 text-sm font-medium text-white rounded transition-colors"
            style={{
              backgroundColor: selectedBusinessId && !filing ? 'var(--brand-navy)' : 'rgba(0,0,0,0.2)',
              cursor: selectedBusinessId && !filing ? 'pointer' : 'not-allowed',
            }}
          >
            {filing ? 'Filing…' : 'File it'}
          </button>

          <button
            onClick={handleDiscard}
            disabled={discarding}
            className="px-4 py-2 text-sm font-medium rounded transition-colors"
            style={{
              color: discarding ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(0,0,0,0.15)',
              cursor: discarding ? 'not-allowed' : 'pointer',
            }}
          >
            {discarding ? 'Discarding…' : 'Discard'}
          </button>
        </div>
      </div>
    </div>
  )
}
