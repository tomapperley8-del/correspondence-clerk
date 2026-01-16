'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BusinessSelector } from '@/components/BusinessSelector'
import { ContactSelector } from '@/components/ContactSelector'
import { AddBusinessModal } from '@/components/AddBusinessModal'
import { AddContactModal } from '@/components/AddContactModal'
import type { Business } from '@/app/actions/businesses'
import type { Contact } from '@/app/actions/contacts'
import { detectEmailThread, shouldDefaultToSplit } from '@/lib/ai/thread-detection'
import {
  formatCorrespondenceText,
  createFormattedCorrespondence,
  createUnformattedCorrespondence,
} from '@/app/actions/ai-formatter'
import type { AIFormatterResponse } from '@/lib/ai/types'
import { extractContactsFromText, type ExtractedContact } from '@/lib/contact-extraction'
import { ContactExtractionModal } from '@/components/ContactExtractionModal'

function NewEntryPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const businessIdFromQuery = searchParams.get('businessId')

  const [businesses, setBusinesses] = useState<Business[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [subject, setSubject] = useState('')
  const [entryDateOnly, setEntryDateOnly] = useState(() => new Date().toISOString().slice(0, 10))
  const [entryTime, setEntryTime] = useState('')
  const [entryType, setEntryType] = useState<'Email' | 'Call' | 'Meeting' | ''>('')
  const [direction, setDirection] = useState<'received' | 'sent' | ''>('')
  const [actionNeeded, setActionNeeded] = useState<'none' | 'prospect' | 'follow_up' | 'waiting_on_them' | 'invoice' | 'renewal'>('none')
  const [dueAt, setDueAt] = useState('')
  const [errors, setErrors] = useState<{
    business?: string
    contact?: string
    rawText?: string
    entryDate?: string
    direction?: string
  }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showAddBusiness, setShowAddBusiness] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)

  // AI formatting state
  const [threadDetection, setThreadDetection] = useState<{
    looksLikeThread: boolean
    confidence: 'low' | 'medium' | 'high'
    indicators: string[]
  } | null>(null)
  const [shouldSplit, setShouldSplit] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [formattingError, setFormattingError] = useState<string | null>(null)
  const [aiResponse, setAiResponse] = useState<AIFormatterResponse | null>(null)

  // Contact extraction state
  const [extractedContacts, setExtractedContacts] = useState<ExtractedContact[]>([])
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactsAdded, setContactsAdded] = useState(0)

  // Load businesses on mount
  useEffect(() => {
    async function loadBusinesses() {
      const response = await fetch('/api/businesses')
      if (response.ok) {
        const data = await response.json()
        setBusinesses(data)

        // Pre-select business if provided in query params
        if (businessIdFromQuery && data.some((b: Business) => b.id === businessIdFromQuery)) {
          setSelectedBusinessId(businessIdFromQuery)
        }
      }
    }
    loadBusinesses()
  }, [businessIdFromQuery])

  // Load contacts when business is selected
  useEffect(() => {
    async function loadContacts() {
      if (!selectedBusinessId) {
        setContacts([])
        setSelectedContactId(null)
        return
      }

      const response = await fetch(`/api/contacts?businessId=${selectedBusinessId}`)
      if (response.ok) {
        const data = await response.json()
        setContacts(data)

        // Smart default: if only one contact, preselect it
        if (data.length === 1) {
          setSelectedContactId(data[0].id)
        } else {
          setSelectedContactId(null)
        }
      }
    }
    loadContacts()
  }, [selectedBusinessId])

  // Track unsaved changes
  useEffect(() => {
    setIsDirty(rawText.length > 0)
  }, [rawText])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Extract contacts when raw text changes
  useEffect(() => {
    if (rawText.trim().length < 100) {
      setExtractedContacts([])
      return
    }

    const result = extractContactsFromText(rawText)
    setExtractedContacts(result.contacts)
  }, [rawText])

  // Detect email threads when raw text changes
  useEffect(() => {
    if (rawText.trim().length < 50) {
      setThreadDetection(null)
      setShouldSplit(false)
      return
    }

    const detection = detectEmailThread(rawText)
    setThreadDetection(detection)

    // Auto-default split toggle based on confidence
    const autoSplit = shouldDefaultToSplit(rawText)
    setShouldSplit(autoSplit)
  }, [rawText])

  const handleBusinessSelect = (businessId: string) => {
    setSelectedBusinessId(businessId || null)
    setErrors((prev) => ({ ...prev, business: undefined }))
  }

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId || null)
    setErrors((prev) => ({ ...prev, contact: undefined }))
  }

  const handleAddNewBusiness = () => {
    setShowAddBusiness(true)
  }

  const handleAddNewContact = () => {
    if (!selectedBusinessId) {
      setErrors((prev) => ({ ...prev, business: 'Please select a business first' }))
      return
    }
    setShowAddContact(true)
  }

  const handleBusinessAdded = (business: Business) => {
    setBusinesses((prev) => [...prev, business])
    setSelectedBusinessId(business.id)
  }

  const handleContactAdded = (contact: Contact) => {
    setContacts((prev) => [...prev, contact])
    setSelectedContactId(contact.id)
  }

  const handleContactsAdded = async (count: number) => {
    setContactsAdded(count)
    // Reload contacts for the selected business
    if (selectedBusinessId) {
      const response = await fetch(`/api/contacts?businessId=${selectedBusinessId}`)
      if (response.ok) {
        const data = await response.json()
        setContacts(data)
      }
    }
  }

  const validate = () => {
    const newErrors: typeof errors = {}

    if (!selectedBusinessId) {
      newErrors.business = 'Business is required'
    }

    if (!selectedContactId) {
      newErrors.contact = 'Contact is required'
    }

    if (!entryDateOnly) {
      newErrors.entryDate = 'Entry date is required'
    }

    // Direction is only required for Email type
    if (entryType === 'Email' && !direction) {
      newErrors.direction = 'Direction is required for emails'
    }

    if (!rawText.trim()) {
      newErrors.rawText = 'Entry text is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    setIsLoading(true)
    setFormattingError(null)

    // Combine date and time
    const entry_date = entryTime
      ? `${entryDateOnly}T${entryTime}:00`
      : `${entryDateOnly}T12:00:00`

    // Try AI formatting first
    setIsFormatting(true)
    const formatResult = await formatCorrespondenceText(rawText, shouldSplit)
    setIsFormatting(false)

    if ('error' in formatResult) {
      // AI formatting failed - offer to save as unformatted
      setFormattingError(formatResult.error || 'Formatting failed')
      setIsLoading(false)
      return
    }

    // AI formatting succeeded - save formatted correspondence
    const result = await createFormattedCorrespondence(
      {
        business_id: selectedBusinessId!,
        contact_id: selectedContactId!,
        raw_text_original: rawText,
        entry_date,
        type: entryType || undefined,
        direction: direction || undefined,
        action_needed: actionNeeded,
        due_at: dueAt || undefined,
      },
      formatResult.data
    )

    if ('error' in result) {
      alert(`Error saving: ${result.error}`)
      setIsLoading(false)
    } else {
      setIsDirty(false)
      router.push(`/businesses/${selectedBusinessId}?saved=true`)
    }
  }

  const handleSaveUnformatted = async () => {
    setIsLoading(true)
    setFormattingError(null)

    // Combine date and time
    const entry_date = entryTime
      ? `${entryDateOnly}T${entryTime}:00`
      : `${entryDateOnly}T12:00:00`

    const result = await createUnformattedCorrespondence({
      business_id: selectedBusinessId!,
      contact_id: selectedContactId!,
      raw_text_original: rawText,
      entry_date,
      subject: subject || undefined,
      type: entryType || undefined,
      direction: direction || undefined,
      action_needed: actionNeeded,
      due_at: dueAt || undefined,
    })

    if ('error' in result) {
      alert(`Error saving: ${result.error}`)
      setIsLoading(false)
    } else {
      setIsDirty(false)
      router.push(`/businesses/${selectedBusinessId}?saved=true`)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Entry</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Selector */}
        <BusinessSelector
          businesses={businesses}
          selectedBusinessId={selectedBusinessId}
          onSelect={handleBusinessSelect}
          onAddNew={handleAddNewBusiness}
          error={errors.business}
        />

        {/* Contact Selector */}
        <ContactSelector
          contacts={contacts}
          selectedContactId={selectedContactId}
          onSelect={handleContactSelect}
          onAddNew={handleAddNewContact}
          error={errors.contact}
          disabled={!selectedBusinessId}
        />

        {/* Entry Details Section */}
        <div className="bg-gray-50 border-2 border-gray-300 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Entry Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Entry Date */}
            <div>
              <Label htmlFor="entryDateOnly" className="block mb-2 font-semibold">
                Entry Date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="entryDateOnly"
                type="date"
                value={entryDateOnly}
                onChange={(e) => {
                  setEntryDateOnly(e.target.value)
                  setErrors((prev) => ({ ...prev, entryDate: undefined }))
                }}
                className={`w-full ${errors.entryDate ? 'border-red-600' : ''}`}
              />
              {errors.entryDate && (
                <p className="text-red-600 text-xs mt-1">{errors.entryDate}</p>
              )}
            </div>

            {/* Entry Time */}
            <div>
              <Label htmlFor="entryTime" className="block mb-2 font-semibold">
                Entry Time (optional)
              </Label>
              <Input
                id="entryTime"
                type="time"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                className="w-full"
                placeholder="Leave blank if time unknown"
              />
              <p className="text-gray-500 text-xs mt-1">Leave blank if time is unknown</p>
            </div>

            {/* Direction - only show for emails */}
            {entryType === 'Email' && (
              <div>
                <Label className="block mb-2 font-semibold">
                  Direction <span className="text-red-600">*</span>
                </Label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="direction"
                      value="received"
                      checked={direction === 'received'}
                      onChange={(e) => {
                        setDirection(e.target.value as 'received')
                        setErrors((prev) => ({ ...prev, direction: undefined }))
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm">Received from them</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="direction"
                      value="sent"
                      checked={direction === 'sent'}
                      onChange={(e) => {
                        setDirection(e.target.value as 'sent')
                        setErrors((prev) => ({ ...prev, direction: undefined }))
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm">Sent to them</span>
                  </label>
                </div>
                {errors.direction && (
                  <p className="text-red-600 text-xs mt-1">{errors.direction}</p>
                )}
              </div>
            )}

            {/* Entry Type */}
            <div>
              <Label htmlFor="entryType" className="block mb-2 font-semibold">
                Type
              </Label>
              <select
                id="entryType"
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as any)}
                className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-blue-600"
              >
                <option value="">Not specified</option>
                <option value="Email">Email</option>
                <option value="Call">Call</option>
                <option value="Meeting">Meeting</option>
              </select>
            </div>
          </div>
        </div>

        {/* Entry Text */}
        <div>
          <Label htmlFor="rawText" className="block mb-2 font-semibold">
            Entry Text <span className="text-red-600">*</span>
          </Label>
          <textarea
            id="rawText"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className={`w-full min-h-[300px] px-3 py-2 border-2 ${
              errors.rawText ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:border-blue-600 font-mono text-sm`}
            placeholder="Paste email or type call/meeting notes here..."
          />
          {errors.rawText && (
            <p className="text-red-600 text-xs mt-1">{errors.rawText}</p>
          )}

          {/* Contact Extraction Display */}
          {extractedContacts.length > 0 && selectedBusinessId && contactsAdded === 0 && (
            <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-300">
              <p className="text-sm text-yellow-900 mb-2">
                <strong>Detected {extractedContacts.length} contact{extractedContacts.length !== 1 ? 's' : ''} in pasted text</strong>
              </p>
              <Button
                type="button"
                onClick={() => setShowContactModal(true)}
                className="bg-yellow-600 text-white hover:bg-yellow-700 px-4 py-2 text-sm font-semibold"
              >
                Review & Add Contacts
              </Button>
            </div>
          )}

          {/* Contact Added Confirmation */}
          {contactsAdded > 0 && selectedBusinessId && (
            <div className="mt-3 p-4 bg-green-50 border-2 border-green-300">
              <p className="text-sm text-green-900">
                ✓ Added {contactsAdded} contact{contactsAdded !== 1 ? 's' : ''} to {businesses.find(b => b.id === selectedBusinessId)?.name}
              </p>
            </div>
          )}

          {/* Thread Detection Display */}
          {threadDetection && threadDetection.looksLikeThread && (
            <div className="mt-3 p-4 bg-blue-50 border-2 border-blue-600">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 mb-1">
                    Email thread detected ({threadDetection.confidence} confidence)
                  </p>
                  <p className="text-sm text-blue-800 mb-2">
                    This looks like it might contain multiple emails. Split into separate entries?
                  </p>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shouldSplit}
                      onChange={(e) => setShouldSplit(e.target.checked)}
                      className="mr-2 w-4 h-4"
                    />
                    <span className="text-sm font-semibold">
                      Split into individual emails
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Formatting Error Display */}
          {formattingError && (
            <div className="mt-3 p-4 bg-red-50 border-2 border-red-600">
              <p className="font-semibold text-red-900 mb-2">AI Formatting Failed</p>
              <p className="text-sm text-red-800 mb-3">{formattingError}</p>
              <p className="text-sm text-red-800 mb-3">
                You can still save this entry without AI formatting. The original text will be
                preserved and you can format it later.
              </p>
              <Button
                type="button"
                onClick={handleSaveUnformatted}
                disabled={isLoading}
                className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 font-semibold"
              >
                {isLoading ? 'Saving...' : 'Save Without Formatting'}
              </Button>
            </div>
          )}
        </div>

        {/* Optional Fields */}
        <div className="bg-gray-50 border-2 border-gray-300 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Optional Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Subject */}
            <div className="md:col-span-2">
              <Label htmlFor="subject" className="block mb-2 font-semibold">
                Subject
              </Label>
              <Input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief subject or title"
                className="w-full"
              />
            </div>

            {/* Action Needed */}
            <div>
              <Label htmlFor="actionNeeded" className="block mb-2 font-semibold">
                Action Needed
              </Label>
              <select
                id="actionNeeded"
                value={actionNeeded}
                onChange={(e) => setActionNeeded(e.target.value as any)}
                className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-blue-600"
              >
                <option value="none">None</option>
                <option value="prospect">Prospect</option>
                <option value="follow_up">Follow Up</option>
                <option value="waiting_on_them">Waiting on Them</option>
                <option value="invoice">Invoice</option>
                <option value="renewal">Renewal</option>
              </select>
            </div>

            {/* Due Date (only show if action needed) */}
            {actionNeeded !== 'none' && (
              <div>
                <Label htmlFor="dueAt" className="block mb-2 font-semibold">
                  Due Date
                </Label>
                <Input
                  id="dueAt"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={isLoading || isFormatting}
            className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
          >
            {isFormatting ? 'Formatting...' : isLoading ? 'Saving...' : 'Save Entry'}
          </Button>
          <Button
            type="button"
            onClick={() => router.back()}
            disabled={isLoading || isFormatting}
            className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3"
          >
            Cancel
          </Button>
        </div>
      </form>

      {/* Add Business Modal */}
      <AddBusinessModal
        isOpen={showAddBusiness}
        onClose={() => setShowAddBusiness(false)}
        onBusinessAdded={handleBusinessAdded}
      />

      {/* Add Contact Modal */}
      {selectedBusinessId && (
        <AddContactModal
          isOpen={showAddContact}
          onClose={() => setShowAddContact(false)}
          businessId={selectedBusinessId}
          onContactAdded={handleContactAdded}
        />
      )}

      {/* Contact Extraction Modal */}
      {selectedBusinessId && (
        <ContactExtractionModal
          isOpen={showContactModal}
          onClose={() => setShowContactModal(false)}
          extractedContacts={extractedContacts}
          businessId={selectedBusinessId}
          onContactsAdded={handleContactsAdded}
        />
      )}
    </div>
  )
}

export default function NewEntryPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <NewEntryPageContent />
    </Suspense>
  )
}
