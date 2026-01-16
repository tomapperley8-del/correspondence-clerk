'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBusiness } from '@/app/actions/businesses'
import type { Business } from '@/app/actions/businesses'

interface AddBusinessModalProps {
  isOpen: boolean
  onClose: () => void
  onBusinessAdded: (business: Business) => void
}

export function AddBusinessModal({
  isOpen,
  onClose,
  onBusinessAdded,
}: AddBusinessModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [isClubCard, setIsClubCard] = useState(false)
  const [isAdvertiser, setIsAdvertiser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const result = await createBusiness({
      name,
      category: category || undefined,
      status: status || undefined,
      is_club_card: isClubCard,
      is_advertiser: isAdvertiser,
    })

    if ('error' in result) {
      setError(result.error)
      setIsLoading(false)
    } else if (result.data) {
      setName('')
      setCategory('')
      setStatus('')
      setIsClubCard(false)
      setIsAdvertiser(false)
      setIsLoading(false)
      onBusinessAdded(result.data)
      onClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-gray-800 w-full max-w-2xl p-6">
        <h2 className="text-xl font-bold mb-6">Add New Business</h2>

        {error && (
          <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" className="block mb-2 font-semibold">
              Business Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
              placeholder="Acme Corporation"
            />
          </div>

          <div>
            <Label htmlFor="category" className="block mb-2 font-semibold">
              Category
            </Label>
            <Input
              id="category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isLoading}
              className="w-full"
              placeholder="e.g. Restaurant, Retail, Professional Services"
            />
          </div>

          <div>
            <Label htmlFor="status" className="block mb-2 font-semibold">
              Status
            </Label>
            <Input
              id="status"
              type="text"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={isLoading}
              className="w-full"
              placeholder="e.g. Active, Prospect, Inactive"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isClubCard}
                onChange={(e) => setIsClubCard(e.target.checked)}
                disabled={isLoading}
                className="mr-2"
              />
              <span className="text-sm">Club Card member</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isAdvertiser}
                onChange={(e) => setIsAdvertiser(e.target.checked)}
                disabled={isLoading}
                className="mr-2"
              />
              <span className="text-sm">Advertiser</span>
            </label>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
            >
              {isLoading ? 'Adding...' : 'Add Business'}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              disabled={isLoading}
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
