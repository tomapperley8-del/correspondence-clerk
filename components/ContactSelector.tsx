'use client'

import { useState } from 'react'
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
}

export function ContactSelector({
  contacts,
  selectedContactId,
  onSelect,
  onAddNew,
  error,
  disabled = false,
}: ContactSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const selectedContact = contacts.find((c) => c.id === selectedContactId)

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (contactId: string) => {
    onSelect(contactId)
    setIsOpen(false)
    setSearchTerm('')
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
      ) : (
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
              {(selectedContact.email || selectedContact.phone) && (
                <div className="text-xs text-gray-600 mt-1">
                  {selectedContact.email && (
                    <div>
                      <a
                        href={`mailto:${selectedContact.email}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {selectedContact.email}
                      </a>
                    </div>
                  )}
                  {selectedContact.phone && (
                    <div>
                      <a
                        href={`tel:${selectedContact.phone}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {selectedContact.phone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={() => onSelect('')}
              className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 ml-4"
            >
              Change
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  )
}
