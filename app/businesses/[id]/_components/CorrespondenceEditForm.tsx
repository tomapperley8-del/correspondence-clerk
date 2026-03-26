'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type Contact } from '@/app/actions/contacts'
import { type Correspondence } from '@/app/actions/correspondence'

export interface EditFields {
  text: string
  date: string
  direction: 'received' | 'sent' | ''
  contactId: string
  subject: string
  internalSender: string
  actionNeeded: string
  dueAt: string
}

interface CorrespondenceEditFormProps {
  entry: Correspondence
  contacts: Contact[]
  onSave: (fields: EditFields) => Promise<void>
  onCancel: () => void
}

export function CorrespondenceEditForm({
  entry,
  contacts,
  onSave,
  onCancel,
}: CorrespondenceEditFormProps) {
  const [editedText, setEditedText] = useState(
    entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
  )
  const [editedDate, setEditedDate] = useState(() => {
    if (entry.entry_date) return new Date(entry.entry_date).toISOString().split('T')[0]
    return ''
  })
  const [editedDirection, setEditedDirection] = useState<'received' | 'sent' | ''>(entry.direction || '')
  const [editedContactId, setEditedContactId] = useState(entry.contact_id || '')
  const [editedSubject, setEditedSubject] = useState(entry.subject || '')
  const [editedInternalSender, setEditedInternalSender] = useState(entry.internal_sender || '')
  const [editedActionNeeded, setEditedActionNeeded] = useState<string>(entry.action_needed || 'none')
  const [editedDueAt, setEditedDueAt] = useState(() => {
    if (entry.due_at) return new Date(entry.due_at).toISOString().split('T')[0]
    return ''
  })
  const [savingEdit, setSavingEdit] = useState(false)

  async function handleSave() {
    if (!editedText.trim()) return
    setSavingEdit(true)
    try {
      await onSave({
        text: editedText,
        date: editedDate,
        direction: editedDirection,
        contactId: editedContactId,
        subject: editedSubject,
        internalSender: editedInternalSender,
        actionNeeded: editedActionNeeded,
        dueAt: editedDueAt,
      })
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="bg-yellow-50 border-2 border-yellow-600 p-4 mb-4">
      <p className="text-sm font-semibold text-yellow-900 mb-3">
        Editing entry (manual correction)
      </p>

      {/* Subject */}
      <div className="mb-3">
        <label className="block text-sm font-semibold text-gray-900 mb-1">
          Subject:
        </label>
        <input
          type="text"
          value={editedSubject}
          onChange={(e) => setEditedSubject(e.target.value)}
          placeholder="Enter subject..."
          className="w-full px-3 py-2 border-2 border-gray-300 text-sm focus:border-blue-600 focus:outline-none"
        />
      </div>

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

      {/* Internal Sender */}
      <div className="mb-3">
        <label className="block text-sm font-semibold text-gray-900 mb-1">
          {editedDirection === 'sent' ? 'Sent from:' : editedDirection === 'received' ? 'Received by:' : 'Internal sender:'}
        </label>
        <select
          value={editedInternalSender}
          onChange={(e) => setEditedInternalSender(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
        >
          <option value="">-- Not specified --</option>
          <option value="Bridget">Bridget</option>
          <option value="Tom">Tom</option>
          <option value="James">James</option>
          <option value="Dawn">Dawn</option>
          <option value="info@">info@ (shared)</option>
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

      {/* Action Needed */}
      <div className="mb-3">
        <label className="block text-sm font-semibold text-gray-900 mb-1">
          Action needed:
        </label>
        <select
          value={editedActionNeeded}
          onChange={(e) => setEditedActionNeeded(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border-2 border-gray-300 bg-white text-sm focus:border-blue-600 focus:outline-none"
        >
          <option value="none">None</option>
          <option value="follow_up">Follow-up</option>
          <option value="waiting_on_them">Waiting on them</option>
          <option value="invoice">Invoice</option>
          <option value="renewal">Renewal</option>
          <option value="prospect">Prospect</option>
        </select>
      </div>

      {/* Due Date (only shown when action is set) */}
      {editedActionNeeded !== 'none' && (
        <div className="mb-3">
          <label className="block text-sm font-semibold text-gray-900 mb-1">
            Due date (optional):
          </label>
          <input
            type="date"
            value={editedDueAt}
            onChange={(e) => setEditedDueAt(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border-2 border-gray-300 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
      )}

      {/* Text Textarea */}
      <textarea
        value={editedText}
        onChange={(e) => setEditedText(e.target.value)}
        className="w-full min-h-[200px] px-3 py-2 border-2 border-gray-300 text-sm font-mono focus:border-blue-600 focus:outline-none"
      />

      <div className="flex gap-2 mt-3">
        <Button
          onClick={handleSave}
          disabled={savingEdit}
          className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 text-sm font-semibold"
        >
          {savingEdit ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button
          onClick={onCancel}
          disabled={savingEdit}
          className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 text-sm"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
