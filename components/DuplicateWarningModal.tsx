'use client'

import { Button } from '@/components/ui/button'
import { type Correspondence } from '@/app/actions/correspondence'
import { useRouter } from 'next/navigation'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'

interface DuplicateWarningModalProps {
  isOpen: boolean
  onClose: () => void
  existingEntry: Correspondence
  onSaveAnyway: () => void
  isSaving?: boolean
}

export function DuplicateWarningModal({
  isOpen,
  onClose,
  existingEntry,
  onSaveAnyway,
  isSaving = false,
}: DuplicateWarningModalProps) {
  const router = useRouter()
  const modalRef = useModalKeyboard(isOpen, onClose)

  if (!isOpen) return null

  const handleViewExisting = () => {
    // Navigate to business page with the entry highlighted
    router.push(`/businesses/${existingEntry.business_id}#entry-${existingEntry.id}`)
  }

  const entryDate = existingEntry.entry_date
    ? new Date(existingEntry.entry_date).toLocaleDateString('en-GB')
    : new Date(existingEntry.created_at).toLocaleDateString('en-GB')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={modalRef} role="alertdialog" aria-modal="true" aria-labelledby="duplicate-warning-title" className="bg-white border-2 border-gray-800 p-6 max-w-lg w-full mx-4">
        <div className="mb-4">
          <h2 id="duplicate-warning-title" className="text-xl font-bold text-orange-900 mb-2">
            ⚠ Possible Duplicate Entry
          </h2>
          <p className="text-sm text-gray-700">
            This correspondence appears to already exist for this business.
          </p>
        </div>

        {/* Existing Entry Details */}
        <div className="bg-gray-50 border-2 border-gray-300 p-4 mb-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Existing Entry:</h3>

          <div className="space-y-2 text-sm">
            {existingEntry.subject && (
              <div>
                <span className="font-semibold text-gray-700">Subject:</span>
                <span className="ml-2 text-gray-900">{existingEntry.subject}</span>
              </div>
            )}

            <div>
              <span className="font-semibold text-gray-700">Date:</span>
              <span className="ml-2 text-gray-900">{entryDate}</span>
            </div>

            <div>
              <span className="font-semibold text-gray-700">Contact:</span>
              <span className="ml-2 text-gray-900">
                {existingEntry.contact.name}
                {existingEntry.contact.role && ` (${existingEntry.contact.role})`}
              </span>
            </div>

            {existingEntry.type && (
              <div>
                <span className="font-semibold text-gray-700">Type:</span>
                <span className="ml-2 text-gray-900">{existingEntry.type}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <Button
              onClick={handleViewExisting}
              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 px-4 py-3 font-semibold disabled:opacity-50"
              disabled={isSaving}
            >
              View Existing Entry
            </Button>
            <Button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-3 disabled:opacity-50"
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>

          <Button
            onClick={onSaveAnyway}
            className="w-full bg-orange-600 text-white hover:bg-orange-700 px-4 py-3 font-semibold disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Anyway (Different Contact or Update)'}
          </Button>

          <p className="text-xs text-gray-600 text-center">
            You may want to save anyway if this is for a different contact or contains updated information.
          </p>
        </div>
      </div>
    </div>
  )
}
