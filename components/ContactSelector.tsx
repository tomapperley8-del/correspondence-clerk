'use client'

import { useState, memo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Contact } from '@/app/actions/contacts'

interface ContactSelectorProps {
  contacts: Contact[]
  selectedContactId: string | null
  onSelect: (contactId: string) => void
  onAddNew: () => void
  error?: string
  disabled?: boolean
  onContactUpdated?: (contact: Contact) => void  // Feature #1: Callback when contact is edited
}

function ContactSelectorComponent({
  contacts,
  selectedContactId,
  onSelect,
  onAddNew,
  error,
  disabled = false,
  onContactUpdated,
}: ContactSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  // Feature #1: Inline editing state
  const [isEditing, setIsEditing] = useState(false)
  const [editedRole, setEditedRole] = useState('')
  const [editedEmails, setEditedEmails] = useState<string[]>([])
  const [editedPhones, setEditedPhones] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const selectedContact = contacts.find((c) => c.id === selectedContactId)

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (contactId: string) => {
    onSelect(contactId)
    setIsOpen(false)
    setSearchTerm('')
  }

  // Feature #1: Handle inline editing
  const handleStartEdit = () => {
    if (!selectedContact) return
    setEditedRole(selectedContact.role || '')
    setEditedEmails(selectedContact.emails || [selectedContact.email || ''].filter(Boolean))
    setEditedPhones(selectedContact.phones || [selectedContact.phone || ''].filter(Boolean))
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedRole('')
    setEditedEmails([])
    setEditedPhones([])
  }

  const handleSaveEdit = async () => {
    if (!selectedContact) return

    setIsSaving(true)

    try {
      const response = await fetch('/api/contacts/update-details', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedContact.id,
          role: editedRole.trim() || null,
          emails: editedEmails.filter((e) => e.trim()),
          phones: editedPhones.filter((p) => p.trim()),
        }),
      })

      if (response.ok) {
        const { data } = await response.json()
        if (data && onContactUpdated) {
          onContactUpdated(data)
        }
        setIsEditing(false)
      } else {
        alert('Failed to update contact details')
      }
    } catch (error) {
      console.error('Error updating contact:', error)
      alert('Error updating contact details')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddEmail = () => {
    setEditedEmails([...editedEmails, ''])
  }

  const handleRemoveEmail = (index: number) => {
    setEditedEmails(editedEmails.filter((_, i) => i !== index))
  }

  const handleAddPhone = () => {
    setEditedPhones([...editedPhones, ''])
  }

  const handleRemovePhone = (index: number) => {
    setEditedPhones(editedPhones.filter((_, i) => i !== index))
  }

  return (
    <div>
      <Label className="block mb-2 font-semibold">
        Contact <span className="text-red-600">*</span>
      </Label>

      {!selectedContact ? (
        <div className="relative">
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={disabled ? "Select a business first..." : "Search for a contact..."}
            className={`w-full ${error ? 'border-red-600' : ''}`}
            disabled={disabled}
          />

          {isOpen && !disabled && (
            <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-800 max-h-60 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-gray-600 text-sm mb-3">
                    No contacts found
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      onAddNew()
                    }}
                    className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2"
                  >
                    Add New Contact
                  </Button>
                </div>
              ) : (
                <>
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleSelect(contact.id)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-300 last:border-b-0"
                    >
                      <div className="font-semibold">{contact.name}</div>
                      {contact.role && (
                        <div className="text-xs text-gray-600 mt-1">
                          {contact.role}
                        </div>
                      )}
                      {(contact.email || contact.phone) && (
                        <div className="text-xs text-gray-500 mt-1">
                          {contact.email && <span>{contact.email}</span>}
                          {contact.email && contact.phone && <span> • </span>}
                          {contact.phone && <span>{contact.phone}</span>}
                        </div>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      onAddNew()
                    }}
                    className="w-full text-left px-4 py-3 bg-gray-100 hover:bg-gray-200 text-blue-600 font-semibold"
                  >
                    + Add New Contact
                  </button>
                </>
              )}
            </div>
          )}

          {isOpen && !disabled && (
            <div
              className="fixed inset-0 z-0"
              onClick={() => setIsOpen(false)}
            />
          )}
        </div>
      ) : isEditing ? (
        /* Feature #1: Inline Edit Mode */
        <div className="border-2 border-blue-600 bg-blue-50 px-4 py-3">
          <h3 className="font-semibold text-gray-900 mb-3">
            Edit Details for {selectedContact.name}
          </h3>

          {/* Role */}
          <div className="mb-3">
            <Label htmlFor="editRole" className="block text-sm font-semibold mb-1">
              Role
            </Label>
            <Input
              id="editRole"
              type="text"
              value={editedRole}
              onChange={(e) => setEditedRole(e.target.value)}
              placeholder="e.g., Manager, Director"
              className="w-full"
            />
          </div>

          {/* Emails */}
          <div className="mb-3">
            <Label className="block text-sm font-semibold mb-1">Emails</Label>
            {editedEmails.map((email, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    const newEmails = [...editedEmails]
                    newEmails[index] = e.target.value
                    setEditedEmails(newEmails)
                  }}
                  placeholder="email@example.com"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={() => handleRemoveEmail(index)}
                  className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs"
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              onClick={handleAddEmail}
              className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-3 py-1 text-xs"
            >
              + Add Email
            </Button>
          </div>

          {/* Phones */}
          <div className="mb-4">
            <Label className="block text-sm font-semibold mb-1">Phones</Label>
            {editedPhones.map((phone, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    const newPhones = [...editedPhones]
                    newPhones[index] = e.target.value
                    setEditedPhones(newPhones)
                  }}
                  placeholder="+44 20 1234 5678"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={() => handleRemovePhone(index)}
                  className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs"
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              onClick={handleAddPhone}
              className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-3 py-1 text-xs"
            >
              + Add Phone
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 text-sm font-semibold"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* Feature #1: Display Mode with Edit Button */
        <div className="border-2 border-green-600 bg-green-50 px-4 py-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="font-semibold text-gray-900">
                {selectedContact.name}
              </div>
              {selectedContact.role && (
                <div className="text-xs text-gray-600 mt-1">
                  {selectedContact.role}
                </div>
              )}
              {(selectedContact.emails || selectedContact.phones) && (
                <div className="text-xs text-gray-600 mt-1">
                  {selectedContact.emails && selectedContact.emails.length > 0 && (
                    <div>
                      {selectedContact.emails.map((email, idx) => (
                        <a
                          key={idx}
                          href={`mailto:${email}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline block"
                        >
                          {email}
                        </a>
                      ))}
                    </div>
                  )}
                  {selectedContact.phones && selectedContact.phones.length > 0 && (
                    <div className="mt-1">
                      {selectedContact.phones.map((phone, idx) => (
                        <a
                          key={idx}
                          href={`tel:${phone}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline block"
                        >
                          {phone}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              <Button
                type="button"
                onClick={handleStartEdit}
                className="bg-blue-100 text-blue-900 hover:bg-blue-200 px-3 py-2 text-sm"
              >
                Edit Details
              </Button>
              <Button
                type="button"
                onClick={() => onSelect('')}
                className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-3 py-2 text-sm"
              >
                Change
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  )
}

// Memoize to prevent unnecessary re-renders during email import
export const ContactSelector = memo(ContactSelectorComponent)
