'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BusinessSelector } from '@/components/BusinessSelector'
import { ContactSelector } from '@/components/ContactSelector'
import { AddBusinessModal } from '@/components/AddBusinessModal'
import { AddContactModal } from '@/components/AddContactModal'
import { fileInboundEmail, discardInboundEmail, findEmailMatch, blockSenderEmail } from '@/app/actions/inbound-email'
import { getContactsByBusiness } from '@/app/actions/contacts'
import { isPersonalDomain } from '@/lib/inbound/utils'
import { toast } from '@/lib/toast'
import type { InboundQueueItem } from '@/app/actions/inbound-email'
import type { Business } from '@/app/actions/businesses'
import type { Contact } from '@/app/actions/contacts'

interface Props {
  item: InboundQueueItem
  businesses: Business[]
  isSelected?: boolean
  onToggleSelect?: () => void
}

// Derive a human-readable business name from an email address domain.
// e.g. 'info@sipsmith.co.uk' → 'Sipsmith', 'hello@my-company.com' → 'My Company'
function domainToBusinessName(email: string): string {
  const domain = email.split('@')[1] ?? ''
  if (!domain) return ''
  // Strip leading www.
  let base = domain.replace(/^www\./i, '')
  // Strip known TLDs (order matters — multi-part first)
  base = base.replace(/\.(co\.uk|org\.uk|me\.uk|net\.uk|gov\.uk|ac\.uk|ltd\.uk|plc\.uk)$/i, '')
  base = base.replace(/\.(com|org|net|io|co|uk|de|fr|es|it|nl|au|ca|us|info|biz|app|dev)$/i, '')
  // Replace separators with spaces and title-case
  return base
    .replace(/[-_.]/g, ' ')
    .replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .trim()
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

export default function InboxCard({ item, businesses: initialBusinesses, isSelected, onToggleSelect }: Props) {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>(initialBusinesses)
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState<string>(
    item.to_emails?.[0]?.email ?? ''
  )
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [filing, setFiling] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [visible, setVisible] = useState(true)
  const [showAddBusiness, setShowAddBusiness] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [showFullBody, setShowFullBody] = useState(false)

  const isSent = item.direction === 'sent'

  // On mount: look up the sender/recipient email against contacts + businesses.
  // - Definite contact match (contactId non-null) → auto-file immediately, no user action needed.
  // - Business-only match → pre-select the business so user just hits "File it".
  useEffect(() => {
    const emailToLookup = isSent ? (item.to_emails?.[0]?.email ?? '') : item.from_email
    if (!emailToLookup) return

    findEmailMatch(emailToLookup).then(async match => {
      if (!match) return

      if (match.contactId) {
        const result = await fileInboundEmail(item.id, match.businessId, match.contactId)
        if (!result.error) {
          toast.success(`Auto-filed to ${match.businessName}`)
          setVisible(false)
          router.refresh()
          return
        }
        // Filing failed — fall through to pre-select so user can retry manually
      }

      handleSelectBusiness(match.businessId)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible) return null

  // Suppress "Add X as new business" suggestion for personal email domains (gmail, hotmail, etc.)
  const fromDomain = item.from_email.split('@')[1] ?? ''
  const suggestedBusinessName = !isSent && !isPersonalDomain(fromDomain)
    ? domainToBusinessName(item.from_email)
    : ''

  const handleSelectBusiness = async (businessId: string) => {
    setSelectedBusinessId(businessId || null)
    setSelectedContactId(null)
    setContacts([])
    if (!businessId) return
    setLoadingContacts(true)
    const result = await getContactsByBusiness(businessId)
    const loaded = result.data ?? []
    setContacts(loaded)
    setLoadingContacts(false)

    // Auto-match contact from sender (received) or current recipient (sent)
    const emailToMatch = isSent ? selectedRecipientEmail : item.from_email
    if (emailToMatch) {
      const match = loaded.find(c =>
        (c.emails as string[] | null)?.some(
          e => e.toLowerCase() === emailToMatch.toLowerCase()
        )
      )
      if (match) setSelectedContactId(match.id)
    }
  }

  const handleRecipientChange = (email: string) => {
    setSelectedRecipientEmail(email)
    setSelectedContactId(null)
    // Auto-match contact for the newly selected recipient
    if (email && contacts.length > 0) {
      const match = contacts.find(c =>
        (c.emails as string[] | null)?.some(e => e.toLowerCase() === email.toLowerCase())
      )
      if (match) setSelectedContactId(match.id)
    }
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

  const handleBlock = async () => {
    const senderEmail = isSent ? (item.to_emails?.[0]?.email ?? '') : item.from_email
    if (!senderEmail) return
    setBlocking(true)
    const result = await blockSenderEmail(senderEmail, item.id)
    setBlocking(false)
    if (result.error) {
      toast.error(`Failed to block: ${result.error}`)
    } else {
      toast.success(`${senderEmail} blocked — future emails will be discarded`)
      setVisible(false)
      router.refresh()
    }
  }

  const preview = cleanPreview(item.body_preview ?? '')
  const fullBody = cleanPreview(item.body_text ?? '')
  const hasMoreBody = fullBody.length > preview.length + 20

  // Recipient label: for sent emails show who was emailed, for received show sender
  const senderLabel = isSent
    ? null
    : (item.from_name && item.from_name !== item.from_email
        ? `${item.from_name} <${item.from_email}>`
        : item.from_email)

  const directionBadgeStyle = {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    padding: '2px 7px',
    borderRadius: '3px',
    background: isSent ? 'rgba(124,154,94,0.12)' : 'rgba(44,74,110,0.1)',
    color: isSent ? '#7C9A5E' : '#2C4A6E',
  }

  return (
    <>
      <div
        className="bg-white rounded flex gap-3"
        style={{
          border: isSelected ? '1px solid rgba(44,74,110,0.35)' : '1px solid rgba(0,0,0,0.08)',
          boxShadow: 'var(--shadow-sm)',
          background: isSelected ? 'rgba(44,74,110,0.03)' : 'white',
        }}
      >
        {/* Checkbox column */}
        {onToggleSelect && (
          <div className="flex items-start pt-5 pl-4 pr-0">
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={onToggleSelect}
              aria-label="Select email"
              className="mt-0.5 cursor-pointer"
              style={{ accentColor: 'var(--brand-navy)', width: 15, height: 15 }}
            />
          </div>
        )}
        <div className="flex-1 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span style={directionBadgeStyle}>{isSent ? 'SENT TO' : 'RECEIVED FROM'}</span>
              {senderLabel && (
                <p className="font-medium text-sm truncate" style={{ color: 'var(--brand-dark)' }}>
                  {senderLabel}
                </p>
              )}
              {isSent && item.to_emails && item.to_emails.length > 0 && (
                <p className="font-medium text-sm truncate" style={{ color: 'var(--brand-dark)' }}>
                  {item.to_emails.map(r => r.name && r.name !== r.email ? `${r.name} <${r.email}>` : r.email).join(', ')}
                </p>
              )}
            </div>
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-dark)' }}>
              {item.subject ?? '(No subject)'}
            </p>
          </div>
          <p className="text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'rgba(0,0,0,0.4)' }}>
            {formatDate(item.received_at)}
          </p>
        </div>

        {/* Body preview / full body */}
        {!showFullBody && (
          <div className="mb-3">
            {preview && (
              <p className="text-sm italic line-clamp-1 mb-1" style={{ color: 'rgba(0,0,0,0.55)' }}>
                {preview}
              </p>
            )}
            <div className="flex items-center gap-2">
              <p className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
                AI will format this when filed
              </p>
              {hasMoreBody && (
                <button
                  onClick={() => setShowFullBody(true)}
                  className="text-xs"
                  style={{ color: 'var(--link-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Show full email
                </button>
              )}
            </div>
          </div>
        )}
        {showFullBody && fullBody && (
          <div className="mb-3">
            <p
              className="text-sm whitespace-pre-wrap"
              style={{
                color: 'rgba(0,0,0,0.7)',
                background: 'rgba(0,0,0,0.02)',
                border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: '4px',
                padding: '10px 12px',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {fullBody}
            </p>
            <button
              onClick={() => setShowFullBody(false)}
              className="text-xs mt-1"
              style={{ color: 'var(--link-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Show less
            </button>
          </div>
        )}

        {/* Filing controls */}
        <div className="space-y-3">
          {/* Recipient picker for sent emails */}
          {isSent && item.to_emails && item.to_emails.length > 1 && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(0,0,0,0.5)' }}>
                File against recipient
              </label>
              <select
                value={selectedRecipientEmail}
                onChange={e => handleRecipientChange(e.target.value)}
                className="w-full text-sm rounded-sm px-3 py-2"
                style={{
                  border: '1px solid rgba(0,0,0,0.15)',
                  color: 'var(--brand-dark)',
                  background: 'white',
                }}
              >
                {item.to_emails.map(r => (
                  <option key={r.email} value={r.email}>
                    {r.name && r.name !== r.email ? `${r.name} <${r.email}>` : r.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!selectedBusinessId && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
              {suggestedBusinessName && <span>Suggested:</span>}
              <button
                onClick={() => setShowAddBusiness(true)}
                style={{ color: 'var(--link-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
              >
                {suggestedBusinessName ? `+ Add ${suggestedBusinessName} as new business` : '+ Add new business'}
              </button>
            </div>
          )}

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
            />
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleFile}
              disabled={!selectedBusinessId || filing}
              className={`px-4 py-2 text-sm font-medium text-white rounded-sm transition-colors ${selectedBusinessId && !filing ? 'bg-brand-navy hover:bg-brand-navy-hover cursor-pointer' : 'bg-black/20 cursor-not-allowed'}`}
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

            {!isSent && (
              <button
                onClick={handleBlock}
                disabled={blocking}
                className="px-4 py-2 text-sm font-medium rounded-sm transition-colors"
                style={{
                  color: blocking ? 'rgba(0,0,0,0.3)' : 'rgba(180,0,0,0.6)',
                  border: '1px solid rgba(180,0,0,0.2)',
                  cursor: blocking ? 'not-allowed' : 'pointer',
                }}
              >
                {blocking ? 'Blocking…' : 'Block sender'}
              </button>
            )}
          </div>
        </div>
        </div>{/* flex-1 p-5 */}
      </div>

      <AddBusinessModal
        isOpen={showAddBusiness}
        onClose={() => setShowAddBusiness(false)}
        initialName={suggestedBusinessName || undefined}
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
          initialEmail={isSent ? selectedRecipientEmail : item.from_email}
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
