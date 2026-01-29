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
import { ContactMatchPreviewModal } from '@/components/ContactMatchPreviewModal'
import { DuplicateWarningModal } from '@/components/DuplicateWarningModal'
import { matchEntriesToContacts, type ContactMatchResult } from '@/lib/contact-matching'
import { isThreadSplitResponse } from '@/lib/ai/types'
import { checkForDuplicates, type Correspondence } from '@/app/actions/correspondence'

function NewEntryPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const businessIdFromQuery = searchParams.get('businessId')

  const [businesses, setBusinesses] = useState<Business[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [ccContactIds, setCcContactIds] = useState<string[]>([])
  const [bccContactIds, setBccContactIds] = useState<string[]>([])
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
  const [emailSourceMetadata, setEmailSourceMetadata] = useState<any>(null)
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

  // Contact matching state (for thread splits)
  const [contactMatches, setContactMatches] = useState<ContactMatchResult[]>([])
  const [showMatchPreview, setShowMatchPreview] = useState(false)
  const [pendingAiResponse, setPendingAiResponse] = useState<AIFormatterResponse | null>(null)

  // Duplicate detection state
  const [duplicateEntry, setDuplicateEntry] = useState<Correspondence | null>(null)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [bypassDuplicateCheck, setBypassDuplicateCheck] = useState(false)
  const [autoMatchedContactId, setAutoMatchedContactId] = useState<string | null>(null)

  // Inline error/warning state (replaces browser alerts)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionWarning, setActionWarning] = useState<string | null>(null)

  // AI Preview state (Phase 4)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<AIFormatterResponse | null>(null)
  const [previewText, setPreviewText] = useState<string>('')

  // Business email suggestion state (Feature #1)
  const [suggestedBusinessEmail, setSuggestedBusinessEmail] = useState<string | null>(null)
  const [showBusinessEmailPrompt, setShowBusinessEmailPrompt] = useState(false)
  const [senderEmailData, setSenderEmailData] = useState<{ email: string; name: string } | null>(null)

  // Function to fetch email data by token
  async function fetchEmailDataByToken(token: string) {
    try {
      performance.mark('email-import-start')
      setIsLoading(true)

      performance.mark('fetch-email-data-start')
      const response = await fetch(`/api/import-email/retrieve/${token}`)

      if (!response.ok) {
        throw new Error('Failed to retrieve email data')
      }

      const { success, emailData } = await response.json()
      performance.mark('fetch-email-data-end')
      performance.measure('fetch-email-data', 'fetch-email-data-start', 'fetch-email-data-end')

      if (success && emailData) {
        // Pre-fill form with retrieved data
        if (emailData.emailRawContent) {
          setRawText(emailData.emailRawContent)
        } else if (emailData.emailFrom || emailData.emailSubject || emailData.emailBody) {
          const formattedEmail = `From: ${emailData.emailFrom || ''}
${emailData.emailTo ? `To: ${emailData.emailTo}\n` : ''}${emailData.emailDate ? `Date: ${emailData.emailDate}\n` : ''}${emailData.emailSubject ? `Subject: ${emailData.emailSubject}\n` : ''}

${emailData.emailBody || ''}`
          setRawText(formattedEmail)
        }

        if (emailData.emailSubject) {
          setSubject(emailData.emailSubject)
        }

        if (emailData.emailDate) {
          performance.mark('date-parse-start')
          try {
            const date = new Date(emailData.emailDate)
            setEntryDateOnly(date.toISOString().slice(0, 10))
            const hours = date.getHours()
            const minutes = date.getMinutes()
            setEntryTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`)
          } catch (e) {
            // Invalid date, use today
          }
          performance.mark('date-parse-end')
          performance.measure('date-parse', 'date-parse-start', 'date-parse-end')
        }

        // Feature #9: Capture email source metadata (message ID, web link)
        if (emailData.emailSourceMetadata) {
          try {
            const metadata = typeof emailData.emailSourceMetadata === 'string'
              ? JSON.parse(emailData.emailSourceMetadata)
              : emailData.emailSourceMetadata
            setEmailSourceMetadata(metadata)
          } catch (e) {
            console.warn('Failed to parse email source metadata:', e)
          }
        }

        setEntryType('Email')

        // Auto-detect direction
        if (emailData.emailFrom) {
          const fromLower = emailData.emailFrom.toLowerCase()
          if (
            fromLower.includes('chiswickcalendar.co.uk') ||
            fromLower.includes('bridget')
          ) {
            setDirection('sent')
          } else {
            setDirection('received')
          }
        }

        // Store sender email data for business email suggestion (Feature #1)
        if (emailData.emailFromEmail) {
          setSenderEmailData({
            email: emailData.emailFromEmail,
            name: emailData.emailFrom || emailData.emailFromEmail,
          })
        }

        // Auto-match contact if email provided
        if (emailData.emailFromEmail) {
          performance.mark('contact-match-start')
          try {
            const response = await fetch(`/api/contacts?email=${encodeURIComponent(emailData.emailFromEmail)}`)
            if (response.ok) {
              const matchedContacts = await response.json()
              performance.mark('contact-match-end')
              performance.measure('contact-match', 'contact-match-start', 'contact-match-end')
              if (matchedContacts.length > 0) {
                const contact = matchedContacts[0]
                setAutoMatchedContactId(contact.id)
                setSelectedBusinessId(contact.business_id)
              }
            }
          } catch (error) {
            console.error('Error matching contact:', error)
          }
        }
      }

      // Log performance summary
      performance.mark('email-import-end')
      performance.measure('email-import-total', 'email-import-start', 'email-import-end')

      const measurements = performance.getEntriesByType('measure')
      console.group('📊 Email Import Performance')
      measurements.forEach((measure) => {
        console.log(`${measure.name}: ${measure.duration.toFixed(2)}ms`)
      })
      console.groupEnd()
    } catch (error) {
      console.error('Error fetching email data:', error)
      setActionError('Failed to load email data. The link may have expired (tokens are valid for 1 hour). Please try the bookmarklet again or copy the email manually.')
    } finally {
      setIsLoading(false)
    }
  }

  // Check for email import query parameters and pre-fill form
  useEffect(() => {
    // NEW: Check for awaitingEmail flag (postMessage-based from bookmarklet)
    const awaitingEmail = searchParams.get('awaitingEmail')
    if (awaitingEmail === '1') {
      // Listen for postMessage from bookmarklet
      const handleMessage = async (event: MessageEvent) => {
        // Validate origin for security
        if (!event.origin.includes('outlook') &&
            !event.origin.includes('office.com') &&
            !event.origin.includes('live.com') &&
            !event.origin.includes('mail.google.com')) {
          return
        }

        if (event.data && (event.data.type === 'OUTLOOK_EMAIL_DATA' || event.data.type === 'EMAIL_DATA')) {
          const emailData = event.data.data

          // Pre-fill form with received data
          if (emailData.emailRawContent) {
            setRawText(emailData.emailRawContent)
          } else if (emailData.emailFrom || emailData.emailSubject || emailData.emailBody) {
            const formattedEmail = `From: ${emailData.emailFrom || ''}
${emailData.emailTo ? `To: ${emailData.emailTo}\n` : ''}${emailData.emailDate ? `Date: ${emailData.emailDate}\n` : ''}${emailData.emailSubject ? `Subject: ${emailData.emailSubject}\n` : ''}

${emailData.emailBody || ''}`
            setRawText(formattedEmail)
          }

          if (emailData.emailSubject) {
            setSubject(emailData.emailSubject)
          }

          if (emailData.emailDate) {
            try {
              const date = new Date(emailData.emailDate)
              setEntryDateOnly(date.toISOString().slice(0, 10))
              const hours = date.getHours()
              const minutes = date.getMinutes()
              setEntryTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`)
            } catch (e) {
              // Invalid date, use today
            }
          }

          setEntryType('Email')

          // Auto-detect direction
          if (emailData.emailFrom) {
            const fromLower = emailData.emailFrom.toLowerCase()
            if (
              fromLower.includes('chiswickcalendar.co.uk') ||
              fromLower.includes('bridget')
            ) {
              setDirection('sent')
            } else {
              setDirection('received')
            }
          }

          // Auto-match contact if email provided
          if (emailData.emailFromEmail) {
            try {
              const response = await fetch(`/api/contacts?email=${encodeURIComponent(emailData.emailFromEmail)}`)
              if (response.ok) {
                const matchedContacts = await response.json()
                if (matchedContacts.length > 0) {
                  const contact = matchedContacts[0]
                  setAutoMatchedContactId(contact.id)
                  setSelectedBusinessId(contact.business_id)
                }
              }
            } catch (error) {
              console.error('Error matching contact:', error)
            }
          }
        }
      }

      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }

    // Check for emailToken (API-based storage - fallback)
    const emailToken = searchParams.get('emailToken')
    if (emailToken) {
      fetchEmailDataByToken(emailToken)
      return // Exit early, don't process URL params
    }

    // EXISTING: Handle direct URL parameters (fallback)
    const emailSubject = searchParams.get('emailSubject')
    const emailBody = searchParams.get('emailBody')
    const emailFrom = searchParams.get('emailFrom')
    const emailFromEmail = searchParams.get('emailFromEmail')
    const emailDate = searchParams.get('emailDate')
    const emailRawContent = searchParams.get('emailRawContent')
    const contactIdFromQuery = searchParams.get('contactId')
    const truncated = searchParams.get('truncated')

    if (emailSubject || emailBody || emailRawContent) {
      // Pre-fill raw text with formatted email content
      if (emailRawContent) {
        setRawText(decodeURIComponent(emailRawContent))
      } else if (emailFrom || emailSubject || emailBody) {
        const formattedEmail = `From: ${emailFrom || ''}
${searchParams.get('emailTo') ? `To: ${searchParams.get('emailTo')}\n` : ''}${emailDate ? `Date: ${emailDate}\n` : ''}${emailSubject ? `Subject: ${emailSubject}\n` : ''}

${emailBody || ''}`
        setRawText(formattedEmail)
      }

      // Pre-fill subject
      if (emailSubject) {
        setSubject(emailSubject)
      }

      // Pre-fill entry date
      if (emailDate) {
        try {
          const date = new Date(emailDate)
          setEntryDateOnly(date.toISOString().slice(0, 10))
          const hours = date.getHours()
          const minutes = date.getMinutes()
          setEntryTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`)
        } catch (e) {
          // Invalid date, use today's date
        }
      }

      // Set entry type to Email
      setEntryType('Email')

      // Show warning if email was truncated
      if (truncated === '1') {
        setActionWarning('Note: This email was truncated due to length. The first 3000 characters have been imported. You may need to copy additional content manually from Outlook.')
      }

      // Detect direction from email (if "from" contains user's domain, it's sent)
      if (emailFrom) {
        const fromLower = emailFrom.toLowerCase()
        if (
          fromLower.includes('chiswickcalendar.co.uk') ||
          fromLower.includes('bridget') ||
          fromLower.includes('<') && fromLower.includes('chiswickcalendar')
        ) {
          setDirection('sent')
        } else {
          setDirection('received')
        }
      }

      // Pre-select contact if provided
      if (contactIdFromQuery) {
        setSelectedContactId(contactIdFromQuery)
      }

      // Auto-match business and contact from sender email
      if (emailFromEmail && !businessIdFromQuery && !contactIdFromQuery) {
        async function matchFromEmail() {
          if (!emailFromEmail) return
          try {
            const response = await fetch(`/api/contacts?email=${encodeURIComponent(emailFromEmail)}`)
            if (response.ok) {
              const matchedContacts = await response.json()
              if (matchedContacts.length > 0) {
                const contact = matchedContacts[0]
                setAutoMatchedContactId(contact.id) // Store for later
                setSelectedBusinessId(contact.business_id)
              }
            }
          } catch (error) {
            console.error('Error matching contact:', error)
          }
        }
        matchFromEmail()
      }
    }
  }, [searchParams, businessIdFromQuery])

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

        // If we have an auto-matched contact, select it
        if (autoMatchedContactId && data.some((c: Contact) => c.id === autoMatchedContactId)) {
          setSelectedContactId(autoMatchedContactId)
          setAutoMatchedContactId(null) // Clear it so it doesn't interfere later
        }
        // Smart default: if only one contact, preselect it
        else if (data.length === 1) {
          setSelectedContactId(data[0].id)
        } else {
          setSelectedContactId(null)
        }
      }
    }
    loadContacts()
  }, [selectedBusinessId, autoMatchedContactId])

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

  const handleBusinessSelect = async (businessId: string) => {
    setSelectedBusinessId(businessId || null)
    setErrors((prev) => ({ ...prev, business: undefined }))

    // Feature #1: Check if we should suggest adding business email
    if (businessId && senderEmailData) {
      const selectedBusiness = businesses.find((b) => b.id === businessId)
      if (selectedBusiness && !selectedBusiness.email) {
        // Extract domain email from sender
        const senderEmail = senderEmailData.email
        const domain = senderEmail.split('@')[1]

        // Don't suggest if sender is a known contact
        const isKnownContact = contacts.some((c) =>
          c.emails?.some((e) => e.toLowerCase() === senderEmail.toLowerCase())
        )

        if (!isKnownContact && domain) {
          // Suggest generic business email like info@domain.com
          const suggestedEmail = `info@${domain}`
          setSuggestedBusinessEmail(suggestedEmail)
          setShowBusinessEmailPrompt(true)
        }
      }
    }
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

  // Feature #1: Handle business email suggestion
  const handleAcceptBusinessEmail = async () => {
    if (!selectedBusinessId || !suggestedBusinessEmail) return

    try {
      const response = await fetch('/api/businesses/update-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedBusinessId,
          email: suggestedBusinessEmail,
        }),
      })

      if (response.ok) {
        // Update local businesses state
        setBusinesses((prev) =>
          prev.map((b) =>
            b.id === selectedBusinessId ? { ...b, email: suggestedBusinessEmail } : b
          )
        )
        setShowBusinessEmailPrompt(false)
        setSuggestedBusinessEmail(null)
      } else {
        console.error('Failed to update business email')
        setActionError('Failed to add email to business')
      }
    } catch (error) {
      console.error('Error updating business email:', error)
      setActionError('Error adding email to business')
    }
  }

  const handleDeclineBusinessEmail = () => {
    setShowBusinessEmailPrompt(false)
    setSuggestedBusinessEmail(null)
  }

  // Feature #1: Handle contact being updated via inline editing
  const handleContactUpdated = (updatedContact: Contact) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
    )
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

    // Check for duplicates first (unless bypassing)
    if (!bypassDuplicateCheck && selectedBusinessId) {
      const duplicateCheck = await checkForDuplicates(rawText, selectedBusinessId)
      if (duplicateCheck.isDuplicate && duplicateCheck.existingEntry) {
        setDuplicateEntry(duplicateCheck.existingEntry)
        setShowDuplicateWarning(true)
        setIsLoading(false)
        return
      }
    }

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

    // AI formatting succeeded
    // Check if it's a thread split with multiple entries
    if (isThreadSplitResponse(formatResult.data) && formatResult.data.entries.length > 1) {
      // Match each entry to a contact
      const matches = matchEntriesToContacts(formatResult.data.entries, contacts)

      // Store the matches and AI response for preview
      setContactMatches(matches)
      setPendingAiResponse(formatResult.data)
      setShowMatchPreview(true)
      setIsLoading(false)
    } else {
      // Single entry - show preview before saving
      setPreviewData(formatResult.data)
      // Extract formatted text for preview display
      const data = formatResult.data as any
      setPreviewText(data.formatted_text || data.entries?.[0]?.formatted_text || '')
      setShowPreview(true)
      setIsLoading(false)
    }
  }

  const handleConfirmPreview = async () => {
    if (!previewData || !selectedBusinessId || !selectedContactId) return

    setIsLoading(true)
    setShowPreview(false)
    setActionError(null)

    // Combine date and time
    const entry_date = entryTime
      ? `${entryDateOnly}T${entryTime}:00`
      : `${entryDateOnly}T12:00:00`

    const result = await createFormattedCorrespondence(
      {
        business_id: selectedBusinessId,
        contact_id: selectedContactId,
        cc_contact_ids: ccContactIds.length > 0 ? ccContactIds : undefined,
        bcc_contact_ids: bccContactIds.length > 0 ? bccContactIds : undefined,
        raw_text_original: rawText,
        entry_date,
        type: entryType || undefined,
        direction: direction || undefined,
        action_needed: actionNeeded,
        due_at: dueAt || undefined,
        email_source: emailSourceMetadata || undefined,
      },
      previewData
    )

    if ('error' in result) {
      setActionError(`Error saving: ${result.error}`)
      setIsLoading(false)
    } else {
      setIsDirty(false)
      router.push(`/businesses/${selectedBusinessId}?saved=true`)
    }
  }

  const handleEditPreview = () => {
    // Close preview and let user edit the raw text
    setShowPreview(false)
    setPreviewData(null)
    setPreviewText('')
  }

  const handleConfirmMatches = async (confirmedMatches: ContactMatchResult[]) => {
    if (!pendingAiResponse || !selectedBusinessId) return

    setIsLoading(true)
    setShowMatchPreview(false)

    // Combine date and time
    const entry_date = entryTime
      ? `${entryDateOnly}T${entryTime}:00`
      : `${entryDateOnly}T12:00:00`

    // Save correspondence with matched contacts
    const result = await createFormattedCorrespondence(
      {
        business_id: selectedBusinessId,
        contact_id: selectedContactId!, // Fallback contact (not used if matches provided)
        cc_contact_ids: ccContactIds.length > 0 ? ccContactIds : undefined,
        bcc_contact_ids: bccContactIds.length > 0 ? bccContactIds : undefined,
        raw_text_original: rawText,
        entry_date,
        type: entryType || undefined,
        direction: direction || undefined,
        action_needed: actionNeeded,
        due_at: dueAt || undefined,
        email_source: emailSourceMetadata || undefined,
      },
      pendingAiResponse,
      confirmedMatches // Pass the confirmed contact matches
    )

    if ('error' in result) {
      setActionError(`Error saving: ${result.error}`)
      setIsLoading(false)
    } else {
      setIsDirty(false)
      router.push(`/businesses/${selectedBusinessId}?saved=true`)
    }
  }

  const handleSaveUnformatted = async () => {
    setIsLoading(true)
    setFormattingError(null)

    // Check for duplicates first (unless bypassing)
    if (!bypassDuplicateCheck && selectedBusinessId) {
      const duplicateCheck = await checkForDuplicates(rawText, selectedBusinessId)
      if (duplicateCheck.isDuplicate && duplicateCheck.existingEntry) {
        setDuplicateEntry(duplicateCheck.existingEntry)
        setShowDuplicateWarning(true)
        setIsLoading(false)
        return
      }
    }

    // Combine date and time
    const entry_date = entryTime
      ? `${entryDateOnly}T${entryTime}:00`
      : `${entryDateOnly}T12:00:00`

    const result = await createUnformattedCorrespondence({
      business_id: selectedBusinessId!,
      contact_id: selectedContactId!,
      cc_contact_ids: ccContactIds.length > 0 ? ccContactIds : undefined,
      bcc_contact_ids: bccContactIds.length > 0 ? bccContactIds : undefined,
      raw_text_original: rawText,
      entry_date,
      subject: subject || undefined,
      type: entryType || undefined,
      direction: direction || undefined,
      action_needed: actionNeeded,
      due_at: dueAt || undefined,
    })

    if ('error' in result) {
      setActionError(`Error saving: ${result.error}`)
      setIsLoading(false)
    } else {
      setIsDirty(false)
      router.push(`/businesses/${selectedBusinessId}?saved=true`)
    }
  }

  const handleCloseDuplicateWarning = () => {
    setShowDuplicateWarning(false)
    setDuplicateEntry(null)
    setIsLoading(false)
  }

  const handleSaveAnyway = () => {
    setShowDuplicateWarning(false)
    setBypassDuplicateCheck(true)
    // Trigger form submission which will now bypass the duplicate check
    const form = document.querySelector('form')
    if (form) {
      form.requestSubmit()
    }
  }

  // Check if email was imported from email client
  const emailImported = !!(
    searchParams.get('emailSubject') ||
    searchParams.get('emailBody') ||
    searchParams.get('emailRawContent')
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Loading state for token-based email retrieval */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white px-8 py-6 border-2 border-gray-900">
            <p className="text-lg font-semibold text-gray-900">Loading email data...</p>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Entry</h1>

      {/* Action Error Banner */}
      {actionError && (
        <div role="alert" className="bg-red-50 border-2 border-red-600 p-4 mb-6">
          <div className="flex justify-between items-start">
            <p className="text-sm text-red-900 font-semibold">{actionError}</p>
            <button
              onClick={() => setActionError(null)}
              className="text-red-900 hover:text-red-700 text-sm font-bold ml-4"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Action Warning Banner */}
      {actionWarning && (
        <div role="status" className="bg-yellow-50 border-2 border-yellow-600 p-4 mb-6">
          <div className="flex justify-between items-start">
            <p className="text-sm text-yellow-900">{actionWarning}</p>
            <button
              onClick={() => setActionWarning(null)}
              className="text-yellow-900 hover:text-yellow-700 text-sm font-bold ml-4"
              aria-label="Dismiss warning"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {emailImported && (
        <div className="mb-6 border-2 border-blue-600 bg-blue-50 px-4 py-3">
          <p className="text-blue-900 font-semibold text-sm">
            Email imported
          </p>
          <p className="text-blue-700 text-sm mt-1">
            Please verify business and contact selection, then save the entry.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Selector */}
        <BusinessSelector
          businesses={businesses}
          selectedBusinessId={selectedBusinessId}
          onSelect={handleBusinessSelect}
          onAddNew={handleAddNewBusiness}
          error={errors.business}
        />

        {/* Business Email Suggestion Prompt (Feature #1) */}
        {showBusinessEmailPrompt && suggestedBusinessEmail && (
          <div className="bg-blue-50 border-2 border-blue-600 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Add Email to {businesses.find((b) => b.id === selectedBusinessId)?.name}?
                </h3>
                <p className="text-sm text-gray-700 mb-3">
                  This email came from <strong>{senderEmailData?.email}</strong>.
                  Would you like to add <strong>{suggestedBusinessEmail}</strong> as the
                  primary email for this business?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleAcceptBusinessEmail}
                    className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 text-sm font-semibold"
                  >
                    Yes, Add Email
                  </Button>
                  <Button
                    type="button"
                    onClick={handleDeclineBusinessEmail}
                    className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 text-sm"
                  >
                    No, Skip
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contact Selector */}
        <ContactSelector
          contacts={contacts}
          selectedContactId={selectedContactId}
          onSelect={handleContactSelect}
          onAddNew={handleAddNewContact}
          error={errors.contact}
          disabled={!selectedBusinessId}
          onContactUpdated={handleContactUpdated}
        />

        {/* CC Contacts Selector */}
        {selectedBusinessId && contacts.length > 0 && (
          <div>
            <Label className="block mb-2 font-semibold">
              CC Contacts (optional)
            </Label>
            <div className="border-2 border-gray-300 p-3 bg-white">
              {contacts.filter(c => c.id !== selectedContactId).length === 0 ? (
                <p className="text-sm text-gray-500">No other contacts available to CC</p>
              ) : (
                <div className="space-y-2">
                  {contacts
                    .filter(c => c.id !== selectedContactId)
                    .map(contact => (
                      <label key={contact.id} className="flex items-center cursor-pointer hover:bg-gray-50 p-2 -mx-2">
                        <input
                          type="checkbox"
                          checked={ccContactIds.includes(contact.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCcContactIds(prev => [...prev, contact.id])
                            } else {
                              setCcContactIds(prev => prev.filter(id => id !== contact.id))
                            }
                          }}
                          className="mr-3 w-4 h-4"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{contact.name}</span>
                          {contact.role && (
                            <span className="text-gray-500 text-sm ml-2">({contact.role})</span>
                          )}
                          {contact.emails && contact.emails.length > 0 && (
                            <span className="text-gray-400 text-sm ml-2">{contact.emails[0]}</span>
                          )}
                        </div>
                      </label>
                    ))}
                </div>
              )}
            </div>
            {ccContactIds.length > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                {ccContactIds.length} contact{ccContactIds.length !== 1 ? 's' : ''} will be CC&apos;d
              </p>
            )}
          </div>
        )}

        {/* BCC Contacts Selector */}
        {selectedBusinessId && contacts.length > 0 && (
          <div>
            <Label className="block mb-2 font-semibold">
              BCC Contacts (optional)
            </Label>
            <div className="border-2 border-gray-300 p-3 bg-white">
              {contacts.filter(c => c.id !== selectedContactId && !ccContactIds.includes(c.id)).length === 0 ? (
                <p className="text-sm text-gray-500">No other contacts available to BCC</p>
              ) : (
                <div className="space-y-2">
                  {contacts
                    .filter(c => c.id !== selectedContactId && !ccContactIds.includes(c.id))
                    .map(contact => (
                      <label key={contact.id} className="flex items-center cursor-pointer hover:bg-gray-50 p-2 -mx-2">
                        <input
                          type="checkbox"
                          checked={bccContactIds.includes(contact.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBccContactIds(prev => [...prev, contact.id])
                            } else {
                              setBccContactIds(prev => prev.filter(id => id !== contact.id))
                            }
                          }}
                          className="mr-3 w-4 h-4"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{contact.name}</span>
                          {contact.role && (
                            <span className="text-gray-500 text-sm ml-2">({contact.role})</span>
                          )}
                          {contact.emails && contact.emails.length > 0 && (
                            <span className="text-gray-400 text-sm ml-2">{contact.emails[0]}</span>
                          )}
                        </div>
                      </label>
                    ))}
                </div>
              )}
            </div>
            {bccContactIds.length > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                {bccContactIds.length} contact{bccContactIds.length !== 1 ? 's' : ''} will be BCC&apos;d
              </p>
            )}
          </div>
        )}

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
              <h3 className="font-semibold text-red-900 mb-2">AI Formatting Failed</h3>
              <p className="text-sm text-red-800 mb-3">
                {formattingError}
              </p>
              <p className="text-sm text-red-700 mb-3">
                <strong>What this means:</strong> Claude returned a response that couldn&apos;t be processed.
                This sometimes happens with very long or complex text.
                Your original text is preserved and you can still save it.
              </p>
              <p className="text-sm text-red-700 mb-3">
                <strong>Options:</strong>
              </p>
              <ul className="list-disc list-inside text-sm text-red-700 mb-4 space-y-1">
                <li>Click &quot;Save Without Formatting&quot; to save the original text as-is</li>
                <li>Try splitting the text into smaller entries</li>
                <li>Try again later - AI formatting issues are often temporary</li>
              </ul>
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

      {/* AI Format Preview Panel */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border-2 border-gray-800 p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Preview Formatted Entry</h2>
            <p className="text-sm text-gray-600 mb-4">
              Review the AI-formatted text below. You can save as-is, go back to edit, or retry formatting.
            </p>

            {/* Preview Subject */}
            {(previewData as any).subject && (
              <div className="mb-3">
                <span className="text-sm font-semibold text-gray-700">Subject: </span>
                <span className="text-sm text-gray-900">{(previewData as any).subject}</span>
              </div>
            )}

            {/* Preview Formatted Text */}
            <div className="bg-gray-50 border-2 border-gray-300 p-4 mb-4 max-h-[50vh] overflow-y-auto">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                {previewText || 'No formatted text available'}
              </pre>
            </div>

            {/* Preview Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleConfirmPreview}
                disabled={isLoading}
                className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
              >
                {isLoading ? 'Saving...' : 'Save Entry'}
              </Button>
              <Button
                onClick={handleEditPreview}
                disabled={isLoading}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3"
              >
                Back to Edit
              </Button>
              <Button
                onClick={handleSaveUnformatted}
                disabled={isLoading}
                className="bg-orange-100 text-orange-900 hover:bg-orange-200 px-6 py-3"
              >
                Save Without Formatting
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Contact Match Preview Modal */}
      {pendingAiResponse && isThreadSplitResponse(pendingAiResponse) && selectedContactId && (
        <ContactMatchPreviewModal
          isOpen={showMatchPreview}
          onClose={() => {
            setShowMatchPreview(false);
            setIsLoading(false);
          }}
          entries={pendingAiResponse.entries}
          contacts={contacts}
          initialMatches={contactMatches}
          defaultContactId={selectedContactId}
          onConfirm={handleConfirmMatches}
        />
      )}

      {/* Duplicate Warning Modal */}
      {duplicateEntry && (
        <DuplicateWarningModal
          isOpen={showDuplicateWarning}
          onClose={handleCloseDuplicateWarning}
          existingEntry={duplicateEntry}
          onSaveAnyway={handleSaveAnyway}
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
