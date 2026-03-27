'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BusinessSelector } from '@/components/BusinessSelector'
import { ContactSelector } from '@/components/ContactSelector'
import { AddBusinessModal } from '@/components/AddBusinessModal'
import { AddContactModal } from '@/components/AddContactModal'
import { fileInboundEmail, discardInboundEmail } from '@/app/actions/inbound-email'
import { getContactsByBusiness } from '@/app/actions/contacts'
import { toast } from '@/lib/toast'
import type { InboundQueueItem } from '@/app/actions/inbound-email'
import type { Business } from '@/app/actions/businesses'
import type { Contact } from '@/app/actions/contacts'

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

// Strip URLs and HTML artifacts from body preview
function cleanPreview(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')       // remove URLs
    .replace(/\[.*?\]/g, '')               // remove [link text] artifacts
    .replace(/\s{2,}/g, ' ')              // collapse whitespace
    .trim()
}

export default function InboxCard({ item, businesses: initialBusinesses }: Props) {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>(initialBusinesses)
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [filing, setFiling] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [visible, setVisible] = useState(true)
  const [showAddBusiness, setShowAddBusiness] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)

  if (!visible) return null

  const handleSelectBusiness = async (businessId: string) => {
    setSelectedBusinessId(businessId || null)
    setSelectedContactId(null)
    setContacts([])
    if (!businessId) return
    setLoadingContacts(true)
    const result = await getContactsByBusiness(businessId)
    setContacts(result.data ?? [])
    setLoadingContacts(false)
  }

  const handleFile = async () => {
    if (!selectedBusinessId) return
    setFiling(true)
    const result = await fileInboundEmail(item.id, selectedBusinessId, selectedContactId)
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

  const preview = cleanPreview(item.body_preview ?? '')

  return (
    <>
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
        {preview && (
          <p
            className="text-sm italic mb-4 line-clamp-2"
            style={{ color: 'rgba(0,0,0,0.55)' }}
          >
            {preview}
          </p>
        )}

        {/* Filing controls — stacked vertically */}
        <div className="space-y-3">
          <BusinessSelector
            businesses={businesses}
            selectedBusinessId={selectedBusinessId}
            onSelect={handleSelectBusiness}
            onAddNew={() => setShowAddBusiness(true)}
          />

          {selectedBusinessId && (
            <ContactSelector
              contacts={contacts}
              selectedContactId={selectedContactId}
              onSelect={(id) => setSelectedContactId(id || null)}
              onAddNew={() => setShowAddContact(true)}
              disabled={loadingContacts}
            />
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleFile}
              disabled={!selectedBusinessId || filing}
              className="px-4 py-2 text-sm font-medium text-white rounded-sm transition-colors"
              style={{
                backgroundColor: selectedBusinessId && !filing ? '#2C4A6E' : 'rgba(0,0,0,0.2)',
                cursor: selectedBusinessId && !filing ? 'pointer' : 'not-allowed',
              }}
            >
              {filing ? 'Filing…' : 'File it'}
            </button>

            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="px-4 py-2 text-sm font-medium rounded-sm transition-colors"
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

      <AddBusinessModal
        isOpen={showAddBusiness}
        onClose={() => setShowAddBusiness(false)}
        onBusinessAdded={(business) => {
          setBusinesses((prev) => [...prev, business])
          setShowAddBusiness(false)
          handleSelectBusiness(business.id)
        }}
      />

      {selectedBusinessId && (
        <AddContactModal
          isOpen={showAddContact}
          onClose={() => setShowAddContact(false)}
          businessId={selectedBusinessId}
          initialEmail={item.from_email}
          onContactAdded={(contact) => {
            setContacts((prev) => [...prev, contact])
            setSelectedContactId(contact.id)
            setShowAddContact(false)
          }}
        />
      )}
    </>
  )
}
