'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getBusinessById, type Business } from '@/app/actions/businesses'
import { getContactsByBusiness, type Contact } from '@/app/actions/contacts'
import { getCorrespondenceByBusiness, updateFormattedText, type Correspondence } from '@/app/actions/correspondence'
import { AddContactButton } from '@/components/AddContactButton'
import { EditBusinessButton } from '@/components/EditBusinessButton'
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
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formattingInProgress, setFormattingInProgress] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState<string>('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    async function loadParams() {
      const p = await params
      const sp = await searchParams
      setId(p.id)
      setSaved(sp.saved || null)
    }
    loadParams()
  }, [params, searchParams])

  useEffect(() => {
    if (!id) return

    async function loadData() {
      const businessResult = await getBusinessById(id)
      if ('error' in businessResult || !businessResult.data) {
        router.push('/dashboard')
        return
      }

      const contactsResult = await getContactsByBusiness(id)
      const correspondenceResult = await getCorrespondenceByBusiness(id)

      setBusiness(businessResult.data)
      setContacts('error' in contactsResult ? [] : contactsResult.data || [])
      setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      setLoading(false)
    }

    loadData()
  }, [id, router])

  if (loading || !business) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  // Split correspondence into recent (last 12 months) and archive (older)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const recentEntries = correspondence
    .filter((e) => new Date(e.entry_date || e.created_at) >= twelveMonthsAgo)
    .sort((a, b) => {
      // Sort oldest first (chronological)
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return dateA - dateB
    })

  const archiveEntries = correspondence
    .filter((e) => new Date(e.entry_date || e.created_at) < twelveMonthsAgo)
    .sort((a, b) => {
      // Sort newest first within archive
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return dateB - dateA
    })

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
  }

  const handleCancelEdit = () => {
    setEditingEntryId(null)
    setEditedText('')
  }

  const handleSaveEdit = async (entryId: string) => {
    if (!editedText.trim()) {
      alert('Entry text cannot be empty')
      return
    }

    setSavingEdit(true)

    const result = await updateFormattedText(entryId, editedText)

    if ('error' in result) {
      alert(`Error saving: ${result.error}`)
    } else {
      // Reload correspondence to show updated entry
      if (id) {
        const correspondenceResult = await getCorrespondenceByBusiness(id)
        setCorrespondence('error' in correspondenceResult ? [] : correspondenceResult.data || [])
      }
      setEditingEntryId(null)
      setEditedText('')
    }

    setSavingEdit(false)
  }

  const renderEntry = (entry: Correspondence) => {
    const isOverdue = entry.due_at && new Date(entry.due_at) < new Date()
    const directionIcon = entry.direction === 'sent' ? '→' : entry.direction === 'received' ? '←' : null
    const isUnformatted = entry.formatting_status !== 'formatted'
    const isEdited = entry.edited_at !== null
    const isEditing = editingEntryId === entry.id

    return (
      <div key={entry.id} className="border-t border-gray-300 pt-6 first:border-t-0 first:pt-0">
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

        {/* Meta line with direction */}
        <div className="text-sm text-gray-600 mb-3 italic">
          {directionIcon && (
            <span className="font-bold mr-1">
              {directionIcon} {entry.direction === 'sent' ? 'Sent' : 'Received'}
            </span>
          )}
          {entry.entry_date && (
            <span>
              | {new Date(entry.entry_date).toLocaleDateString('en-GB')} {' '}
            </span>
          )}
          {entry.type && <span>| {entry.type} </span>}
          <span>
            | {entry.contact.name}
            {entry.contact.role && `, ${entry.contact.role}`}
          </span>
        </div>

        {/* Body text or edit textarea */}
        {isEditing ? (
          <div className="mb-3">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full min-h-[200px] px-3 py-2 border-2 border-blue-600 focus:outline-none focus:border-blue-700 font-mono text-sm"
            />
            <div className="flex gap-2 mt-2">
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
            <Button
              onClick={() => handleStartEdit(entry)}
              className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-3 py-1 text-xs"
            >
              Edit
            </Button>
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
          <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
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
                    {contact.email && (
                      <p className="text-sm text-gray-600 mt-1">
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {contact.email}
                        </a>
                      </p>
                    )}
                    {contact.phone && (
                      <p className="text-sm text-gray-600">
                        <a
                          href={`tel:${contact.phone}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {contact.phone}
                        </a>
                      </p>
                    )}
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
          <Link href={`/new-entry?businessId=${business.id}`}>
            <Button className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold">
              New Entry
            </Button>
          </Link>
        </div>

        {correspondence && correspondence.length === 0 ? (
          <p className="text-gray-600 text-sm">
            No correspondence yet. Add your first entry to start building the
            letter file.
          </p>
        ) : (
          <>
            {/* Recent Section (Last 12 Months) */}
            {recentEntries.length > 0 && (
              <div className="mb-8">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">
                  Recent (Last 12 Months)
                </h3>
                <div className="space-y-6">
                  {recentEntries.map((entry) => renderEntry(entry))}
                </div>
              </div>
            )}

            {/* Archive Section (Older than 12 Months) */}
            {archiveEntries.length > 0 && (
              <div>
                <button
                  onClick={() => setIsArchiveExpanded(!isArchiveExpanded)}
                  className="w-full flex justify-between items-center font-bold text-gray-900 mb-4 text-lg hover:text-blue-600"
                >
                  <span>Archive ({archiveEntries.length} older entries)</span>
                  <span>{isArchiveExpanded ? '▼' : '▶'}</span>
                </button>
                {isArchiveExpanded && (
                  <div className="space-y-6 pl-4 border-l-2 border-gray-300">
                    {archiveEntries.map((entry) => renderEntry(entry))}
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
