'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type Correspondence } from '@/app/actions/correspondence'
import { type Contact } from '@/app/actions/contacts'
import { type ConversationThread } from '@/app/actions/threads'
import { formatDateGB, formatDateTimeGB } from '@/lib/utils'
import { CopyButton } from '@/components/CopyButton'
import { CorrespondenceEditForm, type EditFields } from './CorrespondenceEditForm'
import { ThreadAssignPanel } from './ThreadAssignPanel'
import { MoveCorrespondenceModal } from './MoveCorrespondenceModal'
import { DuplicateCorrespondenceModal } from './DuplicateCorrespondenceModal'
import { LinkCorrespondenceModal } from './LinkCorrespondenceModal'
import { unlinkCorrespondenceFromBusiness } from '@/app/actions/correspondence'
import { toast } from '@/lib/toast'

interface CorrespondenceEntryProps {
  entry: Correspondence
  isContext?: boolean
  contacts: Contact[]
  threads: ConversationThread[]
  displayNames: Record<string, string>
  searchQuery: string
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  formattingInProgress: string | null
  onFormat: (id: string) => void
  editingEntryId: string | null
  onStartEdit: (entry: Correspondence) => void
  onSaveEdit: (id: string, fields: EditFields) => Promise<void>
  onCancelEdit: () => void
  onDelete: (id: string, subject: string) => void
  onPin: (id: string, isPinned: boolean) => Promise<void>
  onAction: (id: string, action: string, dueAt?: string) => Promise<void>
  onShowPrevious: (id: string) => void
  onShowNext: (id: string) => void
  showPrevButton: boolean
  showNextButton: boolean
  assigningThreadEntryId: string | null
  setAssigningThreadEntryId: (v: string | null) => void
  creatingThreadFor: string | null
  setCreatingThreadFor: (v: string | null) => void
  newThreadName: string
  setNewThreadName: (v: string) => void
  onAssignThread: (entryId: string, threadId: string | null) => Promise<void>
  onCreateThread: (entryId: string, name: string) => Promise<void>
  setActionError: (v: string) => void
  pageBusinessId?: string
}

// Highlight matching text when searching
function highlightMatch(text: string, searchQuery: string): React.ReactNode {
  if (!searchQuery.trim()) return text
  const query = searchQuery.trim()
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-yellow-200 text-yellow-900">{part}</mark>
      : part
  )
}

// Helper to extract sender/recipient name from AI metadata
function getExtractedName(entry: Correspondence): string | null {
  if (!entry.ai_metadata) return null
  try {
    const metadata = entry.ai_metadata as any
    if (metadata.matched_contact?.matched_from) {
      return metadata.matched_contact.matched_from
    }
    if (metadata.extracted_names?.length > 0) {
      return metadata.extracted_names[0]
    }
  } catch {
    // Silently fail and fall back to contact name
  }
  return null
}

