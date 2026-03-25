'use client'

import React from 'react'
import { type Correspondence } from '@/app/actions/correspondence'
import { type Contact } from '@/app/actions/contacts'
import { type ConversationThread } from '@/app/actions/threads'
import { formatDateGB } from '@/lib/utils'
import { CorrespondenceEntry } from './CorrespondenceEntry'

interface AllEntriesViewProps {
  correspondence: Correspondence[]
  filteredCorrespondence: {
    recent: Correspondence[]
    archive: Correspondence[]
    pinned: Correspondence[]
    matchedIds: Set<string>
  }
  contextEntryIds: Set<string>
  isArchiveExpanded: boolean
  setIsArchiveExpanded: (v: boolean) => void
  isLoadingMore: boolean
  loadMore: () => void
  remainingInDB: number
  totalCount: number
  recentSectionRef: React.RefObject<HTMLDivElement | null>
  dateRange: '1m' | '6m' | '12m' | 'custom'
  customDateFrom: string
  customDateTo: string
  searchQuery: string
  // CorrespondenceEntry passthrough props
  contacts: Contact[]
  threads: ConversationThread[]
  displayNames: Record<string, string>
  isExpandedEntry: (id: string) => boolean
  onToggleExpand: (id: string) => void
  formattingInProgress: string | null
  onFormat: (id: string) => void
  editingEntryId: string | null
  editedText: string
  setEditedText: (v: string) => void
  editedDate: string
  setEditedDate: (v: string) => void
  editedDirection: 'received' | 'sent' | ''
  setEditedDirection: (v: 'received' | 'sent' | '') => void
  editedContactId: string
  setEditedContactId: (v: string) => void
  editedSubject: string
  setEditedSubject: (v: string) => void
  editedInternalSender: string
  setEditedInternalSender: (v: string) => void
  editedActionNeeded: string
  setEditedActionNeeded: (v: string) => void
  editedDueAt: string
  setEditedDueAt: (v: string) => void
  savingEdit: boolean
  onStartEdit: (entry: Correspondence) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string, subject: string) => void
  onPin: (id: string, isPinned: boolean) => Promise<void>
  onAction: (id: string, action: string) => Promise<void>
  onShowPrevious: (id: string) => void
  onShowNext: (id: string) => void
  getPreviousEntryId: (id: string) => string | null
  getNextEntryId: (id: string) => string | null
  assigningThreadEntryId: string | null
  setAssigningThreadEntryId: (v: string | null) => void
  creatingThreadFor: string | null
  setCreatingThreadFor: (v: string | null) => void
  newThreadName: string
  setNewThreadName: (v: string) => void
  onAssignThread: (entryId: string, threadId: string | null) => Promise<void>
  onCreateThread: (entryId: string, name: string) => Promise<void>
  setActionError: (v: string) => void
}

