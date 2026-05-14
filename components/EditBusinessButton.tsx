'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateBusiness, deleteBusiness, type Business } from '@/app/actions/businesses'
import { getActiveBusinessTypes, type BusinessType } from '@/app/actions/business-types'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'
import { appEvents } from '@/lib/events'
import { toast } from '@/lib/toast'

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
    notes: business.notes || '',
  })
  const [isProspect, setIsProspect] = useState(business.status === 'Prospect')
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([])
  const [businessTypeValue, setBusinessTypeValue] = useState(business.business_type ?? '')
  const [disposition, setDisposition] = useState<string>(business.disposition ?? '')
  const [followUpAfter, setFollowUpAfter] = useState<string>(business.follow_up_after ?? '')

  // Load business types when modal opens
  const [typesLoaded, setTypesLoaded] = useState(false)
  const handleOpen = () => {
    setIsOpen(true)
    if (!typesLoaded) {
      getActiveBusinessTypes().then(r => {
        if (r.data) setBusinessTypes(r.data)
        setTypesLoaded(true)
      })
    }
  }

  const handleCancel = () => {
    setFormData({
      name: business.name,
      category: business.category || '',
      status: business.status || '',
      notes: business.notes || '',
    })
    setIsProspect(business.status === 'Prospect')
    setBusinessTypeValue(business.business_type ?? '')
    setDisposition(business.disposition ?? '')
    setFollowUpAfter(business.follow_up_after ?? '')
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

    let newStatus: string | null = formData.status || null
    if (isProspect) {
      newStatus = 'Prospect'
    } else if (business.status === 'Prospect') {
      newStatus = (business.is_club_card || business.is_advertiser) ? 'Active' : null
    }

    const result = await updateBusiness(business.id, {
      name: formData.name,
      category: formData.category || null,
      status: newStatus,
      notes: formData.notes || null,
      business_type: businessTypeValue || null,
      disposition: (disposition as 'follow_up_later' | 'not_interested') || null,
      follow_up_after: (disposition === 'follow_up_later' && followUpAfter) ? followUpAfter : null,
    })

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setSaving(false)
    } else {
      appEvents.businessesChanged()
      setSaving(false)
      setIsOpen(false)
      toast.success('Business updated')
      router.refresh()
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
      appEvents.businessesChanged()
      router.push('/dashboard')
    }
  }

  if (!isOpen) {
    return (
      <Button
        onClick={handleOpen}
        className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-4 py-2 text-sm font-semibold"
      >
        Edit Business
      </Button>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="edit-business-title" className="bg-white border border-gray-200 shadow-[var(--shadow-lg)] p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 id="edit-business-title" className="text-xl font-bold text-gray-900">Edit Business</h2>
            <button type="button" onClick={handleCancel} className="text-gray-400 hover:text-gray-600 text-sm font-medium">Close</button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 p-3 mb-4" role="alert">
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
                className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy"
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
                placeholder="e.g., Food & Drink, Collaborator, Health & Wellness"
                className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy"
              />
            </div>

            {/* Business Type */}
            {businessTypes.length > 0 && (
              <div className="mb-4">
                <label htmlFor="editBusinessType" className="block text-sm font-semibold text-gray-900 mb-2">
                  Business Type
                </label>
                <select
                  id="editBusinessType"
                  value={businessTypeValue}
                  onChange={(e) => setBusinessTypeValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy focus:outline-none bg-white"
                >
                  <option value="">— no type —</option>
                  {businessTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Disposition */}
            <div className="mb-4">
              <label htmlFor="editDisposition" className="block text-sm font-semibold text-gray-900 mb-2">
                Outreach Disposition
              </label>
              <select
                id="editDisposition"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy focus:outline-none bg-white"
              >
                <option value="">— none —</option>
                <option value="follow_up_later">Follow up later</option>
                <option value="not_interested">Not interested</option>
              </select>
            </div>

            {disposition === 'follow_up_later' && (
              <div className="mb-4">
                <label htmlFor="editFollowUpAfter" className="block text-sm font-semibold text-gray-900 mb-2">
                  Follow up after
                </label>
                <Input
                  id="editFollowUpAfter"
                  type="date"
                  value={followUpAfter}
                  onChange={(e) => setFollowUpAfter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy"
                />
              </div>
            )}

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
                className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy focus:outline-none resize-y"
              />
            </div>

            {/* Flags */}
            <div className="mb-6 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isProspect}
                  onChange={(e) => setIsProspect(e.target.checked)}
                  disabled={saving}
                />
                <span className="text-sm font-medium">Prospect</span>
              </label>

              <label className="flex items-center gap-2 opacity-60" title="Controlled by contracts — add or remove a contract to change">
                <input
                  type="checkbox"
                  checked={business.is_club_card}
                  disabled
                  readOnly
                />
                <span className="text-sm">Club Card member</span>
                <span className="text-xs text-gray-400">(set via contracts)</span>
              </label>

              <label className="flex items-center gap-2 opacity-60" title="Controlled by contracts — add or remove a contract to change">
                <input
                  type="checkbox"
                  checked={business.is_advertiser}
                  disabled
                  readOnly
                />
                <span className="text-sm">Advertiser</span>
                <span className="text-xs text-gray-400">(set via contracts)</span>
              </label>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-3 font-semibold"
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
          <div className="mt-6 pt-6 border-t border-gray-200">
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
          <div ref={finalDeleteRef} role="alertdialog" aria-modal="true" aria-labelledby="final-delete-title" className="bg-white border border-gray-200 shadow-[var(--shadow-lg)] p-6 max-w-md w-full mx-4">
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
