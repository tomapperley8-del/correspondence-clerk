'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BusinessSelector } from '@/components/BusinessSelector'
import { ContactSelector } from '@/components/ContactSelector'
import { getBusinesses, type Business } from '@/app/actions/businesses'
import { getContactsByBusiness } from '@/app/actions/contacts'
import { duplicateCorrespondence } from '@/app/actions/correspondence'
import { toast } from '@/lib/toast'
import type { Contact } from '@/app/actions/contacts'

interface Props {
  correspondenceId: string
  currentBusinessId: string
  onClose: () => void
}

export function DuplicateCorrespondenceModal({ correspondenceId, currentBusinessId, onClose }: Props) {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingBusinesses, setLoadingBusinesses] = useState(true)

  useEffect(() => {
    getBusinesses().then(result => {
      const all = (result.data ?? []) as Business[]
      setBusinesses(all.filter(b => b.id !== currentBusinessId))
      setLoadingBusinesses(false)
    })
  }, [currentBusinessId])

  const handleSelectBusiness = async (businessId: string) => {
    setSelectedBusinessId(businessId || null)
    setSelectedContactId(null)
    setContacts([])
    if (!businessId) return
    const result = await getContactsByBusiness(businessId)
    setContacts(result.data ?? [])
  }

  const handleDuplicate = async () => {
    if (!selectedBusinessId) return
    setSaving(true)
    const result = await duplicateCorrespondence(correspondenceId, selectedBusinessId, selectedContactId)
    setSaving(false)
    if (result.error) {
      toast.error(`Failed to copy: ${result.error}`)
    } else {
      const biz = businesses.find(b => b.id === selectedBusinessId)
      toast.success(`Copied to ${biz?.name ?? 'new business'}`)
      router.refresh()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-entry-title"
        className="bg-white p-6 max-w-md w-full mx-4 shadow-[var(--shadow-lg)]"
        style={{ border: '1px solid rgba(0,0,0,0.1)' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="duplicate-entry-title" className="text-lg font-bold" style={{ color: 'var(--brand-dark)' }}>
            Copy to another business
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
          Creates an independent copy on the target business. Both can be edited separately after copying.
        </p>

        {loadingBusinesses ? (
          <p className="text-sm text-gray-400">Loading businesses…</p>
        ) : (
          <div className="space-y-3">
            <BusinessSelector
              businesses={businesses}
              selectedBusinessId={selectedBusinessId}
              onSelect={handleSelectBusiness}
              onAddNew={() => {}}
            />

            {selectedBusinessId && (
              <ContactSelector
                contacts={contacts}
                selectedContactId={selectedContactId}
                onSelect={(id) => setSelectedContactId(id || null)}
                onAddNew={() => {}}
              />
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleDuplicate}
                disabled={!selectedBusinessId || saving}
                className={`px-4 py-2 text-sm font-medium text-white rounded-sm transition-colors ${selectedBusinessId && !saving ? 'bg-brand-navy hover:bg-brand-navy-hover cursor-pointer' : 'bg-black/20 cursor-not-allowed'}`}
              >
                {saving ? 'Copying…' : 'Copy entry'}
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