export function AllEntriesView({
  correspondence,
  filteredCorrespondence,
  contextEntryIds,
  isArchiveExpanded,
  setIsArchiveExpanded,
  isLoadingMore,
  loadMore,
  remainingInDB,
  totalCount,
  recentSectionRef,
  dateRange,
  customDateFrom,
  customDateTo,
  searchQuery,
  contacts,
  threads,
  displayNames,
  isExpandedEntry,
  onToggleExpand,
  formattingInProgress,
  onFormat,
  editingEntryId,
  editedText,
  setEditedText,
  editedDate,
  setEditedDate,
  editedDirection,
  setEditedDirection,
  editedContactId,
  setEditedContactId,
  editedSubject,
  setEditedSubject,
  editedInternalSender,
  setEditedInternalSender,
  editedActionNeeded,
  setEditedActionNeeded,
  editedDueAt,
  setEditedDueAt,
  savingEdit,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onPin,
  onAction,
  onShowPrevious,
  onShowNext,
  getPreviousEntryId,
  getNextEntryId,
  assigningThreadEntryId,
  setAssigningThreadEntryId,
  creatingThreadFor,
  setCreatingThreadFor,
  newThreadName,
  setNewThreadName,
  onAssignThread,
  onCreateThread,
  setActionError,
}: AllEntriesViewProps) {
  const allVisibleIds = new Set([
    ...filteredCorrespondence.recent.map(e => e.id),
    ...filteredCorrespondence.archive.map(e => e.id),
  ])
  const isSearchActive = searchQuery.trim() !== ''

  const getEntryProps = (entry: Correspondence) => {
    const prevId = getPreviousEntryId(entry.id)
    const nextId = getNextEntryId(entry.id)
    const showPrevButton = isSearchActive && prevId !== null && !allVisibleIds.has(prevId)
    const showNextButton = isSearchActive && nextId !== null && !allVisibleIds.has(nextId)
    return { showPrevButton, showNextButton }
  }

  const commonEntryProps = {
    contacts,
    threads,
    displayNames,
    searchQuery,
    onToggleExpand,
    formattingInProgress,
    onFormat,
    editingEntryId,
    editedText,
    setEditedText,
    editedDate,
    setEditedDate,
    editedDirection,
    setEditedDirection,
    editedContactId,
    setEditedContactId,
    editedSubject,
    setEditedSubject,
    editedInternalSender,
    setEditedInternalSender,
    editedActionNeeded,
    setEditedActionNeeded,
    editedDueAt,
    setEditedDueAt,
    savingEdit,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete,
    onPin,
    onAction,
    onShowPrevious,
    onShowNext,
    assigningThreadEntryId,
    setAssigningThreadEntryId,
    creatingThreadFor,
    setCreatingThreadFor,
    newThreadName,
    setNewThreadName,
    onAssignThread,
    onCreateThread,
    setActionError,
  }

  return (
    <>
      {/* Bulk import formatting notice */}
      {(() => {
        const pending = correspondence.filter(e =>
          e.formatting_status !== 'formatted' &&
          (e.ai_metadata as any)?.bulk_import === true
        ).length
        if (pending === 0) return null
        return (
          <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-gray-50 border border-gray-200 text-sm text-gray-600">
            <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>Formatting {pending} imported {pending === 1 ? 'email' : 'emails'} in the background…</span>
          </div>
        )
      })()}

      {/* Pinned Section */}
      {filteredCorrespondence.pinned.length > 0 && (
        <div className="mb-8 pb-8 border-b-2 border-yellow-200">
          <h3 className="font-bold text-gray-900 mb-4 text-lg flex items-center gap-2">
            <span className="text-yellow-600">📌</span> Pinned
          </h3>
          <div className="space-y-6">
            {filteredCorrespondence.pinned.map((entry) => {
              const { showPrevButton, showNextButton } = getEntryProps(entry)
              return (
                <CorrespondenceEntry
                  key={entry.id}
                  entry={entry}
                  isContext={false}
                  isExpanded={isExpandedEntry(entry.id)}
                  showPrevButton={showPrevButton}
                  showNextButton={showNextButton}
                  {...commonEntryProps}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Section */}
      {filteredCorrespondence.recent.length > 0 && (
        <div className="mb-8" ref={recentSectionRef}>
          <h3 className="font-bold text-gray-900 mb-4 text-lg">
            {dateRange === 'custom'
              ? `Selected Range${customDateFrom ? ` (${formatDateGB(customDateFrom)}` : ''}${customDateTo ? ` - ${formatDateGB(customDateTo)})` : customDateFrom ? ')' : ''}`
              : dateRange === '1m' ? 'Last Month'
              : dateRange === '6m' ? 'Last 6 Months'
              : 'Last 12 Months'}
          </h3>
          <div className="space-y-6">
            {filteredCorrespondence.recent.map((entry) => {
              const { showPrevButton, showNextButton } = getEntryProps(entry)
              const isContext = isSearchActive && !filteredCorrespondence.matchedIds.has(entry.id)
              return (
                <CorrespondenceEntry
                  key={entry.id}
                  entry={entry}
                  isContext={isContext}
                  isExpanded={isExpandedEntry(entry.id)}
                  showPrevButton={showPrevButton}
                  showNextButton={showNextButton}
                  {...commonEntryProps}
                />
              )
            })}
          </div>
          {remainingInDB > 0 && filteredCorrespondence.archive.length === 0 && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="px-6 py-3 border-2 border-gray-300 bg-white text-gray-700 hover:border-blue-600 hover:bg-blue-50 font-semibold disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading…' : `Load More (${remainingInDB} remaining)`}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Showing {correspondence.length} of {totalCount}
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
            <span>Archive ({filteredCorrespondence.archive.length}{remainingInDB > 0 ? '+' : ''} {dateRange === 'custom' ? 'other' : 'older'} entries)</span>
            <span>{isArchiveExpanded ? '▼' : '▶'}</span>
          </button>
          {isArchiveExpanded && (
            <div className="space-y-6 pl-4 border-l-2 border-gray-300">
              {filteredCorrespondence.archive.map((entry) => {
                const { showPrevButton, showNextButton } = getEntryProps(entry)
                const isContext = isSearchActive && !filteredCorrespondence.matchedIds.has(entry.id)
                return (
                  <CorrespondenceEntry
                    key={entry.id}
                    entry={entry}
                    isContext={isContext}
                    isExpanded={isExpandedEntry(entry.id)}
                    showPrevButton={showPrevButton}
                    showNextButton={showNextButton}
                    {...commonEntryProps}
                  />
                )
              })}
              {remainingInDB > 0 && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="px-6 py-3 border-2 border-gray-300 bg-white text-gray-700 hover:border-blue-600 hover:bg-blue-50 font-semibold disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Loading…' : `Load More (${remainingInDB} remaining)`}
                  </button>
                  <p className="text-sm text-gray-500 mt-2">
                    Showing {correspondence.length} of {totalCount}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
