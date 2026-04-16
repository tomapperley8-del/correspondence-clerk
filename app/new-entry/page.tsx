'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AddBusinessModal } from '@/components/AddBusinessModal'
import { AddContactModal } from '@/components/AddContactModal'
import { ContactExtractionModal } from '@/components/ContactExtractionModal'
import { ContactMatchPreviewModal } from '@/components/ContactMatchPreviewModal'
import { DuplicateWarningModal } from '@/components/DuplicateWarningModal'
import type { Business } from '@/app/actions/businesses'
import type { Contact } from '@/app/actions/contacts'
import {
  formatCorrespondenceText,
  createFormattedCorrespondence,
  createUnformattedCorrespondence,
} from '@/app/actions/ai-formatter'
import type { AIFormatterResponse } from '@/lib/ai/types'
import { matchEntriesToContacts, type ContactMatchResult } from '@/lib/contact-matching'
import { isThreadSplitResponse } from '@/lib/ai/types'
import { checkForDuplicates, type Correspondence } from '@/app/actions/correspondence'
import { isInternalSender, detectInternalSender } from '@/lib/internal-senders'
import { toast } from '@/lib/toast'

import { useThreadDetection } from './_hooks/useThreadDetection'
import { useContactExtraction } from './_hooks/useContactExtraction'
import { useDraftAutosave } from './_hooks/useDraftAutosave'
import { useEmailImport, type ParsedEmailData } from './_hooks/useEmailImport'
import { EmailSelectionDialog } from './_components/EmailSelectionDialog'
import { AIPreviewPanel } from './_components/AIPreviewPanel'
import { FilingSection } from './_components/FilingSection'
import { EntryDetailsSection } from './_components/EntryDetailsSection'
import { TextInputSection } from './_components/TextInputSection'

function NewEntryPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const businessIdFromQuery = searchParams.get('businessId')

  // --- Form filing state ---
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [ccContactIds, setCcContactIds] = useState<string[]>([])
  const [bccContactIds, setBccContactIds] = useState<string[]>([])

  // --- Entry details state ---
  const [rawText, setRawText] = useState('')
  const [subject, setSubject] = useState('')
  const [entryDateOnly, setEntryDateOnly] = useState(() => new Date().toISOString().slice(0, 10))
  const [entryTime, setEntryTime] = useState('')
  const [entryType, setEntryType] = useState<'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note' | ''>('')
  const [direction, setDirection] = useState<'received' | 'sent' | ''>('')
  const [internalSender, setInternalSender] = useState('')
  const [threadParticipants, setThreadParticipants] = useState('')
  const [actionNeeded, setActionNeeded] = useState<'none' | 'prospect' | 'follow_up' | 'waiting_on_them' | 'invoice' | 'renewal'>('none')
  const [dueAt, setDueAt] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [emailSourceMetadata, setEmailSourceMetadata] = useState<any>(null)

  // --- UI state ---
  const [errors, setErrors] = useState<{
    business?: string; contact?: string; rawText?: string; entryDate?: string; direction?: string
  }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showAddBusiness, setShowAddBusiness] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionWarning, setActionWarning] = useState<string | null>(null)
  const autoMatchedContactIdRef = useRef<string | null>(null)
  const autoMatchHandledRef = useRef(false)

  // --- AI formatting state ---
  const [isFormatting, setIsFormatting] = useState(false)
  const [formattingError, setFormattingError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<AIFormatterResponse | null>(null)
  const [previewText, setPreviewText] = useState('')
  const [quotedContent, setQuotedContent] = useState<string | undefined>(undefined)
  const [pendingAiResponse, setPendingAiResponse] = useState<AIFormatterResponse | null>(null)
  const [contactMatches, setContactMatches] = useState<ContactMatchResult[]>([])
  const [showMatchPreview, setShowMatchPreview] = useState(false)

  // --- Business email suggestion state ---
  const [suggestedBusinessEmail, setSuggestedBusinessEmail] = useState<string | null>(null)
  const [showBusinessEmailPrompt, setShowBusinessEmailPrompt] = useState(false)
  const [senderEmailData, setSenderEmailData] = useState<{ email: string; name: string } | null>(null)

  // --- Duplicate detection state ---
  const [duplicateEntry, setDuplicateEntry] = useState<Correspondence | null>(null)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [bypassDuplicateCheck, setBypassDuplicateCheck] = useState(false)

  // --- Extracted hooks ---
  const { threadDetection, shouldSplit, setShouldSplit } = useThreadDetection(rawText)

  const { extractedContacts, showContactModal, setShowContactModal, contactsAdded, setContactsAdded } =
    useContactExtraction(rawText, selectedBusinessId)

  const hasEmailImport = !!(searchParams.get('awaitingEmail') || searchParams.get('emailToken'))

  const { draftStatus, clearDraft } = useDraftAutosave(
    { rawText, subject, entryType, direction, entryDateOnly, actionNeeded },
    (draft) => {
      setRawText(draft.rawText)
      if (draft.subject) setSubject(draft.subject)
      if (draft.entryType) setEntryType(draft.entryType as typeof entryType)
      if (draft.direction) setDirection(draft.direction as typeof direction)
      if (draft.entryDateOnly) setEntryDateOnly(draft.entryDateOnly)
      if (draft.actionNeeded) setActionNeeded(draft.actionNeeded as typeof actionNeeded)
    },
    hasEmailImport
  )

  // --- Apply email data to form fields ---
  const applyEmailData = useCallback(async (data: ParsedEmailData) => {
    setRawText(data.rawText)
    if (data.subject) setSubject(data.subject)
    if (data.entryDateOnly) setEntryDateOnly(data.entryDateOnly)
    if (data.entryTime) setEntryTime(data.entryTime)
    if (data.direction) setDirection(data.direction)
    if (data.internalSender) setInternalSender(data.internalSender)
    if (data.emailSourceMetadata) setEmailSourceMetadata(data.emailSourceMetadata)
    if (data.contactId) setSelectedContactId(data.contactId)
    setEntryType('Email')

    if (data.senderEmail) {
      setSenderEmailData({ email: data.senderEmail, name: data.senderName || data.senderEmail })
      try {
        const res = await fetch(`/api/contacts?email=${encodeURIComponent(data.senderEmail)}`)
        if (res.ok) {
          const matched: Contact[] = await res.json()
          if (matched.length > 0) {
            autoMatchedContactIdRef.current = matched[0].id
            setSelectedBusinessId(matched[0].business_id)
          }
        }
      } catch (err) {
        console.error('Error matching contact:', err)
      }
    }
  }, [])

  const {
    pendingEmails, selectedEmailIndices, setSelectedEmailIndices,
    showEmailSelection, setShowEmailSelection, emailImported, applyPendingEmail,
  } = useEmailImport({
    searchParams,
    businessIdFromQuery,
    onApplyEmail: applyEmailData,
    setIsLoading,
    setActionWarning,
  })

  // --- Load businesses on mount ---
  useEffect(() => {
    fetch('/api/businesses')
      .then((r) => r.ok ? r.json() : [])
      .then((data: Business[]) => {
        setBusinesses(data)
        if (businessIdFromQuery && data.some((b) => b.id === businessIdFromQuery)) {
          setSelectedBusinessId(businessIdFromQuery)
        }
      })
  }, [businessIdFromQuery])

  // --- Load contacts when business changes ---
  useEffect(() => {
    if (!selectedBusinessId) {
      setContacts([])
      setSelectedContactId(null)
      return
    }
    fetch(`/api/contacts?businessId=${selectedBusinessId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Contact[]) => {
        setContacts(data)
        const autoId = autoMatchedContactIdRef.current
        if (autoId && !autoMatchHandledRef.current && data.some((c) => c.id === autoId)) {
          setSelectedContactId(autoId)
          autoMatchHandledRef.current = true
        } else if (data.length === 1 && !autoMatchHandledRef.current) {
          setSelectedContactId(data[0].id)
        } else if (!autoMatchHandledRef.current) {
          setSelectedContactId(null)
        }
      })
  }, [selectedBusinessId])

  // --- Track unsaved changes + warn on leave ---
  useEffect(() => { setIsDirty(rawText.length > 0) }, [rawText])

  useEffect(() => {
    const handle = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handle)
    return () => window.removeEventListener('beforeunload', handle)
  }, [isDirty])

  // --- Validation ---
  const validate = () => {
    const errs: typeof errors = {}
    if (!selectedBusinessId) errs.business = 'Business is required'
    if (!selectedContactId && entryType !== 'Note') errs.contact = 'Contact is required'
    if (!entryDateOnly) errs.entryDate = 'Entry date is required'
    if ((entryType === 'Email' || entryType === 'Email Thread') && !direction) errs.direction = 'Direction is required for emails'
    if (!rawText.trim()) errs.rawText = 'Entry text is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // --- Build entry_date helper ---
  const buildEntryDate = () =>
    entryTime ? `${entryDateOnly}T${entryTime}:00` : `${entryDateOnly}T12:00:00`

  // --- Build common payload ---
  const buildPayload = () => ({
    business_id: selectedBusinessId!,
    contact_id: selectedContactId || undefined,
    cc_contact_ids: ccContactIds.length > 0 ? ccContactIds : undefined,
    bcc_contact_ids: bccContactIds.length > 0 ? bccContactIds : undefined,
    raw_text_original: rawText,
    entry_date: buildEntryDate(),
    type: entryType || undefined,
    direction: direction || undefined,
    action_needed: actionNeeded,
    due_at: dueAt || undefined,
    email_source: emailSourceMetadata || undefined,
    thread_participants: threadParticipants || undefined,
    internal_sender: internalSender || undefined,
    quoted_content: quotedContent,
  })

  // --- Post-save navigation ---
  const afterSave = (actionsResolved?: number, threadsPromoted?: number) => {
    if (actionsResolved) toast.info(`${actionsResolved} action${actionsResolved > 1 ? 's' : ''} auto-resolved`)
    if (threadsPromoted) toast.info(`${threadsPromoted} open thread${threadsPromoted > 1 ? 's' : ''} flagged`)
    setIsDirty(false)
    clearDraft()
    if (searchParams.get('onboarding') === 'true') {
      router.push('/onboarding/email-forwarding')
    } else {
      router.push(`/businesses/${selectedBusinessId}?saved=true`)
    }
  }

  // --- Submit handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsLoading(true)
    setFormattingError(null)

    if (!bypassDuplicateCheck && selectedBusinessId) {
      const dup = await checkForDuplicates(rawText, selectedBusinessId)
      if (dup.isDuplicate && dup.existingEntry) {
        setDuplicateEntry(dup.existingEntry)
        setShowDuplicateWarning(true)
        setIsLoading(false)
        return
      }
    }

    setIsFormatting(true)
    const formatResult = await formatCorrespondenceText(rawText, shouldSplit)
    setIsFormatting(false)

    if ('error' in formatResult) {
      setFormattingError(formatResult.error || 'Formatting failed')
      setIsLoading(false)
      return
    }

    // Pre-fill action if AI detected one with medium/high confidence
    const data = formatResult.data as unknown as Record<string, unknown>
    const actionHint = (data.action_suggestion || (data.entries as Record<string, unknown>[])?.[0]?.action_suggestion) as Record<string, unknown> | undefined
    if (actionHint && (actionHint.confidence === 'medium' || actionHint.confidence === 'high') && actionNeeded === 'none') {
      setActionNeeded(actionHint.action_type as typeof actionNeeded)
      if (actionHint.suggested_due_date && !dueAt) setDueAt(actionHint.suggested_due_date as string)
    }

    if (isThreadSplitResponse(formatResult.data) && formatResult.data.entries.length > 1) {
      setContactMatches(matchEntriesToContacts(formatResult.data.entries, contacts))
      setPendingAiResponse(formatResult.data)
      setQuotedContent(formatResult.quotedContent)
      setShowMatchPreview(true)
      setIsLoading(false)
    } else {
      setQuotedContent(formatResult.quotedContent)
      setPreviewData(formatResult.data)
      setPreviewText((data.formatted_text || (data.entries as Record<string, unknown>[])?.[0]?.formatted_text || '') as string)
      setShowPreview(true)
      setIsLoading(false)
    }
  }

  // --- AI preview handlers ---
  const handleConfirmPreview = async () => {
    if (!previewData || !selectedBusinessId) return
    setIsLoading(true)
    setShowPreview(false)
    setActionError(null)
    const result = await createFormattedCorrespondence(buildPayload(), previewData)
    if ('error' in result) { setActionError(`Error saving: ${result.error}`); setIsLoading(false) }
    else afterSave('actionsResolved' in result ? result.actionsResolved : 0, 'threadsPromoted' in result ? result.threadsPromoted : 0)
  }

  const handleEditPreview = () => { setShowPreview(false); setPreviewData(null); setPreviewText('') }

  const handleConfirmMatches = async (confirmedMatches: ContactMatchResult[], selectedIndices: number[]) => {
    if (!pendingAiResponse || !selectedBusinessId) return
    setIsLoading(true)
    setShowMatchPreview(false)

    let filteredAiResponse = pendingAiResponse
    let filteredMatches = confirmedMatches

    if (isThreadSplitResponse(pendingAiResponse) && selectedIndices.length < pendingAiResponse.entries.length) {
      filteredAiResponse = { ...pendingAiResponse, entries: selectedIndices.map((i) => pendingAiResponse.entries[i]) }
      filteredMatches = selectedIndices.map((i) => confirmedMatches[i])
    }

    const result = await createFormattedCorrespondence(buildPayload(), filteredAiResponse, filteredMatches)
    if ('error' in result) { setActionError(`Error saving: ${result.error}`); setIsLoading(false) }
    else afterSave('actionsResolved' in result ? result.actionsResolved : 0, 'threadsPromoted' in result ? result.threadsPromoted : 0)
  }

  // --- Save without formatting ---
  const handleSaveUnformatted = async () => {
    if (!selectedBusinessId) return
    setIsLoading(true)
    setFormattingError(null)

    if (!bypassDuplicateCheck) {
      const dup = await checkForDuplicates(rawText, selectedBusinessId)
      if (dup.isDuplicate && dup.existingEntry) {
        setDuplicateEntry(dup.existingEntry)
        setShowDuplicateWarning(true)
        setIsLoading(false)
        return
      }
    }

    const result = await createUnformattedCorrespondence({
      business_id: selectedBusinessId,
      contact_id: selectedContactId || undefined,
      cc_contact_ids: ccContactIds.length > 0 ? ccContactIds : undefined,
      bcc_contact_ids: bccContactIds.length > 0 ? bccContactIds : undefined,
      raw_text_original: rawText,
      entry_date: buildEntryDate(),
      subject: subject || undefined,
      type: entryType || undefined,
      direction: direction || undefined,
      action_needed: actionNeeded,
      due_at: dueAt || undefined,
      thread_participants: threadParticipants || undefined,
      internal_sender: internalSender || undefined,
    })

    if ('error' in result) { setActionError(`Error saving: ${result.error}`); setIsLoading(false) }
    else afterSave('actionsResolved' in result ? result.actionsResolved : 0, 'threadsPromoted' in result ? result.threadsPromoted : 0)
  }

  // --- Business / contact handlers ---
  const handleBusinessSelect = async (businessId: string) => {
    if (businessId !== selectedBusinessId) autoMatchHandledRef.current = false
    setSelectedBusinessId(businessId || null)
    setErrors((prev) => ({ ...prev, business: undefined }))

    if (businessId && senderEmailData) {
      const biz = businesses.find((b) => b.id === businessId)
      if (biz && !biz.email) {
        const domain = senderEmailData.email.split('@')[1]
        const isKnownContact = contacts.some((c) =>
          c.emails?.some((e) => e.toLowerCase() === senderEmailData.email.toLowerCase())
        )
        if (!isKnownContact && domain) {
          setSuggestedBusinessEmail(`info@${domain}`)
          setShowBusinessEmailPrompt(true)
        }
      }
    }
  }

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId || null)
    setErrors((prev) => ({ ...prev, contact: undefined }))
  }

  const handleBusinessAdded = (business: Business) => {
    setBusinesses((prev) => [...prev, business])
    setSelectedBusinessId(business.id)
  }

  const handleContactAdded = (contact: Contact) => {
    setContacts((prev) => [...prev, contact])
    setSelectedContactId(contact.id)
  }

  const handleAcceptBusinessEmail = async () => {
    if (!selectedBusinessId || !suggestedBusinessEmail) return
    try {
      const res = await fetch('/api/businesses/update-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: selectedBusinessId, email: suggestedBusinessEmail }),
      })
      if (res.ok) {
        setBusinesses((prev) => prev.map((b) => b.id === selectedBusinessId ? { ...b, email: suggestedBusinessEmail } : b))
        setShowBusinessEmailPrompt(false)
        setSuggestedBusinessEmail(null)
      } else {
        setActionError('Failed to add email to business')
      }
    } catch {
      setActionError('Error adding email to business')
    }
  }

  const handleContactsAdded = async (count: number) => {
    setContactsAdded(count)
    if (selectedBusinessId) {
      const res = await fetch(`/api/contacts?businessId=${selectedBusinessId}`)
      if (res.ok) setContacts(await res.json())
    }
  }

  const handleSaveAnyway = () => {
    setShowDuplicateWarning(false)
    setBypassDuplicateCheck(true)
    const form = document.querySelector('form')
    if (form) form.requestSubmit()
  }

  // --- Email selection early return ---
  if (showEmailSelection && pendingEmails.length > 1) {
    return (
      <EmailSelectionDialog
        emails={pendingEmails}
        selectedIndices={selectedEmailIndices}
        onToggle={(i) => {
          const next = new Set(selectedEmailIndices)
          if (next.has(i)) next.delete(i); else next.add(i)
          setSelectedEmailIndices(next)
        }}
        onImport={async (selected) => {
          setShowEmailSelection(false)
          await applyPendingEmail(selected[0])
          if (selected.length > 1) {
            setActionWarning(
              `Importing 1 of ${selected.length} selected emails. After saving, use the bookmarklet selection again for the remaining ${selected.length - 1}.`
            )
          }
        }}
        onCancel={() => setShowEmailSelection(false)}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white px-8 py-6 border border-gray-200 shadow-[var(--shadow-sm)]">
            <p className="text-lg font-semibold text-gray-900">Loading email data...</p>
          </div>
        </div>
      )}

      {searchParams.get('onboarding') === 'true' && (
        <div className="flex items-center justify-between px-4 py-3 rounded-sm mb-6" style={{ backgroundColor: 'var(--header-bg)' }}>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="inline-block w-5 h-1 rounded-full bg-white opacity-30" />
              <span className="inline-block w-5 h-1 rounded-full bg-white opacity-30" />
              <span className="inline-block w-5 h-1 rounded-full bg-white opacity-30" />
              <span className="inline-block w-5 h-1 rounded-full bg-white opacity-90" />
            </div>
            <span className="text-sm font-semibold text-white">Step 4 of 4 — Add your first entry</span>
          </div>
          <a href={`/businesses/${businessIdFromQuery}`} className="text-xs text-white opacity-60 hover:opacity-100 transition-opacity">
            Skip for now
          </a>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-4">New Entry</h1>


      {actionError && (
        <div role="alert" className="bg-red-50 border border-red-300 p-4 mb-6">
          <div className="flex justify-between items-start">
            <p className="text-sm text-red-900 font-semibold">{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-red-900 hover:text-red-700 text-sm font-bold ml-4" aria-label="Dismiss error">Dismiss</button>
          </div>
        </div>
      )}

      {actionWarning && (
        <div role="status" className="bg-yellow-50 border border-yellow-400 p-4 mb-6">
          <div className="flex justify-between items-start">
            <p className="text-sm text-yellow-900">{actionWarning}</p>
            <button onClick={() => setActionWarning(null)} className="text-yellow-900 hover:text-yellow-700 text-sm font-bold ml-4" aria-label="Dismiss warning">Dismiss</button>
          </div>
        </div>
      )}

      {emailImported && (
        <div className="mb-6 border border-brand-navy/30 bg-brand-navy/[0.04] px-4 py-3">
          <p className="text-brand-dark font-semibold text-sm">Email imported</p>
          <p className="text-brand-navy text-sm mt-1">Please verify business and contact selection, then save the entry.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <FilingSection
          businesses={businesses}
          contacts={contacts}
          selectedBusinessId={selectedBusinessId}
          selectedContactId={selectedContactId}
          ccContactIds={ccContactIds}
          bccContactIds={bccContactIds}
          entryType={entryType}
          errors={errors}
          suggestedBusinessEmail={suggestedBusinessEmail}
          showBusinessEmailPrompt={showBusinessEmailPrompt}
          senderEmailData={senderEmailData}
          onBusinessSelect={handleBusinessSelect}
          onContactSelect={handleContactSelect}
          onAddNewBusiness={() => setShowAddBusiness(true)}
          onAddNewContact={() => {
            if (!selectedBusinessId) { setErrors((prev) => ({ ...prev, business: 'Please select a business first' })); return }
            setShowAddContact(true)
          }}
          onContactUpdated={(c) => setContacts((prev) => prev.map((x) => x.id === c.id ? c : x))}
          onCcChange={setCcContactIds}
          onBccChange={setBccContactIds}
          onAcceptBusinessEmail={handleAcceptBusinessEmail}
          onDeclineBusinessEmail={() => { setShowBusinessEmailPrompt(false); setSuggestedBusinessEmail(null) }}
        />

        <EntryDetailsSection
          entryDateOnly={entryDateOnly}
          entryTime={entryTime}
          entryType={entryType}
          direction={direction}
          internalSender={internalSender}
          threadParticipants={threadParticipants}
          errors={errors}
          onDateChange={(v) => { setEntryDateOnly(v); setErrors((p) => ({ ...p, entryDate: undefined })) }}
          onTimeChange={setEntryTime}
          onKindChange={(type, dir) => { setEntryType(type); setDirection(dir); setErrors((p) => ({ ...p, direction: undefined })) }}
          onInternalSenderChange={setInternalSender}
          onThreadParticipantsChange={setThreadParticipants}
        />

        <TextInputSection
          rawText={rawText}
          draftStatus={draftStatus}
          error={errors.rawText}
          threadDetection={threadDetection}
          shouldSplit={shouldSplit}
          formattingError={formattingError}
          extractedContacts={extractedContacts}
          contactsAdded={contactsAdded}
          selectedBusinessId={selectedBusinessId}
          businesses={businesses}
          isLoading={isLoading}
          onChange={setRawText}
          onShouldSplitChange={setShouldSplit}
          onShowContactModal={() => setShowContactModal(true)}
          onSaveUnformatted={handleSaveUnformatted}
        />

        {/* Optional Details */}
        <div className="bg-gray-50 border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Optional Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Label htmlFor="subject" className="block mb-2 font-semibold">Subject</Label>
              <Input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief subject or title"
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="actionNeeded" className="block mb-2 font-semibold">Action Needed</Label>
              <select
                id="actionNeeded"
                value={actionNeeded}
                onChange={(e) => setActionNeeded(e.target.value as typeof actionNeeded)}
                className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:border-brand-navy"
              >
                <option value="none">None</option>
                <option value="prospect">Prospect</option>
                <option value="follow_up">Follow Up</option>
                <option value="waiting_on_them">Waiting on Them</option>
                <option value="invoice">Invoice</option>
                <option value="renewal">Renewal</option>
              </select>
            </div>
            {actionNeeded !== 'none' && (
              <div>
                <Label htmlFor="dueAt" className="block mb-2 font-semibold">Due Date</Label>
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

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={isLoading || isFormatting}
            className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-3 font-semibold"
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

      {showPreview && previewData && (
        <AIPreviewPanel
          previewData={previewData}
          previewText={previewText}
          isLoading={isLoading}
          onConfirm={handleConfirmPreview}
          onEdit={handleEditPreview}
          onSaveUnformatted={handleSaveUnformatted}
        />
      )}

      <AddBusinessModal
        isOpen={showAddBusiness}
        onClose={() => setShowAddBusiness(false)}
        onBusinessAdded={handleBusinessAdded}
      />

      {selectedBusinessId && (
        <AddContactModal
          isOpen={showAddContact}
          onClose={() => setShowAddContact(false)}
          businessId={selectedBusinessId}
          onContactAdded={handleContactAdded}
        />
      )}

      {selectedBusinessId && (
        <ContactExtractionModal
          isOpen={showContactModal}
          onClose={() => setShowContactModal(false)}
          extractedContacts={extractedContacts}
          businessId={selectedBusinessId}
          onContactsAdded={handleContactsAdded}
        />
      )}

      {pendingAiResponse && isThreadSplitResponse(pendingAiResponse) && selectedContactId && (
        <ContactMatchPreviewModal
          isOpen={showMatchPreview}
          onClose={() => { setShowMatchPreview(false); setIsLoading(false) }}
          entries={pendingAiResponse.entries}
          contacts={contacts}
          initialMatches={contactMatches}
          defaultContactId={selectedContactId}
          onConfirm={handleConfirmMatches}
          isLoading={isLoading}
        />
      )}

      {duplicateEntry && (
        <DuplicateWarningModal
          isOpen={showDuplicateWarning}
          onClose={() => { setShowDuplicateWarning(false); setDuplicateEntry(null); setIsLoading(false) }}
          existingEntry={duplicateEntry}
          onSaveAnyway={handleSaveAnyway}
          isSaving={isLoading}
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
