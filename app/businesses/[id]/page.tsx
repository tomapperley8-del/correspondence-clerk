'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getBusinessById, type Business } from '@/app/actions/businesses'
import { getContactsByBusiness, deleteContact, type Contact } from '@/app/actions/contacts'
import { getCorrespondenceByBusiness, updateFormattedText, deleteCorrespondence, updateCorrespondenceDirection, type Correspondence } from '@/app/actions/correspondence'
import { getDisplayNamesForUsers } from '@/app/actions/user-profile'
import { AddContactButton } from '@/components/AddContactButton'
import { EditBusinessButton } from '@/components/EditBusinessButton'
import { EditBusinessDetailsButton } from '@/components/EditBusinessDetailsButton'
import { EditContactButton } from '@/components/EditContactButton'
import { ExportDropdown } from '@/components/ExportDropdown'
import { CorrespondenceSummary } from '@/components/CorrespondenceSummary'
import { ActionSuggestions } from '@/components/ActionSuggestions'
import { ContractDetailsCard } from '@/components/ContractDetailsCard'
import { SuccessBanner } from '@/components/SuccessBanner'
import { retryFormatting } from '@/app/actions/ai-formatter'

export default function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [correspondence, setCorrespondence] = useState<Correspondence[]>([])
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({})
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formattingInProgress, setFormattingInProgress] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState<string>('')
  const [editedDate, setEditedDate] = useState<string>('')
  const [editedDirection, setEditedDirection] = useState<'received' | 'sent' | ''>('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Feature #3: AI summary refresh trigger
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0)

  // Feature #4: Correspondence view controls state
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest')
  const [contactFilter, setContactFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'received' | 'sent' | 'conversation'>('all')

  useEffect(() => {
    async function loadParams() {
      const p = await params
      const sp = await searchParams
      setId(p.id)
      setSaved(sp.saved || null)
    }
    loadParams()
  }, [params, searchParams])

  // Feature #4: Load filter preferences from localStorage
  useEffect(() => {
    if (!id) return

    const storageKey = `business_${id}_view`
    const savedPrefs = localStorage.getItem(storageKey)
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs)
        if (prefs.sortOrder) setSortOrder(prefs.sortOrder)
        if (prefs.contactFilter) setContactFilter(prefs.contactFilter)
        if (prefs.directionFilter) setDirectionFilter(prefs.directionFilter)
      } catch (e) {
        console.error('Error loading view preferences:', e)
      }
    }
  }, [id])

  // Feature #4: Save filter preferences to localStorage
  useEffect(() => {
    if (!id) return

    const storageKey = `business_${id}_view`
    const prefs = {
      sortOrder,
      contactFilter,
      directionFilter,
    }
    localStorage.setItem(storageKey, JSON.stringify(prefs))
  }, [id, sortOrder, contactFilter, directionFilter])

  useEffect(() => {
    if (!id) return

    async function loadData() {
      if (!id) return // Type guard for nested function

      const businessResult = await getBusinessById(id)
      if ('error' in businessResult || !businessResult.data) {
        router.push('/dashboard')
        return
      }

      const contactsResult = await getContactsByBusiness(id)
      const correspondenceResult = await getCorrespondenceByBusiness(id)

      setBusiness(businessResult.data)
      setContacts('error' in contactsResult ? [] : contactsResult.data || [])
      const correspondenceData = 'error' in correspondenceResult ? [] : correspondenceResult.data || []
      setCorrespondence(correspondenceData)

      // Fetch display names for all users who created correspondence
      const userIds = [...new Set(correspondenceData.map((c) => c.user_id))]
      if (userIds.length > 0) {
        const displayNamesResult = await getDisplayNamesForUsers(userIds)
        if (displayNamesResult.data) {
          const namesMap: Record<string, string> = {}
          displayNamesResult.data.forEach((item) => {
            namesMap[item.id] = item.display_name || ''
          })
          setDisplayNames(namesMap)
        }
      }

      setLoading(false)
    }

    loadData()
  }, [id, router])

  // Scroll to entry if hash is present in URL (for "View Existing Entry" from duplicate warning)
  useEffect(() => {
    if (!loading && typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.substring(1) // Remove the #
      const element = document.getElementById(hash)
      if (element) {
        // Wait a bit for the page to fully render
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Add a subtle highlight effect
          element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-4')
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-4')
          }, 2000)
        }, 100)
      }
    }
  }, [loading])

  // Feature #4: Split correspondence into recent and archive with filters applied
  // Memoize to prevent recalculation on every render
  const { recentEntries, archiveEntries } = useMemo(() => {
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    // Apply contact and direction filters
    let filtered = correspondence.filter((e) => {
      // Contact filter
      if (contactFilter !== 'all' && e.contact_id !== contactFilter) {
        return false
      }

      // Direction filter
      if (directionFilter === 'received' && e.direction !== 'received') {
        return false
      }
      if (directionFilter === 'sent' && e.direction !== 'sent') {
        return false
      }
      if (directionFilter === 'conversation' && e.direction !== 'received' && e.direction !== 'sent') {
        return false
      }

      return true
    })

    // Sort based on user preference
    const sortFn = (a: typeof correspondence[0], b: typeof correspondence[0]) => {
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA
    }

    const recent = filtered
      .filter((e) => new Date(e.entry_date || e.created_at) >= twelveMonthsAgo)
      .sort(sortFn)

    const archive = filtered
      .filter((e) => new Date(e.entry_date || e.created_at) < twelveMonthsAgo)
      .sort(sortFn)

    return { recentEntries: recent, archiveEntries: archive }
  }, [correspondence, contactFilter, directionFilter, sortOrder])

  // Filter correspondence based on search query
  const filteredCorrespondence = useMemo(() => {
    if (!searchQuery.trim()) {
      return { recent: recentEntries, archive: archiveEntries }
    }

    const query = searchQuery.toLowerCase()
    const matchesQuery = (entry: Correspondence) => {
      return (
        entry.subject?.toLowerCase().includes(query) ||
        entry.contact.name.toLowerCase().includes(query) ||
        entry.formatted_text_current?.toLowerCase().includes(query) ||
        entry.formatted_text_original?.toLowerCase().includes(query) ||
        entry.raw_text_original.toLowerCase().includes(query)
      )
    }

    return {
      recent: recentEntries.filter(matchesQuery),
      archive: archiveEntries.filter(matchesQuery),
    }
  }, [recentEntries, archiveEntries, searchQuery])

  if (loading || !business || !id) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  const handleFormatLater = async (entryId: string) => {
    setFormattingInProgress(entryId)

    const result = await retryFormatting(entryId)

    if ('error' in result) {
      alert(`Formatting failed: ${result.error}`)
    } else {
      // Reload correspondence to show updated entry
      if (id) {
        const correspondenceResult = await getCorrespondenceByBusiness(id)
        setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      }
    }

    setFormattingInProgress(null)
  }

  const handleStartEdit = (entry: Correspondence) => {
    setEditingEntryId(entry.id)
    setEditedText(
      entry.formatted_text_current ||
      entry.formatted_text_original ||
      entry.raw_text_original
    )
    setEditedDirection(entry.direction || '')  // Add direction
    // Set date in YYYY-MM-DD format for the input field
    if (entry.entry_date) {
      const date = new Date(entry.entry_date)
      const formattedDate = date.toISOString().split('T')[0]
      setEditedDate(formattedDate)
    } else {
      setEditedDate('')
    }
  }

  const handleCancelEdit = () => {
    setEditingEntryId(null)
    setEditedText('')
    setEditedDate('')
    setEditedDirection('')  // Add direction reset
  }

  const handleSaveEdit = async (entryId: string) => {
    if (!editedText.trim()) {
      alert('Entry text cannot be empty')
      return
    }

    setSavingEdit(true)

    try {
      // Convert edited date to ISO format if provided
      const dateToSave = editedDate ? new Date(editedDate).toISOString() : null

      // Find the original entry to check if direction changed
      const originalEntry = correspondence.find(e => e.id === entryId)
      const directionChanged = originalEntry && originalEntry.direction !== (editedDirection || null)

      // Update formatted text and date
      const textResult = await updateFormattedText(entryId, editedText, dateToSave)

      if ('error' in textResult) {
        alert(`Error saving: ${textResult.error}`)
        setSavingEdit(false)
        return
      }

      // Update direction if changed
      if (directionChanged) {
        const directionResult = await updateCorrespondenceDirection(
          entryId,
          editedDirection === '' ? null : editedDirection as 'received' | 'sent'
        )

        if ('error' in directionResult) {
          alert(`Error updating direction: ${directionResult.error}`)
          setSavingEdit(false)
          return
        }

        // Trigger AI summary refresh if direction changed
        setSummaryRefreshTrigger(prev => prev + 1)
      }

      // Reload correspondence to show updated entry
      if (id) {
        const correspondenceResult = await getCorrespondenceByBusiness(id)
        setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      }

      setEditingEntryId(null)
      setEditedText('')
      setEditedDate('')
      setEditedDirection('')
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    setSavingEdit(false)
  }

  const handleDeleteContact = async (contactId: string, contactName: string) => {
    if (!confirm(`Are you sure you want to delete contact "${contactName}"?`)) {
      return
    }

    const result = await deleteContact(contactId)

    if ('error' in result) {
      alert(`Error deleting contact: ${result.error}`)
    } else {
      // Reload contacts
      if (id) {
        const contactsResult = await getContactsByBusiness(id)
        setContacts('error' in contactsResult ? [] : contactsResult.data || [])
      }
    }
  }

  const handleDeleteEntry = async (entryId: string, subject: string) => {
    if (!confirm(`Are you sure you want to delete this entry${subject ? ` "${subject}"` : ''}? This cannot be undone.`)) {
      return
    }

    const result = await deleteCorrespondence(entryId)

    if ('error' in result) {
      alert(`Error deleting entry: ${result.error}`)
    } else {
      // Reload correspondence
      if (id) {
        const correspondenceResult = await getCorrespondenceByBusiness(id)
        setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      }
    }
  }

  // Feature #3: Handle contract details update with AI summary refresh
  const handleContractUpdate = async () => {
    if (!id) return

    // Reload business data to get updated contract fields
    const businessResult = await getBusinessById(id)
    if ('error' in businessResult || !businessResult.data) {
      window.location.reload()
      return
    }

    setBusiness(businessResult.data)

    // Trigger AI summary refresh
    setSummaryRefreshTrigger((prev) => prev + 1)
  }

  // Helper to extract sender/recipient name from AI metadata
  const getExtractedName = (entry: Correspondence): string | null => {
    if (!entry.ai_metadata) return null
    try {
      const metadata = entry.ai_metadata as any
      // Try to get matched contact name
      if (metadata.matched_contact?.matched_from) {
        return metadata.matched_contact.matched_from
      }
      // Try to get extracted names
      if (metadata.extracted_names?.length > 0) {
        return metadata.extracted_names[0]
      }
    } catch (e) {
      // Silently fail and fall back to contact name
    }
    return null
  }

  const renderEntry = (entry: Correspondence) => {
    const isOverdue = entry.due_at && new Date(entry.due_at) < new Date()
    const directionIcon = entry.direction === 'sent' ? '→' : entry.direction === 'received' ? '←' : null
    const isUnformatted = entry.formatting_status !== 'formatted'
    const isEdited = entry.edited_at !== null
    const isEditing = editingEntryId === entry.id
    const extractedName = getExtractedName(entry)

    return (
      <div id={`entry-${entry.id}`} key={entry.id} className="border-t border-gray-300 pt-6 first:border-t-0 first:pt-0">
        {/* Unformatted indicator */}
        {isUnformatted && (
          <div className="bg-orange-50 border-2 border-orange-600 p-3 mb-3">
            <p className="text-sm text-orange-900 font-semibold mb-2">
              ⚠ Unformatted Entry
            </p>
            <p className="text-xs text-orange-800 mb-2">
              This entry was saved without AI formatting. The raw text is displayed below.
            </p>
            <Button
              onClick={() => handleFormatLater(entry.id)}
              disabled={formattingInProgress === entry.id}
              className="bg-orange-600 text-white hover:bg-orange-700 px-3 py-1 text-xs font-semibold"
            >
              {formattingInProgress === entry.id ? 'Formatting...' : 'Format Now'}
            </Button>
          </div>
        )}

        {/* Subject line with edit indicator */}
        <div className="flex items-center gap-2 mb-2">
          {entry.subject && (
            <h3 className="font-semibold text-gray-900">
              {entry.subject}
            </h3>
          )}
          {isEdited && (
            <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
              Corrected
            </span>
          )}
        </div>

        {/* Prominent direction and contact display */}
        <div className="flex items-center gap-2 mb-2">
          {entry.direction === 'received' && (
            <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800 font-semibold border-2 border-blue-300">
              RECEIVED FROM
            </span>
          )}
          {entry.direction === 'sent' && (
            <span className="text-xs bg-green-100 px-2 py-1 text-green-800 font-semibold border-2 border-green-300">
              SENT TO
            </span>
          )}
          <span className="text-lg font-bold text-gray-900">
            {extractedName || entry.contact.name}
          </span>
          {entry.contact.role && (
            <span className="text-sm text-gray-600">({entry.contact.role})</span>
          )}
        </div>

        {/* Secondary meta line */}
        <div className="text-sm text-gray-600 mb-3">
          {entry.entry_date && <span>{new Date(entry.entry_date).toLocaleDateString('en-GB')}</span>}
          {entry.type && <span> • {entry.type}</span>}
        </div>

        {/* Body text or edit textarea */}
        {isEditing ? (
          <div className="bg-yellow-50 border-2 border-yellow-600 p-4 mb-4">
            <p className="text-sm font-semibold text-yellow-900 mb-3">
              Editing entry (manual correction)
            </p>

            {/* Direction Dropdown */}
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Direction:
              </label>
              <select
                value={editedDirection}
                onChange={(e) => setEditedDirection(e.target.value as 'received' | 'sent' | '')}
                className="w-full max-w-xs px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
              >
                <option value="">-- Unknown Direction --</option>
                <option value="received">Received</option>
                <option value="sent">Sent</option>
              </select>
            </div>

            {/* Date Input */}
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Entry Date:
              </label>
              <input
                type="date"
                value={editedDate}
                onChange={(e) => setEditedDate(e.target.value)}
                className="w-full max-w-xs px-3 py-2 border-2 border-gray-300 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Text Textarea */}
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full min-h-[200px] px-3 py-2 border-2 border-gray-300 text-sm font-mono focus:border-blue-600 focus:outline-none"
            />

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => handleSaveEdit(entry.id)}
                disabled={savingEdit}
                className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 text-sm font-semibold"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                onClick={handleCancelEdit}
                disabled={savingEdit}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 text-sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-800 whitespace-pre-wrap mb-3">
              {entry.formatted_text_current ||
                entry.formatted_text_original ||
                entry.raw_text_original}
            </div>

            {/* Display who created this entry */}
            <div className="text-xs text-gray-500 mb-2">
              Created by {displayNames[entry.user_id] || 'Unknown'}
              {entry.edited_at && entry.edited_by && (
                <span> • Edited by {displayNames[entry.edited_by] || 'Unknown'}</span>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => handleStartEdit(entry)}
                className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-3 py-1 text-xs"
              >
                Edit
              </Button>
              <Button
                onClick={() => handleDeleteEntry(entry.id, entry.subject || '')}
                className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs"
              >
                Delete
              </Button>
              {/* Feature #9: View Original Email in Outlook */}
              {entry.ai_metadata && (entry.ai_metadata as any).email_source && (entry.ai_metadata as any).email_source.web_link && (
                <Button
                  onClick={() => {
                    const webLink = (entry.ai_metadata as any).email_source.web_link
                    try {
                      window.open(webLink, '_blank', 'noopener,noreferrer')
                    } catch (error) {
                      alert('Could not open email link. The email may have been moved or deleted in Outlook.')
                    }
                  }}
                  className="bg-blue-100 text-blue-900 hover:bg-blue-200 px-3 py-1 text-xs"
                >
                  📧 View Original Email
                </Button>
              )}
            </div>
          </>
        )}

        {/* Action needed badge and due date */}
        {entry.action_needed !== 'none' && (
          <div className="mt-3 space-y-2">
            <span className="text-xs bg-yellow-100 px-2 py-1 text-yellow-800">
              Action: {entry.action_needed.replace(/_/g, ' ')}
            </span>
            {entry.due_at && (
              <div className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-yellow-700'}`}>
                Due: {new Date(entry.due_at).toLocaleDateString('en-GB')}
                {isOverdue && ' (Overdue)'}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Success Banner */}
      {saved && <SuccessBanner message="Entry saved successfully" />}

      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 hover:underline text-sm mb-2 inline-block"
        >
          ← Back to Dashboard
        </Link>
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>

            {/* Contract Details */}
            {business.is_club_card && (business.contract_start || business.contract_end) && (
              <div className="text-sm text-gray-700 mt-1">
                <span className="font-semibold">Contract:</span>{' '}
                {business.contract_start && (
                  <span>{new Date(business.contract_start).toLocaleDateString('en-GB')}</span>
                )}
                {business.contract_start && business.contract_end && <span> - </span>}
                {business.contract_end && (
                  <span>{new Date(business.contract_end).toLocaleDateString('en-GB')}</span>
                )}
              </div>
            )}

            {business.is_advertiser && business.deal_terms && (
              <div className="text-sm text-gray-700 mt-1">
                <span className="font-semibold">Deal:</span> {business.deal_terms}
              </div>
            )}
          </div>
          <EditBusinessButton business={business} />
        </div>
        {(business.category || business.status) && (
          <div className="flex gap-2 mt-2">
            {business.category && (
              <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">
                {business.category}
              </span>
            )}
            {business.status && (
              <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">
                {business.status}
              </span>
            )}
            {business.is_club_card && (
              <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
                Club Card
              </span>
            )}
            {business.is_advertiser && (
              <span className="text-xs bg-green-100 px-2 py-1 text-green-800">
                Advertiser
              </span>
            )}
          </div>
        )}
      </div>

      {/* Business Context Box */}
      <div className="bg-gray-50 border-2 border-gray-300 p-4 mb-6">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-sm font-bold text-gray-900 uppercase">Business Details</h3>
          <EditBusinessDetailsButton
            business={business}
            onUpdate={() => window.location.reload()}
          />
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-semibold text-gray-700">Address:</span>
            <span className="ml-2 text-gray-900">{business.address || 'Not set'}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-700">Email:</span>
            <span className="ml-2 text-gray-900">{business.email || 'Not set'}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-700">Phone:</span>
            <span className="ml-2 text-gray-900">{business.phone || 'Not set'}</span>
          </div>
        </div>
      </div>

      {/* AI Summary of Last 12 Months */}
      <CorrespondenceSummary businessId={business.id} business={business} refreshTrigger={summaryRefreshTrigger} />

      {/* AI Action Detection */}
      <ActionSuggestions businessId={business.id} />

      {/* Contract Details */}
      <div className="mb-6">
        <ContractDetailsCard business={business} onUpdate={handleContractUpdate} />
      </div>

      {/* Correspondence Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search correspondence..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 focus:border-blue-600 focus:outline-none"
        />
        {searchQuery && (
          <p className="text-sm text-gray-600 mt-2">
            Showing {filteredCorrespondence.recent.length + filteredCorrespondence.archive.length} matching entries
            <button
              onClick={() => setSearchQuery('')}
              className="ml-2 text-blue-600 hover:underline"
            >
              Clear search
            </button>
          </p>
        )}
      </div>

      {/* Contacts Section */}
      <div className="bg-white border-2 border-gray-300 p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Contacts</h2>
          <AddContactButton businessId={id} />
        </div>

        {contacts && contacts.length === 0 ? (
          <p className="text-gray-600 text-sm">
            No contacts yet. Add a contact to get started.
          </p>
        ) : (
          <div className="space-y-4">
            {contacts?.map((contact) => (
              <div key={contact.id} className="border border-gray-300 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{contact.name}</h3>
                    {contact.role && (
                      <p className="text-sm text-gray-600">{contact.role}</p>
                    )}
                    {contact.emails && contact.emails.length > 0 && (
                      <div className="mt-1">
                        {contact.emails.map((email, index) => (
                          <p key={index} className="text-sm text-gray-600">
                            <a
                              href={`mailto:${email}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {email}
                            </a>
                          </p>
                        ))}
                      </div>
                    )}
                    {contact.phones && contact.phones.length > 0 && (
                      <div>
                        {contact.phones.map((phone, index) => (
                          <p key={index} className="text-sm text-gray-600">
                            <a
                              href={`tel:${phone}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {phone}
                            </a>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <EditContactButton contact={contact} />
                    <Button
                      onClick={() => handleDeleteContact(contact.id, contact.name)}
                      className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Letter File / Correspondence */}
      <div className="bg-white border-2 border-gray-300 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Correspondence</h2>
          <div className="flex gap-3">
            <ExportDropdown businessId={business.id} />
            <Link href={`/new-entry?businessId=${business.id}`}>
              <Button className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold">
                New Entry
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature #4: Correspondence View Controls */}
        {correspondence && correspondence.length > 0 && (
          <div className="border-t-2 border-gray-300 pt-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center mb-3">
              {/* Sort Order */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Sort:
                </label>
                <div className="flex border-2 border-gray-300">
                  <button
                    type="button"
                    onClick={() => setSortOrder('oldest')}
                    className={`px-3 py-1 text-sm font-medium ${
                      sortOrder === 'oldest'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Oldest First
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortOrder('newest')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      sortOrder === 'newest'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Newest First
                  </button>
                </div>
              </div>

              {/* Contact Filter */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Contact:
                </label>
                <select
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                  className="px-3 py-1 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="all">All Contacts</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direction Filter */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Direction:
                </label>
                <div className="flex border-2 border-gray-300">
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('all')}
                    className={`px-3 py-1 text-sm font-medium ${
                      directionFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('received')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      directionFilter === 'received'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Received
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('sent')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      directionFilter === 'sent'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Sent
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('conversation')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      directionFilter === 'conversation'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Conversation
                  </button>
                </div>
              </div>
            </div>

            {/* Entry Count and Reset */}
            <div className="flex justify-between items-center text-sm">
              <p className="text-gray-600">
                Showing {filteredCorrespondence.recent.length + filteredCorrespondence.archive.length} of {correspondence.length} entries
              </p>
              {(sortOrder !== 'oldest' || contactFilter !== 'all' || directionFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('oldest')
                    setContactFilter('all')
                    setDirectionFilter('all')
                  }}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Reset to default view
                </button>
              )}
            </div>
          </div>
        )}

        {correspondence && correspondence.length === 0 ? (
          <p className="text-gray-600 text-sm">
            No correspondence yet. Add your first entry to start building the
            letter file.
          </p>
        ) : (
          <>
            {/* Recent Section (Last 12 Months) */}
            {filteredCorrespondence.recent.length > 0 && (
              <div className="mb-8">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">
                  Recent (Last 12 Months)
                </h3>
                <div className="space-y-6">
                  {filteredCorrespondence.recent.map((entry) => renderEntry(entry))}
                </div>
              </div>
            )}

            {/* Archive Section (Older than 12 Months) */}
            {filteredCorrespondence.archive.length > 0 && (
              <div>
                <button
                  onClick={() => setIsArchiveExpanded(!isArchiveExpanded)}
                  className="w-full flex justify-between items-center font-bold text-gray-900 mb-4 text-lg hover:text-blue-600"
                >
                  <span>Archive ({filteredCorrespondence.archive.length} older entries)</span>
                  <span>{isArchiveExpanded ? '▼' : '▶'}</span>
                </button>
                {isArchiveExpanded && (
                  <div className="space-y-6 pl-4 border-l-2 border-gray-300">
                    {filteredCorrespondence.archive.map((entry) => renderEntry(entry))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
