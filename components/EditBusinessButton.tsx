'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateBusiness, deleteBusiness, type Business } from '@/app/actions/businesses'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'

export function EditBusinessButton({ business }: { business: Business }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [formData, setFormData] = useState({
    name: business.name,
    category: business.category || '',
    status: business.status || '',
    is_club_card: business.is_club_card,
    is_advertiser: business.is_advertiser,
    notes: business.notes || '',
  })

  const handleCancel = () => {
    setFormData({
      name: business.name,
      category: business.category || '',
      status: business.status || '',
      is_club_card: business.is_club_card,
      is_advertiser: business.is_advertiser,
      notes: business.notes || '',
    })
    setError(null)
    setIsOpen(false)
  }

  const modalRef = useModalKeyboard(isOpen, handleCancel)
  const finalDeleteRef = useModalKeyboard(showFinalDeleteConfirm, () => {
    setShowFinalDeleteConfirm(false)
    setDeleteConfirmText('')
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const result = await updateBusiness(business.id, {
      name: formData.name,
      category: formData.category || undefined,
      status: formData.status || undefined,
      is_club_card: formData.is_club_card,
      is_advertiser: formData.is_advertiser,
      notes: formData.notes || undefined,
    })

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setSaving(false)
    } else {
      setSaving(false)
      setIsOpen(false)
      window.location.reload()
    }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleDeleteFirstConfirm = () => {
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
    setShowFinalDeleteConfirm(true)
  }

  const handleDeleteFinal = async () => {
    if (deleteConfirmText !== 'DELETE') {
      return
    }

    setShowFinalDeleteConfirm(false)
    setSaving(true)
    setError(null)

    const result = await deleteBusiness(business.id)

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setSaving(false)
    } else {
      router.push('/dashboard')
    }
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-4 py-2 text-sm font-semibold"
      >
        Edit Business
      </Button>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="edit-business-title" className="bg-white border-2 border-gray-800 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h2 id="edit-business-title" className="text-xl font-bold text-gray-900 mb-4">Edit Business</h2>

          {error && (
            <div className="bg-red-50 border-2 border-red-600 p-3 mb-4" role="alert">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="editBusinessName" className="block text-sm font-semibold text-gray-900 mb-2">
                Business Name *
              </label>
              <Input
                id="editBusinessName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
              />
            </div>

            {/* Category */}
            <div className="mb-4">
              <label htmlFor="editBusinessCategory" className="block text-sm font-semibold text-gray-900 mb-2">
                Category
              </label>
              <Input
                id="editBusinessCategory"
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Food & Drink, Health & Wellness"
                className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
              />
            </div>

            {/* Status */}
            <div className="mb-4">
              <label htmlFor="editBusinessStatus" className="block text-sm font-semibold text-gray-900 mb-2">
                Status
              </label>
              <select
                id="editBusinessStatus"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-300 bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="">Select status...</option>
                <option value="Active">Active</option>
                <option value="Prospect">Prospect</option>
                <option value="Former">Former</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {/* Club Card Checkbox */}
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_club_card}
                  onChange={(e) =>
                    setFormData({ ...formData, is_club_card: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold text-gray-900">
                  Club Card Member
                </span>
              </label>
            </div>

            {/* Advertiser Checkbox */}
            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_advertiser}
                  onChange={(e) =>
                    setFormData({ ...formData, is_advertiser: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold text-gray-900">
                  Advertiser
                </span>
              </label>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label htmlFor="editBusinessNotes" className="block text-sm font-semibold text-gray-900 mb-2">
                Notes
              </label>
              <textarea
                id="editBusinessNotes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes about this business..."
                rows={4}
                className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600 focus:outline-none resize-y"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3"
              >
                Cancel
              </Button>
            </div>
          </form>

          {/* Danger Zone - Delete Business */}
          <div className="mt-6 pt-6 border-t-2 border-gray-300">
            <h3 className="text-sm font-bold text-red-900 mb-2">Danger Zone</h3>
            <p className="text-xs text-gray-600 mb-3">
              Deleting this business will permanently remove all contacts and correspondence entries.
              This action cannot be undone.
            </p>
            <Button
              type="button"
              onClick={handleDeleteClick}
              disabled={saving}
              className="bg-red-600 text-white hover:bg-red-700 px-6 py-3 font-semibold"
            >
              Delete Business
            </Button>
          </div>
        </div>
      </div>

      {/* First delete confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`Delete "${business.name}"?`}
        description={`This will permanently delete the business, all contacts, and all correspondence entries. This action CANNOT be undone.`}
        confirmLabel="Continue to Delete"
        cancelLabel="Keep Business"
        destructive
        onConfirm={handleDeleteFirstConfirm}
      />

      {/* Final delete confirmation with typed input */}
      {showFinalDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div ref={finalDeleteRef} role="alertdialog" aria-modal="true" aria-labelledby="final-delete-title" className="bg-white border-2 border-gray-800 p-6 max-w-md w-full mx-4">
            <h3 id="final-delete-title" className="text-lg font-bold text-red-900 mb-2">Final Confirmation</h3>
            <p className="text-sm text-gray-700 mb-4">
              Type <strong>DELETE</strong> to confirm deletion of &quot;{business.name}&quot;:
            </p>
            <Input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button
                onClick={handleDeleteFinal}
                disabled={deleteConfirmText !== 'DELETE' || saving}
                className="bg-red-600 text-white hover:bg-red-700 px-6 py-3 font-semibold disabled:opacity-50"
              >
                {saving ? 'Deleting...' : 'Delete Permanently'}
              </Button>
              <Button
                onClick={() => {
                  setShowFinalDeleteConfirm(false)
                  setDeleteConfirmText('')
                }}
                disabled={saving}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
