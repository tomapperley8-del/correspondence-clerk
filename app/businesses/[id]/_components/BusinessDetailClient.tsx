'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { getBusinessById, type Business } from '@/app/actions/businesses'
import { getContactsByBusiness, deleteContact, type Contact } from '@/app/actions/contacts'
import { updateFormattedText, deleteCorrespondence, deleteMultipleCorrespondence, updateCorrespondenceContact, findDuplicatesInBusiness, togglePinCorrespondence, setCorrespondenceAction, type Correspondence } from '@/app/actions/correspondence'
import { getThreadsByBusiness, createThread, renameThread, deleteThread, assignCorrespondenceToThread, type ConversationThread } from '@/app/actions/threads'
import { dismissDuplicatePair, dismissMultipleDuplicatePairs } from '@/app/actions/duplicate-dismissals'
import { EditBusinessButton } from '@/components/EditBusinessButton'
import { EditBusinessDetailsButton } from '@/components/EditBusinessDetailsButton'
import { ExportDropdown } from '@/components/ExportDropdown'
import { useInsights } from '@/components/InsightsContext'
import { CorrespondenceSummary } from '@/components/CorrespondenceSummary'
import { ActionSuggestions } from '@/components/ActionSuggestions'
import { ContractDetailsCard } from '@/components/ContractDetailsCard'
import { SuccessBanner } from '@/components/SuccessBanner'
import { OpenThreadsCard } from '@/components/OpenThreadsCard'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { retryFormatting } from '@/app/actions/ai-formatter'
import { type MembershipType } from '@/app/actions/membership-types'
import { formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { ContactsList } from './ContactsList'
import { BusinessFiles } from './BusinessFiles'
import { DuplicatesWarningBanner } from './DuplicatesWarningBanner'
import { CorrespondenceFilterBar } from './CorrespondenceFilterBar'
import { AllEntriesView } from './AllEntriesView'
import { ThreadsView } from './ThreadsView'
import { type EditFields } from './CorrespondenceEditForm'
import { useCorrespondence } from './useCorrespondence'

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Updated just now'
  if (diffHours < 24) return `Updated ${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Updated yesterday'
  return `Updated ${diffDays}d ago`
}

interface Props {
  business: Business
  contacts: Contact[]
  initialDuplicates: Array<{
    hash: string
    entries: Array<{
      id: string
      content_hash: string | null
      subject: string | null
      entry_date: string | null
      contact: { name: string } | null
    }>
  }>
  initialThreads: ConversationThread[]
  membershipTypes: MembershipType[]
  initialOpenThreads: import('@/app/actions/correspondence').OpenThread[]
  businessId: string
  saved?: string
  fromActions: boolean
}

export function BusinessDetailClient({
  business: initialBusiness,
  contacts: initialContacts,
  initialDuplicates,
  initialThreads,
  membershipTypes,
  initialOpenThreads,
  businessId,
  saved,
  fromActions,
}: Props) {
  const router = useRouter()
  const { open: openInsights } = useInsights()

  // Data seeded from server, refreshed locally after mutations
  const [business, setBusiness] = useState(initialBusiness)
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [threads, setThreads] = useState<ConversationThread[]>(initialThreads)
  const [duplicates, setDuplicates] = useState(initialDuplicates)

  // Correspondence data, filters, pagination, and derived sections
  const {
    correspondence, setCorrespondence,
    displayNames,
    loading: correspondenceLoading,
    totalCount, remainingInDB, isLoadingMore,
    sortOrder, setSortOrder,
    contactFilter, setContactFilter,
    directionFilter, setDirectionFilter,
    dateRange, setDateRange,
    customDateFrom, setCustomDateFrom,
    customDateTo, setCustomDateTo,
    recentEntries, archiveEntries, pinnedEntries,
    isArchiveExpanded, setIsArchiveExpanded,
    refreshCorrespondence,
    loadMore,
    getPreviousEntryId, getNextEntryId,
    isExpandedEntry, handleToggleExpand,
  } = useCorrespondence({ businessId })

  // UI state
  const [formattingInProgress, setFormattingInProgress] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [contextEntryIds, setContextEntryIds] = useState<Set<string>>(new Set())

  // Error and confirmation state
  const [actionError, setActionError] = useState<string | null>(null)
  const [showDeleteContactConfirm, setShowDeleteContactConfirm] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<{id: string, name: string} | null>(null)
  const [showDeleteEntryConfirm, setShowDeleteEntryConfirm] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<{id: string, subject?: string} | null>(null)
  const [isDeletingContact, setIsDeletingContact] = useState(false)
  const [isDeletingEntry, setIsDeletingEntry] = useState(false)

  // AI summary refresh trigger (for after contract update)
  const [summaryRefreshTrigger, setSummaryRefreshTrigger] = useState(0)

  // Thread UI state
  const [viewMode, setViewMode] = useState<'all' | 'threads'>('all')
  const [assigningThreadEntryId, setAssigningThreadEntryId] = useState<string | null>(null)
  const [newThreadName, setNewThreadName] = useState('')
  const [creatingThreadFor, setCreatingThreadFor] = useState<string | null>(null)
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set())
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null)
  const [renameThreadName, setRenameThreadName] = useState('')

  // Duplicate detection UI state
  const [dismissingDuplicate, setDismissingDuplicate] = useState<string | null>(null)
  const [deletingDuplicate, setDeletingDuplicate] = useState<string | null>(null)
  const [selectedDuplicateHashes, setSelectedDuplicateHashes] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDismissing, setIsBulkDismissing] = useState(false)

  // Jump to today anchor
  const recentSectionRef = useRef<HTMLDivElement>(null)
  const [recentSectionVisible, setRecentSectionVisible] = useState(true)

  // Scroll to hash entry after load (e.g. from duplicate warning)
  useEffect(() => {
    if (correspondenceLoading) return
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.substring(1)
      setTimeout(() => {
        const element = document.getElementById(hash)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-4')
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-4')
          }, 2000)
        }
      }, 100)
    }
  }, [correspondenceLoading])

  // Jump to today: observe recent section visibility
  useEffect(() => {
    const el = recentSectionRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setRecentSectionVisible(entry.isIntersecting),
      { threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [correspondenceLoading])

  // Reset context entries when search query changes
  useEffect(() => {
    setContextEntryIds(new Set())
  }, [searchQuery])

  const handleShowPrevious = useCallback((entryId: string) => {
    const prevId = getPreviousEntryId(entryId)
    if (prevId) setContextEntryIds(prev => new Set([...prev, prevId]))
  }, [getPreviousEntryId])

  const handleShowNext = useCallback((entryId: string) => {
    const nextId = getNextEntryId(entryId)
    if (nextId) setContextEntryIds(prev => new Set([...prev, nextId]))
  }, [getNextEntryId])

  // Filter correspondence based on search query
  const filteredCorrespondence = useMemo(() => {
    if (!searchQuery.trim()) {
      return { recent: recentEntries, archive: archiveEntries, pinned: pinnedEntries, matchedIds: new Set<string>() }
    }

    const query = searchQuery.toLowerCase()
    const matchesQuery = (entry: Correspondence) => {
      const displayedText = entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
      return (
        entry.subject?.toLowerCase().includes(query) ||
        (entry.contact?.name.toLowerCase().includes(query) ?? false) ||
        displayedText.toLowerCase().includes(query)
      )
    }

    const matchedIds = new Set<string>()
    ;[...recentEntries, ...archiveEntries].forEach(entry => {
      if (matchesQuery(entry)) matchedIds.add(entry.id)
    })

    return {
      recent: recentEntries.filter(e => matchesQuery(e) || contextEntryIds.has(e.id)),
      archive: archiveEntries.filter(e => matchesQuery(e) || contextEntryIds.has(e.id)),
      pinned: pinnedEntries.filter(e => matchesQuery(e)),
      matchedIds,
    }
  }, [recentEntries, archiveEntries, pinnedEntries, searchQuery, contextEntryIds])

  // Auto-expand archive when a context entry lands there during search
  useEffect(() => {
    if (searchQuery.trim() && contextEntryIds.size > 0) {
      const hasContextInArchive = filteredCorrespondence.archive.some(e => contextEntryIds.has(e.id))
      if (hasContextInArchive) setIsArchiveExpanded(true)
    }
  }, [searchQuery, contextEntryIds, filteredCorrespondence.archive])

  // --- Handlers ---

  const handleFormatLater = useCallback(async (entryId: string) => {
    setFormattingInProgress(entryId)
    setActionError(null)
    const result = await retryFormatting(entryId)
    if ('error' in result) {
      setActionError(`Formatting failed: ${result.error}`)
    } else {
      await refreshCorrespondence()
    }
    setFormattingInProgress(null)
  }, [refreshCorrespondence])

  const handleStartEdit = useCallback((entry: Correspondence) => {
    setEditingEntryId(entry.id)
    setActionError(null)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingEntryId(null)
    setActionError(null)
  }, [])

  const handleSaveEdit = useCallback(async (entryId: string, fields: EditFields) => {
    if (!fields.text.trim()) {
      setActionError('Entry text cannot be empty')
      return
    }
    setActionError(null)

    try {
      const originalEntry = correspondence.find(e => e.id === entryId)
      const directionChanged = originalEntry && originalEntry.direction !== (fields.direction || null)
      const contactChanged = originalEntry && originalEntry.contact_id !== fields.contactId

      let dateToSave: string | null = null
      if (fields.date) {
        if (originalEntry?.entry_date) {
          const orig = new Date(originalEntry.entry_date)
          const [year, month, day] = fields.date.split('-').map(Number)
          orig.setFullYear(year, month - 1, day)
          dateToSave = orig.toISOString()
        } else {
          dateToSave = new Date(fields.date).toISOString()
        }
      }

      const directionValue = fields.direction === '' ? null : fields.direction as 'received' | 'sent' | null
      const textResult = await updateFormattedText(
        entryId, fields.text, dateToSave, fields.subject || null,
        fields.internalSender || null, fields.actionNeeded || 'none',
        fields.dueAt || null, directionValue
      )

      if ('error' in textResult) {
        setActionError(`Error saving: ${textResult.error}`)
        return
      }

      if (directionChanged) setSummaryRefreshTrigger(prev => prev + 1)

      if (contactChanged && fields.contactId) {
        const contactResult = await updateCorrespondenceContact(entryId, fields.contactId)
        if ('error' in contactResult) {
          setActionError(`Error updating contact: ${contactResult.error}`)
          return
        }
      }

      await refreshCorrespondence()
      setEditingEntryId(null)
    } catch (err) {
      setActionError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [correspondence, refreshCorrespondence])

  const handleDeleteContact = useCallback((contactId: string, contactName: string) => {
    setContactToDelete({ id: contactId, name: contactName })
    setShowDeleteContactConfirm(true)
  }, [])

  const confirmDeleteContact = useCallback(async () => {
    if (!contactToDelete) return
    setIsDeletingContact(true)
    setActionError(null)
    const result = await deleteContact(contactToDelete.id)
    if ('error' in result) {
      setActionError(`Error deleting contact: ${result.error}`)
    } else {
      const contactsResult = await getContactsByBusiness(businessId)
      setContacts('error' in contactsResult ? [] : contactsResult.data || [])
    }
    setIsDeletingContact(false)
    setShowDeleteContactConfirm(false)
    setContactToDelete(null)
  }, [contactToDelete, businessId])

  const handleDeleteEntry = useCallback(async (entryId: string, subject: string) => {
    setEntryToDelete({ id: entryId, subject: subject || undefined })
    setShowDeleteEntryConfirm(true)
  }, [])

  const confirmDeleteEntry = useCallback(async () => {
    if (!entryToDelete) return
    setIsDeletingEntry(true)
    setActionError(null)
    const result = await deleteCorrespondence(entryToDelete.id)
    if ('error' in result) {
      setActionError(`Error deleting entry: ${result.error}`)
    } else {
      await refreshCorrespondence()
      const duplicatesResult = await findDuplicatesInBusiness(businessId)
      setDuplicates(duplicatesResult.duplicates || [])
    }
    setIsDeletingEntry(false)
    setShowDeleteEntryConfirm(false)
    setEntryToDelete(null)
  }, [entryToDelete, businessId, refreshCorrespondence])

  const handleDeleteDuplicate = useCallback(async (entryId: string, hash: string) => {
    setDeletingDuplicate(hash)
    setActionError(null)
    const result = await deleteCorrespondence(entryId)
    if ('error' in result) {
      setActionError(`Error deleting entry: ${result.error}`)
    } else {
      await refreshCorrespondence()
      const duplicatesResult = await findDuplicatesInBusiness(businessId)
      setDuplicates(duplicatesResult.duplicates || [])
    }
    setDeletingDuplicate(null)
  }, [businessId, refreshCorrespondence])

  const handleDismissDuplicate = useCallback(async (id1: string, id2: string, hash: string) => {
    setDismissingDuplicate(hash)
    setActionError(null)
    const result = await dismissDuplicatePair(businessId, id1, id2)
    if ('error' in result) {
      setActionError(`Error dismissing duplicate: ${result.error}`)
    } else {
      const duplicatesResult = await findDuplicatesInBusiness(businessId)
      setDuplicates(duplicatesResult.duplicates || [])
    }
    setDismissingDuplicate(null)
  }, [businessId])

  const isBulkOperationRunning = isBulkDeleting || isBulkDismissing
  const selectedCount = selectedDuplicateHashes.size

  const toggleDuplicateHash = useCallback((hash: string) => {
    setSelectedDuplicateHashes(prev => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }, [])

  const toggleSelectAllDuplicates = useCallback(() => {
    if (selectedDuplicateHashes.size === duplicates.length) {
      setSelectedDuplicateHashes(new Set())
    } else {
      setSelectedDuplicateHashes(new Set(duplicates.map(d => d.hash)))
    }
  }, [selectedDuplicateHashes, duplicates])

  const handleBulkDeleteDuplicates = useCallback(async () => {
    if (selectedCount === 0) return
    setIsBulkDeleting(true)
    setActionError(null)
    const idsToDelete = duplicates
      .filter(d => selectedDuplicateHashes.has(d.hash))
      .map(d => d.entries[d.entries.length - 1].id)
    const result = await deleteMultipleCorrespondence(idsToDelete)
    if ('error' in result) {
      setActionError(`Error deleting entries: ${result.error}`)
    } else {
      await refreshCorrespondence()
      const dupResult = await findDuplicatesInBusiness(businessId)
      setDuplicates(dupResult.duplicates || [])
      setSelectedDuplicateHashes(new Set())
    }
    setIsBulkDeleting(false)
  }, [selectedCount, duplicates, selectedDuplicateHashes, businessId, refreshCorrespondence])

  const handleBulkDismissDuplicates = useCallback(async () => {
    if (selectedCount === 0) return
    setIsBulkDismissing(true)
    setActionError(null)
    const pairs = duplicates
      .filter(d => selectedDuplicateHashes.has(d.hash) && d.entries.length === 2)
      .map(d => ({ entryId1: d.entries[0].id, entryId2: d.entries[1].id }))
    if (pairs.length === 0) {
      setActionError('No valid pairs to dismiss (only groups with exactly 2 entries can be dismissed)')
      setIsBulkDismissing(false)
      return
    }
    const result = await dismissMultipleDuplicatePairs(businessId, pairs)
    if ('error' in result) {
      setActionError(`Error dismissing duplicates: ${result.error}`)
    } else {
      const duplicatesResult = await findDuplicatesInBusiness(businessId)
      setDuplicates(duplicatesResult.duplicates || [])
      setSelectedDuplicateHashes(new Set())
    }
    setIsBulkDismissing(false)
  }, [selectedCount, duplicates, selectedDuplicateHashes, businessId])

  const dismissableSelectedCount = duplicates
    .filter(d => selectedDuplicateHashes.has(d.hash) && d.entries.length === 2)
    .length

  const handleContractUpdate = useCallback(async () => {
    const businessResult = await getBusinessById(businessId)
    if (!('error' in businessResult) && businessResult.data) {
      setBusiness(businessResult.data)
      setSummaryRefreshTrigger(prev => prev + 1)
    } else {
      router.refresh()
    }
  }, [businessId, router])

  const handlePin = useCallback(async (entryId: string, _isPinned: boolean) => {
    await togglePinCorrespondence(entryId)
    await refreshCorrespondence()
  }, [refreshCorrespondence])

  const handleAction = useCallback(async (entryId: string, action: string, dueAt?: string) => {
    const entry = correspondence.find(c => c.id === entryId)
    const prevAction = entry?.action_needed ?? 'none'
    setCorrespondence(prev => prev.map(c => c.id === entryId ? { ...c, action_needed: action as Correspondence['action_needed'] } : c))
    const result = await setCorrespondenceAction(entryId, action, dueAt)
    if (result && 'error' in result) {
      setCorrespondence(prev => prev.map(c => c.id === entryId ? { ...c, action_needed: prevAction } : c))
      toast.error(action === 'none' ? 'Failed to mark done' : 'Failed to set action')
    } else {
      if (action === 'none') toast.success('Marked done')
      else if (action === 'follow_up') toast.success('Follow-up set')
      else toast.success('Waiting on them set')
    }
  }, [correspondence])

  const handleAssignThread = useCallback(async (entryId: string, threadId: string | null) => {
    await assignCorrespondenceToThread(entryId, threadId, businessId)
    await refreshCorrespondence()
  }, [businessId, refreshCorrespondence])

  const handleCreateThread = useCallback(async (entryId: string, name: string) => {
    const result = await createThread(businessId, name)
    if ('data' in result && result.data) {
      await assignCorrespondenceToThread(entryId, result.data.id, businessId)
      const [threadsRes] = await Promise.all([getThreadsByBusiness(businessId), refreshCorrespondence()])
      setThreads('error' in threadsRes ? [] : threadsRes.data || [])
    }
  }, [businessId, refreshCorrespondence])

  const handleRenameThread = useCallback(async (threadId: string, name: string) => {
    await renameThread(threadId, businessId, name)
    const result = await getThreadsByBusiness(businessId)
    setThreads('error' in result ? [] : result.data || [])
  }, [businessId])

  const handleDeleteThread = useCallback(async (threadId: string) => {
    await deleteThread(threadId, businessId)
    const [threadsRes] = await Promise.all([getThreadsByBusiness(businessId), refreshCorrespondence()])
    setThreads('error' in threadsRes ? [] : threadsRes.data || [])
  }, [businessId, refreshCorrespondence])

  // Common props passed to both AllEntriesView and ThreadsView
  const entryPassthroughProps = {
    contacts,
    displayNames,
    searchQuery,
    isExpandedEntry,
    onToggleExpand: handleToggleExpand,
    formattingInProgress,
    onFormat: handleFormatLater,
    editingEntryId,
    onStartEdit: handleStartEdit,
    onSaveEdit: handleSaveEdit,
    onCancelEdit: handleCancelEdit,
    onDelete: handleDeleteEntry,
    onPin: handlePin,
    onAction: handleAction,
    onShowPrevious: handleShowPrevious,
    onShowNext: handleShowNext,
    assigningThreadEntryId,
    setAssigningThreadEntryId,
    creatingThreadFor,
    setCreatingThreadFor,
    newThreadName,
    setNewThreadName,
    onAssignThread: handleAssignThread,
    onCreateThread: handleCreateThread,
    setActionError,
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumbs — "Back to Actions" when navigated from Actions page */}
      <Breadcrumbs items={[
        fromActions
          ? { label: 'Actions', href: '/actions' }
          : { label: 'Dashboard', href: '/dashboard' },
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
        <DuplicatesWarningBanner
          duplicates={duplicates}
          selectedDuplicateHashes={selectedDuplicateHashes}
          isBulkOperationRunning={isBulkOperationRunning}
          isBulkDeleting={isBulkDeleting}
          isBulkDismissing={isBulkDismissing}
          selectedCount={selectedCount}
          dismissableSelectedCount={dismissableSelectedCount}
          dismissingDuplicate={dismissingDuplicate}
          deletingDuplicate={deletingDuplicate}
          onToggleHash={toggleDuplicateHash}
          onToggleSelectAll={toggleSelectAllDuplicates}
          onBulkDelete={handleBulkDeleteDuplicates}
          onBulkDismiss={handleBulkDismissDuplicates}
          onDeleteDuplicate={handleDeleteDuplicate}
          onDismissDuplicate={handleDismissDuplicate}
          businessId={businessId}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">{business.name}</h1>

            {business.is_club_card && (business.contract_start || business.contract_end) && (
              <div className="text-sm text-gray-700 mt-1">
                <span className="font-semibold">Contract:</span>{' '}
                {business.contract_start && <span>{formatDateGB(business.contract_start)}</span>}
                {business.contract_start && business.contract_end && <span> - </span>}
                {business.contract_end && <span>{formatDateGB(business.contract_end)}</span>}
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
              <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">{business.category}</span>
            )}
            {business.status && (
              <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">{business.status}</span>
            )}
            {business.membership_type && (() => {
              const mt = membershipTypes.find(t => t.value === business.membership_type)
              if (!mt) return <span className="text-xs bg-gray-100 px-2 py-1 text-gray-600">{business.membership_type}</span>
              const legacyColours: Record<string, string> = {
                club_card: 'bg-blue-100 text-blue-800',
                advertiser: 'bg-green-100 text-green-800',
                former_club_card: 'bg-gray-100 text-gray-600',
                former_advertiser: 'bg-gray-100 text-gray-600',
              }
              const colour = legacyColours[mt.value] || 'bg-gray-100 text-gray-700'
              return <span className={`text-xs px-2 py-1 ${colour}`}>{mt.label}</span>
            })()}
          </div>
        )}
      </div>

      {/* Business Details Box */}
      <div className="bg-gray-50 border border-black/[0.06] p-4 mb-6">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-sm font-bold text-brand-dark uppercase">Business Details</h3>
          <EditBusinessDetailsButton
            business={business}
            onUpdate={async () => {
              const result = await getBusinessById(businessId)
              if (!('error' in result) && result.data) setBusiness(result.data)
            }}
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
            <div className="pt-2 border-t border-black/[0.06] mt-2">
              <span className="font-semibold text-gray-700">Notes:</span>
              <p className="mt-1 text-gray-900 whitespace-pre-wrap">{business.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Relationship Memory — AI-distilled summary, updated after each Insight generation */}
      {business.relationship_memory && (
        <div className="bg-brand-warm border border-black/[0.06] p-4 mb-6">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Relationship Memory</h3>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {business.relationship_memory_updated_at && (
                <span>{formatRelativeTime(business.relationship_memory_updated_at)}</span>
              )}
              <button
                onClick={() => openInsights(business.id, business.name)}
                className="text-brand-navy hover:underline"
              >
                Refresh via Insights
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{business.relationship_memory}</p>
        </div>
      )}

      {/* AI Summary — lazy, generates on demand */}
      <CorrespondenceSummary businessId={business.id} refreshTrigger={summaryRefreshTrigger} />

      {/* AI Action Suggestions — lazy, generates on demand */}
      <ActionSuggestions businessId={business.id} />

      {/* Contract Details */}
      <div className="mb-6">
        <ContractDetailsCard business={business} onUpdate={handleContractUpdate} membershipTypes={membershipTypes} />
      </div>

      {/* Correspondence Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search correspondence..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search correspondence"
          className="w-full px-4 py-2 border-2 border-gray-300 focus:border-brand-navy focus:outline-none"
        />
        {searchQuery && (
          <p className="text-sm text-gray-600 mt-2">
            Showing {filteredCorrespondence.matchedIds.size} matching entries
            <button
              onClick={() => setSearchQuery('')}
              className="ml-2 text-brand-navy hover:underline"
            >
              Clear search
            </button>
          </p>
        )}
      </div>

      {/* Contacts Section */}
      <ContactsList
        contacts={contacts}
        business={business}
        onDeleteContact={handleDeleteContact}
      />

      {/* Files Section */}
      <BusinessFiles businessId={business.id} />

      {/* Letter File / Correspondence */}
      <div className="bg-white border-2 border-gray-300 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Correspondence</h2>
          <div className="flex gap-3">
            <button
              onClick={() => openInsights(business.id, business.name)}
              className="relative px-3 py-2 text-sm font-semibold border rounded-sm text-brand-navy border-brand-navy hover:bg-brand-navy hover:text-white transition-colors"
              title={business.relationship_memory ? `Memory: ${formatRelativeTime(business.relationship_memory_updated_at ?? '')}` : undefined}
            >
              Insights
              {business.relationship_memory && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand-olive rounded-full border-2 border-white" aria-label="Relationship memory available" />
              )}
            </button>
            <ExportDropdown businessId={business.id} />
            <Link href={`/new-entry?businessId=${business.id}`}>
              <Button className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-3 font-semibold">
                New Entry
              </Button>
            </Link>
          </div>
        </div>

        {correspondenceLoading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="border-t border-gray-200 pt-4">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                <div className="h-3 bg-gray-100 rounded w-5/6" />
              </div>
            ))}
          </div>
        ) : correspondence.length > 0 ? (
          <>
            <OpenThreadsCard threads={initialOpenThreads} />
            <CorrespondenceFilterBar
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              contactFilter={contactFilter}
              setContactFilter={setContactFilter}
              directionFilter={directionFilter}
              setDirectionFilter={setDirectionFilter}
              dateRange={dateRange}
              setDateRange={setDateRange}
              customDateFrom={customDateFrom}
              setCustomDateFrom={setCustomDateFrom}
              customDateTo={customDateTo}
              setCustomDateTo={setCustomDateTo}
              contacts={contacts}
              totalFilteredCount={filteredCorrespondence.recent.length + filteredCorrespondence.archive.length}
              totalLoadedCount={correspondence.length}
              viewMode={viewMode}
              setViewMode={setViewMode}
              threadsCount={threads.length}
              exportProps={{ businessId: business.id }}
            />

            {viewMode === 'threads' ? (
              <ThreadsView
                threads={threads}
                correspondence={correspondence}
                collapsedThreads={collapsedThreads}
                setCollapsedThreads={setCollapsedThreads}
                renamingThreadId={renamingThreadId}
                setRenamingThreadId={setRenamingThreadId}
                renameThreadName={renameThreadName}
                setRenameThreadName={setRenameThreadName}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                {...entryPassthroughProps}
              />
            ) : (
              <AllEntriesView
                correspondence={correspondence}
                filteredCorrespondence={filteredCorrespondence}
                contextEntryIds={contextEntryIds}
                isArchiveExpanded={isArchiveExpanded}
                setIsArchiveExpanded={setIsArchiveExpanded}
                isLoadingMore={isLoadingMore}
                loadMore={loadMore}
                remainingInDB={remainingInDB}
                totalCount={totalCount}
                recentSectionRef={recentSectionRef}
                dateRange={dateRange}
                customDateFrom={customDateFrom}
                customDateTo={customDateTo}
                getPreviousEntryId={getPreviousEntryId}
                getNextEntryId={getNextEntryId}
                threads={threads}
                {...entryPassthroughProps}
              />
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-gray-500 mb-4">No correspondence yet.</p>
            <Link
              href={`/new-entry?businessId=${business.id}`}
              className="inline-block px-4 py-2 bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-hover transition-colors"
            >
              Add First Entry
            </Link>
          </div>
        )}
      </div>

      {/* Jump to today floating button */}
      {!recentSectionVisible && filteredCorrespondence.recent.length > 0 && (
        <button
          onClick={() => recentSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed bottom-6 left-6 z-40 px-3 py-2 bg-brand-dark text-white text-xs font-medium shadow-lg hover:bg-brand-navy transition-colors"
          title="Jump to recent entries"
        >
          ↑ Today
        </button>
      )}

      {/* Delete Contact Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteContactConfirm}
        onOpenChange={setShowDeleteContactConfirm}
        title="Delete Contact"
        description={`Are you sure you want to delete contact "${contactToDelete?.name}"?`}
        confirmLabel="Delete"
        loadingLabel="Deleting..."
        destructive
        isLoading={isDeletingContact}
        onConfirm={confirmDeleteContact}
      />

      {/* Delete Entry Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteEntryConfirm}
        onOpenChange={setShowDeleteEntryConfirm}
        title="Delete Entry"
        description={`Are you sure you want to delete this entry${entryToDelete?.subject ? ` "${entryToDelete.subject}"` : ''}? This cannot be undone.`}
        confirmLabel="Delete"
        loadingLabel="Deleting..."
        destructive
        isLoading={isDeletingEntry}
        onConfirm={confirmDeleteEntry}
      />
    </div>
  )
}
