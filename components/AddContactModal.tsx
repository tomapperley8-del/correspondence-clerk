'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createContact } from '@/app/actions/contacts'
import type { Contact } from '@/app/actions/contacts'

interface AddContactModalProps {
  isOpen: boolean
  onClose: () => void
  businessId: string
  onContactAdded: (contact: Contact) => void
}

export function AddContactModal({
  isOpen,
  onClose,
  businessId,
  onContactAdded,
}: AddContactModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const result = await createContact({
      business_id: businessId,
      name,
      email: email || undefined,
      role: role || undefined,
      phone: phone || undefined,
    })

    if ('error' in result) {
      setError(result.error)
      setIsLoading(false)
    } else if (result.data) {
      setName('')
      setEmail('')
      setRole('')
      setPhone('')
      setIsLoading(false)
      onContactAdded(result.data)
      onClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-gray-800 w-full max-w-2xl p-6">
        <h2 className="text-xl font-bold mb-6">Add New Contact</h2>

        {error && (
          <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" className="block mb-2 font-semibold">
              Contact Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
              placeholder="John Smith"
            />
          </div>

          <div>
            <Label htmlFor="role" className="block mb-2 font-semibold">
              Role / Position
            </Label>
            <Input
              id="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isLoading}
              className="w-full"
              placeholder="e.g. Owner, Manager, Director"
            />
          </div>

          <div>
            <Label htmlFor="email" className="block mb-2 font-semibold">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="block mb-2 font-semibold">
              Phone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isLoading}
              className="w-full"
              placeholder="555-123-4567"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
            >
              {isLoading ? 'Adding...' : 'Add Contact'}
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
