'use client'

import { type ConversationThread } from '@/app/actions/threads'
import { type Correspondence } from '@/app/actions/correspondence'
import { type Contact } from '@/app/actions/contacts'
import { CorrespondenceEntry } from './CorrespondenceEntry'

interface ThreadsViewProps {
  threads: ConversationThread[]
  correspondence: Correspondence[]
  collapsedThreads: Set<string>
  setCollapsedThreads: (v: Set<string>) => void
  renamingThreadId: string | null
  setRenamingThreadId: (v: string | null) => void
  renameThreadName: string
  setRenameThreadName: (v: string) => void
  onRenameThread: (threadId: string, name: string) => Promise<void>
  onDeleteThread: (threadId: string) => Promise<void>
  searchQuery: string
  // CorrespondenceEntry passthrough props
  contacts: Contact[]
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

export function ThreadsView({
  threads,
  correspondence,
  collapsedThreads,
  setCollapsedThreads,
  renamingThreadId,
  setRenamingThreadId,
  renameThreadName,
  setRenameThreadName,
  onRenameThread,
  onDeleteThread,
  searchQuery,
  contacts,
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
  assigningThreadEntryId,
  setAssigningThreadEntryId,
  creatingThreadFor,
  setCreatingThreadFor,
  newThreadName,
  setNewThreadName,
  onAssignThread,
  onCreateThread,
  setActionError,
}: ThreadsViewProps) {
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
    showPrevButton: false,
    showNextButton: false,
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
    <div>
      {threads.map((thread) => {
        const threadEntries = correspondence
          .filter((e) => e.thread_id === thread.id)
          .sort((a, b) => {
            const da = new Date(a.entry_date || a.created_at).getTime()
            const db = new Date(b.entry_date || b.created_at).getTime()
            return da - db
          })
        const isCollapsed = collapsedThreads.has(thread.id)
        return (
          <div key={thread.id} className="mb-6 border-2 border-indigo-200">
            <div className="flex items-center justify-between bg-indigo-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(collapsedThreads)
                    if (next.has(thread.id)) next.delete(thread.id)
                    else next.add(thread.id)
                    setCollapsedThreads(next)
                  }}
                  className="text-indigo-700 font-bold text-sm"
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
                {renamingThreadId === thread.id ? (
                  <input
                    type="text"
                    value={renameThreadName}
                    onChange={(e) => setRenameThreadName(e.target.value)}
                    className="text-sm font-bold border-2 border-indigo-400 px-2 py-0.5 focus:outline-none"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && renameThreadName.trim()) {
                        await onRenameThread(thread.id, renameThreadName.trim())
                        setRenamingThreadId(null)
                      } else if (e.key === 'Escape') {
                        setRenamingThreadId(null)
                      }
                    }}
                    onBlur={() => setRenamingThreadId(null)}
                  />
                ) : (
                  <span className="font-bold text-gray-900 text-sm">{thread.name}</span>
                )}
                <span className="text-xs text-gray-500">{threadEntries.length} {threadEntries.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setRenamingThreadId(thread.id); setRenameThreadName(thread.name) }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteThread(thread.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete thread
                </button>
              </div>
            </div>
            {!isCollapsed && (
              <div className="p-4 space-y-6">
                {threadEntries.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No entries assigned to this thread yet.</p>
                ) : (
                  threadEntries.map((entry) => (
                    <CorrespondenceEntry
                      key={entry.id}
                      entry={entry}
                      isContext={false}
                      isExpanded={isExpandedEntry(entry.id)}
                      {...commonEntryProps}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
      {/* Unthreaded entries */}
      {(() => {
        const unthreaded = correspondence.filter((e) => !e.thread_id)
        if (unthreaded.length === 0) return null
        return (
          <div className="mb-6">
            <h3 className="font-bold text-gray-700 text-sm mb-3 text-gray-500">Unassigned ({unthreaded.length})</h3>
            <div className="space-y-6">
              {unthreaded.map((entry) => (
                <CorrespondenceEntry
                  key={entry.id}
                  entry={entry}
                  isContext={false}
                  isExpanded={isExpandedEntry(entry.id)}
                  {...commonEntryProps}
                />
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
