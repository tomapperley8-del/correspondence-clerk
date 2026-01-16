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
  const [role, setRole] = useState('')
  const [emails, setEmails] = useState<string[]>([''])
  const [phones, setPhones] = useState<string[]>([''])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleAddEmail = () => {
    setEmails([...emails, ''])
  }

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index))
  }

  const handleEmailChange = (index: number, value: string) => {
    const newEmails = [...emails]
    newEmails[index] = value
    setEmails(newEmails)
  }

  const handleAddPhone = () => {
    setPhones([...phones, ''])
  }

  const handleRemovePhone = (index: number) => {
    setPhones(phones.filter((_, i) => i !== index))
  }

  const handlePhoneChange = (index: number, value: string) => {
    const newPhones = [...phones]
    newPhones[index] = value
    setPhones(newPhones)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    // Filter out empty emails and phones
    const filteredEmails = emails.filter(e => e.trim())
    const filteredPhones = phones.filter(p => p.trim())

    const result = await createContact({
      business_id: businessId,
      name,
      role: role || undefined,
      emails: filteredEmails,
      phones: filteredPhones,
    })

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setIsLoading(false)
    } else if (result.data) {
      setName('')
      setRole('')
      setEmails([''])
      setPhones([''])
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
      <div className="bg-white border-2 border-gray-800 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
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
            <div className="flex justify-between items-center mb-2">
              <Label className="font-semibold">Email Addresses</Label>
              <Button
                type="button"
                onClick={handleAddEmail}
                disabled={isLoading}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-3 py-1 text-xs"
              >
                Add Another Email
              </Button>
            </div>
            <div className="space-y-2">
              {emails.map((email, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => handleEmailChange(index, e.target.value)}
                    disabled={isLoading}
                    className="flex-1"
                    placeholder="john@example.com"
                  />
                  {emails.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => handleRemoveEmail(index)}
                      disabled={isLoading}
                      className="bg-red-100 text-red-800 hover:bg-red-200 px-3 py-2 text-sm"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="font-semibold">Phone Numbers</Label>
              <Button
                type="button"
                onClick={handleAddPhone}
                disabled={isLoading}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-3 py-1 text-xs"
              >
                Add Another Phone
              </Button>
            </div>
            <div className="space-y-2">
              {phones.map((phone, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(index, e.target.value)}
                    disabled={isLoading}
                    className="flex-1"
                    placeholder="555-123-4567"
                  />
                  {phones.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => handleRemovePhone(index)}
                      disabled={isLoading}
                      className="bg-red-100 text-red-800 hover:bg-red-200 px-3 py-2 text-sm"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
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
