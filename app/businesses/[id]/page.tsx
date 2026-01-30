'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { getBusinessById, type Business } from '@/app/actions/businesses'
import { getContactsByBusiness, deleteContact, type Contact } from '@/app/actions/contacts'
import { getCorrespondenceByBusiness, updateFormattedText, deleteCorrespondence, updateCorrespondenceDirection, updateCorrespondenceContact, findDuplicatesInBusiness, type Correspondence } from '@/app/actions/correspondence'
import { dismissDuplicatePair } from '@/app/actions/duplicate-dismissals'
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
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CopyButton } from '@/components/CopyButton'
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
  const [editedContactId, setEditedContactId] = useState<string>('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Error and confirmation state
  const [actionError, setActionError] = useState<string | null>(null)
  const [showDeleteContactConfirm, setShowDeleteContactConfirm] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<{id: string, name: string} | null>(null)
  const [showDeleteEntryConfirm, setShowDeleteEntryConfirm] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<{id: string, subject?: string} | null>(null)

  // Feature #3: AI summary refresh trigger
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0)

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<Array<{
    hash: string
    entries: Array<{
      id: string
      content_hash: string | null
      subject: string | null
      entry_date: string | null
      contact: { name: string } | null
    }>
  }>>([])
  const [dismissingDuplicate, setDismissingDuplicate] = useState<string | null>(null)
  const [deletingDuplicate, setDeletingDuplicate] = useState<string | null>(null)

  // Feature #4: Correspondence view controls state
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest')
  const [contactFilter, setContactFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'received' | 'sent' | 'conversation'>('all')
  const [dateRange, setDateRange] = useState<'1m' | '6m' | '12m' | 'custom'>('12m')
  const [customDateFrom, setCustomDateFrom] = useState<string>('')
  const [customDateTo, setCustomDateTo] = useState<string>('')

  // Load More pagination state
  const [recentDisplayCount, setRecentDisplayCount] = useState(50)
  const [archiveDisplayCount, setArchiveDisplayCount] = useState(50)

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
        if (prefs.dateRange) setDateRange(prefs.dateRange)
        if (prefs.customDateFrom) setCustomDateFrom(prefs.customDateFrom)
        if (prefs.customDateTo) setCustomDateTo(prefs.customDateTo)
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
      dateRange,
      customDateFrom,
      customDateTo,
    }
    localStorage.setItem(storageKey, JSON.stringify(prefs))
  }, [id, sortOrder, contactFilter, directionFilter, dateRange, customDateFrom, customDateTo])

  // Reset display counts when filters change
  useEffect(() => {
    setRecentDisplayCount(50)
    setArchiveDisplayCount(50)
  }, [contactFilter, directionFilter, dateRange, customDateFrom, customDateTo, searchQuery])

  useEffect(() => {
    if (!id) return

    async function loadData() {
      if (!id) return // Type guard for nested function

      // Fetch all data in parallel for faster page load
      const [businessResult, contactsResult, correspondenceResult, duplicatesResult] = await Promise.all([
        getBusinessById(id),
        getContactsByBusiness(id),
        getCorrespondenceByBusiness(id),
        findDuplicatesInBusiness(id),
      ])

      if ('error' in businessResult || !businessResult.data) {
        router.push('/dashboard')
        return
      }

      setBusiness(businessResult.data)
      setContacts('error' in contactsResult ? [] : contactsResult.data || [])
      const correspondenceData = 'error' in correspondenceResult ? [] : correspondenceResult.data || []
      setCorrespondence(correspondenceData)
      setDuplicates(duplicatesResult.duplicates || [])

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
    // Calculate cutoff date based on selected range
    let cutoffDate: Date
    if (dateRange === 'custom' && customDateFrom) {
      cutoffDate = new Date(customDateFrom)
    } else {
      cutoffDate = new Date()
      switch (dateRange) {
        case '1m':
          cutoffDate.setMonth(cutoffDate.getMonth() - 1)
          break
        case '6m':
          cutoffDate.setMonth(cutoffDate.getMonth() - 6)
          break
        case '12m':
        default:
          cutoffDate.setMonth(cutoffDate.getMonth() - 12)
          break
      }
    }

    // For custom range, also use the "to" date if set
    const endDate = dateRange === 'custom' && customDateTo ? new Date(customDateTo) : null

    // Apply contact and direction filters
    const filtered = correspondence.filter((e) => {
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
      .filter((e) => {
        const entryDate = new Date(e.entry_date || e.created_at)
        const afterCutoff = entryDate >= cutoffDate
        const beforeEnd = endDate ? entryDate <= endDate : true
        return afterCutoff && beforeEnd
      })
      .sort(sortFn)

    const archive = filtered
      .filter((e) => {
        const entryDate = new Date(e.entry_date || e.created_at)
        // In custom mode with end date, archive is entries outside the range
        if (endDate) {
          return entryDate < cutoffDate || entryDate > endDate
        }
        return entryDate < cutoffDate
      })
      .sort(sortFn)

    return { recentEntries: recent, archiveEntries: archive }
  }, [correspondence, contactFilter, directionFilter, sortOrder, dateRange, customDateFrom, customDateTo])

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

  // Sliced arrays for pagination
  const displayedRecent = filteredCorrespondence.recent.slice(0, recentDisplayCount)
  const displayedArchive = filteredCorrespondence.archive.slice(0, archiveDisplayCount)
  const remainingRecent = Math.max(0, filteredCorrespondence.recent.length - recentDisplayCount)
  const remainingArchive = Math.max(0, filteredCorrespondence.archive.length - archiveDisplayCount)

  if (loading || !business || !id) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  const handleFormatLater = async (entryId: string) => {
    setFormattingInProgress(entryId)
    setActionError(null)

    const result = await retryFormatting(entryId)

    if ('error' in result) {
      setActionError(`Formatting failed: ${result.error}`)
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
    setActionError(null)
    setEditedText(
      entry.formatted_text_current ||
      entry.formatted_text_original ||
      entry.raw_text_original
    )
    setEditedDirection(entry.direction || '')
    setEditedContactId(entry.contact_id)
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
    setEditedDirection('')
    setEditedContactId('')
    setActionError(null)
  }

  const handleSaveEdit = async (entryId: string) => {
    if (!editedText.trim()) {
      setActionError('Entry text cannot be empty')
      return
    }

    setSavingEdit(true)
    setActionError(null)

    try {
      // Convert edited date to ISO format if provided
      const dateToSave = editedDate ? new Date(editedDate).toISOString() : null

      // Find the original entry to check if direction or contact changed
      const originalEntry = correspondence.find(e => e.id === entryId)
      const directionChanged = originalEntry && originalEntry.direction !== (editedDirection || null)
      const contactChanged = originalEntry && originalEntry.contact_id !== editedContactId

      // Update formatted text and date
      const textResult = await updateFormattedText(entryId, editedText, dateToSave)

      if ('error' in textResult) {
        setActionError(`Error saving: ${textResult.error}`)
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
          setActionError(`Error updating direction: ${directionResult.error}`)
          setSavingEdit(false)
          return
        }

        // Trigger AI summary refresh if direction changed
        setSummaryRefreshTrigger(prev => prev + 1)
      }

      // Update contact if changed
      if (contactChanged && editedContactId) {
        const contactResult = await updateCorrespondenceContact(entryId, editedContactId)

        if ('error' in contactResult) {
          setActionError(`Error updating contact: ${contactResult.error}`)
          setSavingEdit(false)
          return
        }
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
      setEditedContactId('')
    } catch (err) {
      setActionError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    setSavingEdit(false)
  }

  const handleDeleteContact = (contactId: string, contactName: string) => {
    // Set the contact to delete and show confirmation dialog
    setContactToDelete({ id: contactId, name: contactName })
    setShowDeleteContactConfirm(true)
  }

  const confirmDeleteContact = async () => {
    if (!contactToDelete) return

    setShowDeleteContactConfirm(false)
    setActionError(null)

    const result = await deleteContact(contactToDelete.id)

    if ('error' in result) {
      setActionError(`Error deleting contact: ${result.error}`)
    } else {
      // Reload contacts
      if (id) {
        const contactsResult = await getContactsByBusiness(id)
        setContacts('error' in contactsResult ? [] : contactsResult.data || [])
      }
    }

    setContactToDelete(null)
  }

  const handleDeleteEntry = async (entryId: string, subject: string) => {
    setEntryToDelete({ id: entryId, subject: subject || undefined })
    setShowDeleteEntryConfirm(true)
  }

  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return

    setShowDeleteEntryConfirm(false)
    setActionError(null)

    const result = await deleteCorrespondence(entryToDelete.id)

    if ('error' in result) {
      setActionError(`Error deleting entry: ${result.error}`)
    } else {
      // Reload correspondence
      if (id) {
        const correspondenceResult = await getCorrespondenceByBusiness(id)
        setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      }
    }

    setEntryToDelete(null)
  }

  // Duplicate detection handlers
  const handleDeleteDuplicate = async (entryId: string, hash: string) => {
    if (!id) return
    setDeletingDuplicate(hash)
    setActionError(null)

    const result = await deleteCorrespondence(entryId)

    if ('error' in result) {
      setActionError(`Error deleting entry: ${result.error}`)
    } else {
      // Refresh both correspondence and duplicates
      const [correspondenceResult, duplicatesResult] = await Promise.all([
        getCorrespondenceByBusiness(id),
        findDuplicatesInBusiness(id)
      ])
      setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      setDuplicates(duplicatesResult.duplicates || [])
    }

    setDeletingDuplicate(null)
  }

  const handleDismissDuplicate = async (id1: string, id2: string, hash: string) => {
    if (!id) return
    setDismissingDuplicate(hash)
    setActionError(null)

    const result = await dismissDuplicatePair(id, id1, id2)

    if ('error' in result) {
      setActionError(`Error dismissing duplicate: ${result.error}`)
    } else {
      // Refresh duplicates list
      const duplicatesResult = await findDuplicatesInBusiness(id)
      setDuplicates(duplicatesResult.duplicates || [])
    }

    setDismissingDuplicate(null)
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
    } catch {
      // Silently fail and fall back to contact name
    }
    return null
  }

  const renderEntry = (entry: Correspondence) => {
    const isOverdue = entry.due_at && new Date(entry.due_at) < new Date()
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

        {/* CC Contacts */}
        {entry.cc_contacts && entry.cc_contacts.length > 0 && (
          <div className="text-sm text-gray-600 mt-1">
            <span className="font-medium">CC: </span>
            {entry.cc_contacts.map((cc: { id: string; name: string; role: string | null }, idx: number) => (
              <span key={cc.id}>
                {cc.name}
                {cc.role && <span className="text-gray-400"> ({cc.role})</span>}
                {idx < (entry.cc_contacts?.length || 0) - 1 && ', '}
              </span>
            ))}
          </div>
        )}

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

            {/* Contact Dropdown */}
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Contact:
              </label>
              <select
                value={editedContactId}
                onChange={(e) => setEditedContactId(e.target.value)}
                className="w-full max-w-xs px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
              >
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}{contact.role ? ` (${contact.role})` : ''}
                  </option>
                ))}
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
                    } catch {
                      setActionError('Could not open email link. The email may have been moved or deleted in Outlook.')
                    }
                  }}
                  className="bg-blue-100 text-blue-900 hover:bg-blue-200 px-3 py-1 text-xs"
                >
                  View Original Email
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
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: business.name },
      ]} />

      {/* Success Banner */}
      {saved && <SuccessBanner message="Entry saved successfully" />}

      {/* Action Error Banner */}
      {actionError && (
        <div role="alert" className="bg-red-50 border-2 border-red-600 p-4 mb-6">
          <div className="flex justify-between items-start">
            <p className="text-sm text-red-900 font-semibold">{actionError}</p>
            <button
              onClick={() => setActionError(null)}
              className="text-red-900 hover:text-red-700 text-sm font-bold ml-4"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Warning Banner */}
      {duplicates.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-600 p-4 mb-6">
          <h3 className="font-semibold text-orange-900 mb-2">
            {duplicates.length} Potential Duplicate{duplicates.length !== 1 ? 's' : ''} Found
          </h3>
          {duplicates.map((dup) => (
            <div key={dup.hash} className="border-t border-orange-300 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
              <p className="text-sm text-orange-800 mb-2">
                <strong>{dup.entries.length} entries</strong> with identical content:
              </p>
              <ul className="text-sm text-orange-700 mb-2 space-y-1">
                {dup.entries.map(entry => (
                  <li key={entry.id}>
                    {entry.subject || 'No subject'} ({entry.entry_date ? new Date(entry.entry_date).toLocaleDateString('en-GB') : 'No date'}) - {entry.contact?.name || 'Unknown contact'}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDeleteDuplicate(dup.entries[dup.entries.length - 1].id, dup.hash)}
                  disabled={deletingDuplicate === dup.hash || dismissingDuplicate === dup.hash}
                  className="px-3 py-1 text-xs bg-red-100 text-red-900 hover:bg-red-200 disabled:opacity-50"
                >
                  {deletingDuplicate === dup.hash ? 'Deleting...' : 'Delete Newer Entry'}
                </button>
                {dup.entries.length === 2 && (
                  <button
                    onClick={() => handleDismissDuplicate(dup.entries[0].id, dup.entries[1].id, dup.hash)}
                    disabled={deletingDuplicate === dup.hash || dismissingDuplicate === dup.hash}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {dismissingDuplicate === dup.hash ? 'Dismissing...' : 'Not a Duplicate'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
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
        {(business.category || business.status || business.membership_type) && (
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
            {business.membership_type === 'club_card' && (
              <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
                Club Card
              </span>
            )}
            {business.membership_type === 'advertiser' && (
              <span className="text-xs bg-green-100 px-2 py-1 text-green-800">
                Advertiser
              </span>
            )}
            {business.membership_type === 'former_club_card' && (
              <span className="text-xs bg-gray-100 px-2 py-1 text-gray-600">
                Former Club Card
              </span>
            )}
            {business.membership_type === 'former_advertiser' && (
              <span className="text-xs bg-gray-100 px-2 py-1 text-gray-600">
                Former Advertiser
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
          {business.notes && (
            <div className="pt-2 border-t border-gray-200 mt-2">
              <span className="font-semibold text-gray-700">Notes:</span>
              <p className="mt-1 text-gray-900 whitespace-pre-wrap">{business.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Summary of Last 12 Months */}
      <CorrespondenceSummary businessId={business.id} refreshTrigger={summaryRefreshTrigger} />

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
                          <p key={index} className="text-sm text-gray-600 flex items-center">
                            <a
                              href={`mailto:${email}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {email}
                            </a>
                            <CopyButton text={email} />
                          </p>
                        ))}
                      </div>
                    )}
                    {contact.phones && contact.phones.length > 0 && (
                      <div>
                        {contact.phones.map((phone, index) => (
                          <p key={index} className="text-sm text-gray-600 flex items-center">
                            <a
                              href={`tel:${phone}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {phone}
                            </a>
                            <CopyButton text={phone} />
                          </p>
                        ))}
                      </div>
                    )}
                    {contact.notes && (
                      <div className="mt-2 text-sm text-gray-500 italic">
                        <span className="font-medium not-italic text-gray-600">Notes: </span>
                        {contact.notes.length > 150
                          ? `${contact.notes.substring(0, 150)}...`
                          : contact.notes}
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
              {/* Date Range */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  Show:
                </label>
                <div className="flex border-2 border-gray-300">
                  <button
                    type="button"
                    onClick={() => setDateRange('1m')}
                    className={`px-3 py-1 text-sm font-medium ${
                      dateRange === '1m'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    1 Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateRange('6m')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      dateRange === '6m'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    6 Months
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateRange('12m')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      dateRange === '12m'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    12 Months
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateRange('custom')}
                    className={`px-3 py-1 text-sm font-medium border-l-2 border-gray-300 ${
                      dateRange === 'custom'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Custom Date Range Inputs */}
              {dateRange === 'custom' && (
                <div className="flex gap-2 items-end">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">
                      From:
                    </label>
                    <input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="px-2 py-1 border-2 border-gray-300 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">
                      To:
                    </label>
                    <input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="px-2 py-1 border-2 border-gray-300 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

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
              {(sortOrder !== 'oldest' || contactFilter !== 'all' || directionFilter !== 'all' || dateRange !== '12m') && (
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('oldest')
                    setContactFilter('all')
                    setDirectionFilter('all')
                    setDateRange('12m')
                    setCustomDateFrom('')
                    setCustomDateTo('')
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
            {/* Recent Section */}
            {filteredCorrespondence.recent.length > 0 && (
              <div className="mb-8">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">
                  {dateRange === 'custom'
                    ? `Selected Range${customDateFrom ? ` (${new Date(customDateFrom).toLocaleDateString('en-GB')}` : ''}${customDateTo ? ` - ${new Date(customDateTo).toLocaleDateString('en-GB')})` : customDateFrom ? ')' : ''}`
                    : dateRange === '1m' ? 'Last Month'
                    : dateRange === '6m' ? 'Last 6 Months'
                    : 'Last 12 Months'}
                </h3>
                <div className="space-y-6">
                  {displayedRecent.map((entry) => renderEntry(entry))}
                </div>
                {remainingRecent > 0 && (
                  <div className="mt-6 text-center">
                    <button
                      type="button"
                      onClick={() => setRecentDisplayCount(prev => prev + 50)}
                      className="px-6 py-3 border-2 border-gray-300 bg-white text-gray-700 hover:border-blue-600 hover:bg-blue-50 font-semibold"
                    >
                      Load 50 More ({remainingRecent} remaining)
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                      Showing {displayedRecent.length} of {filteredCorrespondence.recent.length}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Archive Section */}
            {filteredCorrespondence.archive.length > 0 && (
              <div>
                <button
                  onClick={() => setIsArchiveExpanded(!isArchiveExpanded)}
                  className="w-full flex justify-between items-center font-bold text-gray-900 mb-4 text-lg hover:text-blue-600"
                >
                  <span>Archive ({filteredCorrespondence.archive.length} {dateRange === 'custom' ? 'other' : 'older'} entries)</span>
                  <span>{isArchiveExpanded ? '▼' : '▶'}</span>
                </button>
                {isArchiveExpanded && (
                  <div className="space-y-6 pl-4 border-l-2 border-gray-300">
                    {displayedArchive.map((entry) => renderEntry(entry))}
                    {remainingArchive > 0 && (
                      <div className="mt-6 text-center">
                        <button
                          type="button"
                          onClick={() => setArchiveDisplayCount(prev => prev + 50)}
                          className="px-6 py-3 border-2 border-gray-300 bg-white text-gray-700 hover:border-blue-600 hover:bg-blue-50 font-semibold"
                        >
                          Load 50 More ({remainingArchive} remaining)
                        </button>
                        <p className="text-sm text-gray-500 mt-2">
                          Showing {displayedArchive.length} of {filteredCorrespondence.archive.length}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Contact Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteContactConfirm}
        onOpenChange={setShowDeleteContactConfirm}
        title="Delete Contact"
        description={`Are you sure you want to delete contact "${contactToDelete?.name}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteContact}
      />

      {/* Delete Entry Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteEntryConfirm}
        onOpenChange={setShowDeleteEntryConfirm}
        title="Delete Entry"
        description={`Are you sure you want to delete this entry${entryToDelete?.subject ? ` "${entryToDelete.subject}"` : ''}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteEntry}
      />
    </div>
  )
}
