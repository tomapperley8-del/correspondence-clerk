'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateBusiness, type Business } from '@/app/actions/businesses'

export function EditBusinessDetailsButton({
  business,
  onUpdate
}: {
  business: Business
  onUpdate?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    address: business.address || '',
    email: business.email || '',
    phone: business.phone || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const result = await updateBusiness(business.id, {
      address: formData.address || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
    })

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setSaving(false)
    } else {
      setSaving(false)
      setIsOpen(false)
      if (onUpdate) {
        onUpdate()
      } else {
        window.location.reload() // Refresh to show updated data
      }
    }
  }

  const handleCancel = () => {
    setFormData({
      address: business.address || '',
      email: business.email || '',
      phone: business.phone || '',
    })
    setError(null)
    setIsOpen(false)
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-3 py-1 text-xs font-semibold"
      >
        Edit Details
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white border-2 border-gray-300 p-6 max-w-lg w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Business Details</h2>

        {error && (
          <div className="bg-red-50 border-2 border-red-600 p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Address */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Address
            </label>
            <Input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Business physical address"
              className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
            />
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Email
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Business email contact"
              className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
            />
          </div>

          {/* Phone */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Phone
            </label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Business phone number"
              className="w-full px-3 py-2 border-2 border-gray-300 focus:border-blue-600"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
            >
              {saving ? 'Saving...' : 'Save Details'}
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
