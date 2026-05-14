'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BusinessSelector } from '@/components/BusinessSelector'
import { getBusinesses, type Business } from '@/app/actions/businesses'
import { linkCorrespondenceToBusiness } from '@/app/actions/correspondence'
import { toast } from '@/lib/toast'

interface Props {
  correspondenceId: string
  currentBusinessId: string
  linkedBusinessIds: string[]
  onClose: () => void
}

export function LinkCorrespondenceModal({ correspondenceId, currentBusinessId, linkedBusinessIds, onClose }: Props) {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingBusinesses, setLoadingBusinesses] = useState(true)

  useEffect(() => {
    getBusinesses().then(result => {
      const all = (result.data ?? []) as Business[]
      // Exclude current primary + already linked
      const excluded = new Set([currentBusinessId, ...linkedBusinessIds])
      setBusinesses(all.filter(b => !excluded.has(b.id)))
      setLoadingBusinesses(false)
    })
  }, [currentBusinessId, linkedBusinessIds])

  const handleLink = async () => {
    if (!selectedBusinessId) return
    setSaving(true)
    const result = await linkCorrespondenceToBusiness(correspondenceId, selectedBusinessId)
    setSaving(false)
    if (result.error) {
      toast.error(`Failed to link: ${result.error}`)
    } else {
      const biz = businesses.find(b => b.id === selectedBusinessId)
      toast.success(`Linked to ${biz?.name ?? 'business'} — entry now appears on both pages`)
      router.refresh()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-entry-title"
        className="bg-white p-6 max-w-md w-full mx-4 shadow-[var(--shadow-lg)]"
        style={{ border: '1px solid rgba(0,0,0,0.1)' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="link-entry-title" className="text-lg font-bold" style={{ color: 'var(--brand-dark)' }}>
            Link to another business
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm font-medium"
          >
            Close
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          This entry will appear on both business pages as a shared record. Edits are reflected everywhere — it stays one entry.
        </p>

        {loadingBusinesses ? (
          <p className="text-sm text-gray-400">Loading businesses…</p>
        ) : businesses.length === 0 ? (
          <p className="text-sm text-gray-400">No other businesses available to link to.</p>
        ) : (
          <div className="space-y-3">
            <BusinessSelector
              businesses={businesses}
              selectedBusinessId={selectedBusinessId}
              onSelect={(id) => setSelectedBusinessId(id || null)}
              onAddNew={() => {}}
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleLink}
                disabled={!selectedBusinessId || saving}
                className={`px-4 py-2 text-sm font-medium text-white rounded-sm transition-colors ${selectedBusinessId && !saving ? 'bg-brand-navy hover:bg-brand-navy-hover cursor-pointer' : 'bg-black/20 cursor-not-allowed'}`}
              >
                {saving ? 'Linking…' : 'Link entry'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-sm"
                style={{ color: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,0,0,0.15)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