export const CorrespondenceEntry = React.memo(function CorrespondenceEntry({
  entry,
  isContext = false,
  contacts,
  threads,
  displayNames,
  searchQuery,
  isExpanded,
  onToggleExpand,
  formattingInProgress,
  onFormat,
  editingEntryId,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onPin,
  onAction,
  onShowPrevious,
  onShowNext,
  showPrevButton,
  showNextButton,
  assigningThreadEntryId,
  setAssigningThreadEntryId,
  creatingThreadFor,
  setCreatingThreadFor,
  newThreadName,
  setNewThreadName,
  onAssignThread,
  onCreateThread,
  setActionError,
  pageBusinessId,
}: CorrespondenceEntryProps) {
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const moreMenuRef = React.useRef<HTMLDivElement>(null)
  const isLinkedEntry = !!pageBusinessId && entry.business_id !== pageBusinessId
  const isOverdue = entry.due_at && new Date(entry.due_at) < new Date()

  // Close More menu on outside click
  React.useEffect(() => {
    if (!showMoreMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoreMenu])

  async function handleUnlink() {
    if (!pageBusinessId) return
    setUnlinking(true)
    const result = await unlinkCorrespondenceFromBusiness(entry.id, pageBusinessId)
    setUnlinking(false)
    if (result.error) {
      toast.error(`Failed to unlink: ${result.error}`)
    } else {
      toast.success('Entry unlinked from this business')
    }
  }
  const isUnformatted = entry.formatting_status !== 'formatted'
  const isEdited = entry.edited_at !== null
  const isEditing = editingEntryId === entry.id
  const extractedName = getExtractedName(entry)

  return (
    <div id={`entry-${entry.id}`} key={entry.id} className={`border-t border-gray-300 pt-6 first:border-t-0 first:pt-0 ${isContext ? 'border-l-2 border-l-amber-300 bg-amber-50/30 pl-4' : ''}`}>
      {isContext && (
        <p className="text-xs text-amber-700 font-medium mb-2">Surrounding context</p>
      )}
      {/* Unformatted indicator */}
      {isUnformatted && (
        entry.ai_metadata?.bulk_import ? (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-50 border border-gray-200 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Formatting queued…
          </div>
        ) : (
          <div className="bg-orange-50 border-2 border-orange-600 p-3 mb-3">
            <p className="text-sm text-orange-900 font-semibold mb-2">
              ⚠ Unformatted Entry
            </p>
            <p className="text-xs text-orange-800 mb-2">
              This entry was saved without AI formatting. The raw text is displayed below.
            </p>
            <Button
              onClick={() => onFormat(entry.id)}
              disabled={formattingInProgress === entry.id}
              className="bg-orange-600 text-white hover:bg-orange-700 px-3 py-1 text-xs font-semibold"
            >
              {formattingInProgress === entry.id ? 'Formatting...' : 'Format Now'}
            </Button>
          </div>
        )
      )}

      {isLinkedEntry && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-gray-50 border border-gray-200 text-xs text-gray-500 w-fit">
          ↗ Linked entry
        </div>
      )}

      {/* Subject line with edit indicator */}
      <div className="flex items-center gap-2 mb-2">
        {entry.subject && (
          <h3 className="font-semibold text-gray-900">
            {highlightMatch(entry.subject, searchQuery)}
          </h3>
        )}
        {isEdited && (
          <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
            Corrected
          </span>
        )}
      </div>

      {/* Prominent direction and contact display */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {entry.direction === 'received' && (
          <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800 font-semibold border-2 border-blue-300">
            {entry.type === 'Call'
              ? 'CALL FROM'
              : entry.internal_sender
              ? `RECEIVED BY ${entry.internal_sender.toUpperCase()}`
              : 'RECEIVED FROM'}
          </span>
        )}
        {entry.direction === 'sent' && (
          <span className="text-xs bg-green-100 px-2 py-1 text-green-800 font-semibold border-2 border-green-300">
            {entry.type === 'Call'
              ? 'CALLED'
              : entry.internal_sender
              ? `SENT FROM ${entry.internal_sender.toUpperCase()}`
              : 'SENT TO'}
          </span>
        )}
        {entry.type === 'Note' && !entry.direction && (
          <span className="text-xs bg-purple-100 px-2 py-1 text-purple-800 font-semibold border-2 border-purple-300">
            NOTE
          </span>
        )}
        {entry.contact ? (
          <>
            <span className="relative group/contact cursor-default">
              <span className="text-lg font-bold text-gray-900">
                {extractedName || entry.contact.name}
              </span>
              {(() => {
                const fullContact = contacts.find(c => c.id === entry.contact_id)
                if (!fullContact) return null
                const hasDetails = fullContact.emails.length > 0 || fullContact.phones.length > 0 || fullContact.role
                if (!hasDetails) return null
                return (
                  <span className="absolute left-0 top-full mt-1 z-20 hidden group-hover/contact:block w-56 bg-white border-2 border-gray-300 shadow-lg p-3 pointer-events-none">
                    <span className="block font-semibold text-gray-900 text-sm mb-1">{fullContact.name}</span>
                    {fullContact.role && <span className="block text-gray-500 text-xs mb-1">{fullContact.role}</span>}
                    {fullContact.emails[0] && <span className="block text-gray-700 text-xs truncate">{fullContact.emails[0]}</span>}
                    {fullContact.phones[0] && <span className="block text-gray-700 text-xs">{fullContact.phones[0]}</span>}
                  </span>
                )
              })()}
            </span>
            {entry.contact.is_active === false && (
              <span className="text-xs text-gray-500 font-normal">(Former)</span>
            )}
            {entry.contact.role && (
              <span className="text-sm text-gray-600">({entry.contact.role})</span>
            )}
          </>
        ) : entry.type !== 'Note' && (
          <span className="text-sm text-gray-500 italic">No contact assigned</span>
        )}
        {/* Pin indicator */}
        {entry.is_pinned && (
          <span className="text-xs bg-yellow-100 px-2 py-1 text-yellow-800 border border-yellow-300">
            Pinned
          </span>
        )}
      </div>

      {/* Thread participants (for Email Thread type) */}
      {entry.thread_participants && (
        <div className="text-sm text-gray-600 mb-1">
          <span className="font-medium">Thread between: </span>{entry.thread_participants}
        </div>
      )}

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
        {entry.entry_date && <span>{formatDateTimeGB(entry.entry_date)}</span>}
        {entry.type && <span> • {entry.type}</span>}
      </div>

      {/* Body text or edit form */}
      {isEditing ? (
        <CorrespondenceEditForm
          entry={entry}
          contacts={contacts}
          onSave={(fields) => onSaveEdit(entry.id, fields)}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          {(() => {
            const bodyText = entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
            const COLLAPSE_LIMIT = 800
            const isLong = bodyText.length > COLLAPSE_LIMIT
            return (
              <div className="mb-3">
                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                  {highlightMatch(isLong && !isExpanded ? bodyText.slice(0, COLLAPSE_LIMIT) + '…' : bodyText, searchQuery)}
                </div>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => onToggleExpand(entry.id)}
                    className="mt-1 text-xs text-brand-navy hover:underline"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )
          })()}

          {/* Quick action buttons */}
          {entry.action_needed === 'none' && (
            <div className="flex gap-2 flex-wrap mb-3">
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() + 7)
                  onAction(entry.id, 'follow_up', d.toISOString().split('T')[0])
                }}
                className="px-3 py-2 sm:py-1 text-xs border border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                Follow-up
              </button>
              <button
                type="button"
                onClick={() => onAction(entry.id, 'waiting_on_them')}
                className="px-3 py-2 sm:py-1 text-xs border border-blue-300 text-blue-800 hover:bg-blue-50"
              >
                Waiting on them
              </button>
            </div>
          )}
          {entry.action_needed !== 'none' && (
            <div className="flex gap-2 flex-wrap mb-3 items-center">
              <span className="text-xs text-amber-700 font-semibold capitalize">{entry.action_needed.replace(/_/g, ' ')}</span>
              <button
                type="button"
                onClick={() => onAction(entry.id, 'none')}
                className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Mark done
              </button>
            </div>
          )}

          {/* Display who created this entry */}
          <div className="text-xs text-gray-500 mb-2">
            Created by {displayNames[entry.user_id] || 'Unknown'}
            {entry.edited_at && entry.edited_by && (
              <span> • Edited by {displayNames[entry.edited_by] || 'Unknown'}</span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => onStartEdit(entry)}
              className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-3 py-1 text-xs"
            >
              Edit
            </Button>
            <Button
              onClick={() => onPin(entry.id, entry.is_pinned ?? false)}
              className={`px-3 py-1 text-xs ${entry.is_pinned ? 'bg-yellow-200 text-yellow-900 hover:bg-yellow-300' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
            >
              {entry.is_pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              onClick={() => {
                if (assigningThreadEntryId === entry.id) {
                  setAssigningThreadEntryId(null)
                  setCreatingThreadFor(null)
                } else {
                  setAssigningThreadEntryId(entry.id)
                  setCreatingThreadFor(null)
                  setNewThreadName('')
                }
              }}
              className={`px-3 py-1 text-xs ${entry.thread_id ? 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
            >
              {entry.thread_id ? `Thread: ${threads.find(t => t.id === entry.thread_id)?.name || '…'}` : 'Thread'}
            </Button>
            <Button
              onClick={() => onDelete(entry.id, entry.subject || '')}
              className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs"
            >
              Delete
            </Button>
            {/* More ▾ dropdown: Move / Copy to business / Link to business */}
            <div className="relative" ref={moreMenuRef}>
              <Button
                onClick={() => setShowMoreMenu(v => !v)}
                className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-3 py-1 text-xs"
              >
                More ▾
              </Button>
              {showMoreMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 shadow-md z-10 min-w-[160px]" style={{ borderRadius: '2px' }}>
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => { setShowMoveModal(true); setShowMoreMenu(false) }}
                  >
                    Move to business
                  </button>
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => { setShowDuplicateModal(true); setShowMoreMenu(false) }}
                  >
                    Copy to business
                  </button>
                  {!isLinkedEntry && (
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => { setShowLinkModal(true); setShowMoreMenu(false) }}
                    >
                      Link to business
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Unlink button — shown when viewing a linked entry on a secondary business page */}
            {isLinkedEntry && (
              <Button
                onClick={handleUnlink}
                disabled={unlinking}
                className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1 text-xs"
              >
                {unlinking ? 'Unlinking…' : 'Unlink from this page'}
              </Button>
            )}
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
          {/* Thread assignment panel */}
          {assigningThreadEntryId === entry.id && (
            <ThreadAssignPanel
              entryId={entry.id}
              entryThreadId={entry.thread_id}
              threads={threads}
              assigningThreadEntryId={assigningThreadEntryId}
              creatingThreadFor={creatingThreadFor}
              setCreatingThreadFor={setCreatingThreadFor}
              newThreadName={newThreadName}
              setNewThreadName={setNewThreadName}
              onAssign={onAssignThread}
              onCreateThread={onCreateThread}
              onClose={() => setAssigningThreadEntryId(null)}
            />
          )}

          {/* Search context expansion buttons */}
          {(showPrevButton || showNextButton) && (
            <div className="flex gap-2 mt-2">
              {showPrevButton && (
                <button
                  type="button"
                  onClick={() => onShowPrevious(entry.id)}
                  className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 px-2 py-1"
                >
                  Show Previous
                </button>
              )}
              {showNextButton && (
                <button
                  type="button"
                  onClick={() => onShowNext(entry.id)}
                  className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 px-2 py-1"
                >
                  Show Next
                </button>
              )}
            </div>
          )}
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
              Due: {formatDateGB(entry.due_at)}
              {isOverdue && ' (Overdue)'}
            </div>
          )}
        </div>
      )}

      {showMoveModal && (
        <MoveCorrespondenceModal
          correspondenceId={entry.id}
          currentBusinessId={entry.business_id}
          onClose={() => setShowMoveModal(false)}
        />
      )}
      {showDuplicateModal && (
        <DuplicateCorrespondenceModal
          correspondenceId={entry.id}
          currentBusinessId={entry.business_id}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
      {showLinkModal && (
        <LinkCorrespondenceModal
          correspondenceId={entry.id}
          currentBusinessId={entry.business_id}
          linkedBusinessIds={entry.linked_business_ids ?? []}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  )
})
