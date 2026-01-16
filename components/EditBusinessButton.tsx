'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateBusiness, type Business } from '@/app/actions/businesses'

export function EditBusinessButton({ business }: { business: Business }) {
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: business.name,
    category: business.category || '',
    status: business.status || '',
    is_club_card: business.is_club_card,
    is_advertiser: business.is_advertiser,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const result = await updateBusiness(business.id, {
      name: formData.name,
      category: formData.category || null,
      status: formData.status || null,
      is_club_card: formData.is_club_card,
      is_advertiser: formData.is_advertiser,
    })

    if ('error' in result) {
      setError(result.error)
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
    })
    setError(null)
    setIsOpen(false)
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
          <div className="mb-6">
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
      </div>
    </div>
  )
}
