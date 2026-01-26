'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateBusiness, deleteBusiness, type Business } from '@/app/actions/businesses'
import { useRouter } from 'next/navigation'

export function EditBusinessButton({ business }: { business: Business }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: business.name,
    category: business.category || '',
    status: business.status || '',
    is_club_card: business.is_club_card,
    is_advertiser: business.is_advertiser,
    notes: business.notes || '',
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
      window.location.reload() // Refresh to show updated data
    }
  }

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

  const handleDelete = async () => {
    const confirmMessage = `Are you sure you want to delete "${business.name}"?\n\nThis will delete:\n- The business\n- All contacts\n- All correspondence entries\n\nThis action CANNOT be undone.`

    if (!confirm(confirmMessage)) {
      return
    }

    // Second confirmation
    const finalConfirm = prompt(`Type DELETE to confirm deletion of "${business.name}":`)
    if (finalConfirm !== 'DELETE') {
      alert('Deletion cancelled')
      return
    }

    setSaving(true)
    setError(null)

    const result = await deleteBusiness(business.id)

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setSaving(false)
    } else {
      // Redirect to dashboard after deletion
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white border-2 border-gray-300 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Business</h2>

        {error && (
          <div className="bg-red-50 border-2 border-red-600 p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Business Name *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
            />
          </div>

          {/* Category */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Category
            </label>
            <Input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Food & Drink, Health & Wellness"
              className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
            />
          </div>

          {/* Status */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Status
            </label>
            <select
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
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Notes
            </label>
            <textarea
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
            onClick={handleDelete}
            disabled={saving}
            className="bg-red-600 text-white hover:bg-red-700 px-6 py-3 font-semibold"
          >
            Delete Business
          </Button>
        </div>
      </div>
    </div>
  )
}
