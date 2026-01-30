'use client'

import { useState, useRef, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { Contact } from '@/app/actions/contacts'

interface MultiContactSelectorProps {
  label: string
  contacts: Contact[]
  selectedIds: string[]
  excludeIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function MultiContactSelector({
  label,
  contacts,
  selectedIds,
  excludeIds,
  onSelectionChange,
}: MultiContactSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter out excluded contacts (primary contact, or already in CC for BCC selector)
  const availableContacts = contacts.filter(c => !excludeIds.includes(c.id))

  // Filter by search term
  const filteredContacts = availableContacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contact.emails && contact.emails.some(e => e.toLowerCase().includes(searchTerm.toLowerCase())))
  )

  // Get selected contact objects
  const selectedContacts = contacts.filter(c => selectedIds.includes(c.id))

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggleContact = (contactId: string) => {
    if (selectedIds.includes(contactId)) {
      onSelectionChange(selectedIds.filter(id => id !== contactId))
    } else {
      onSelectionChange([...selectedIds, contactId])
    }
  }

  const handleRemoveContact = (contactId: string) => {
    onSelectionChange(selectedIds.filter(id => id !== contactId))
  }

  if (availableContacts.length === 0) {
    return null
  }

  return (
    <div ref={containerRef}>
      <Label className="block mb-2 font-semibold">
        {label}
      </Label>

      {/* Selected contacts as tags */}
      {selectedContacts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedContacts.map(contact => (
            <span
              key={contact.id}
              className="inline-flex items-center bg-blue-100 text-blue-900 px-3 py-1 text-sm"
            >
              <span>{contact.name}</span>
              {contact.role && (
                <span className="text-blue-600 ml-1">({contact.role})</span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveContact(contact.id)}
                className="ml-2 text-blue-600 hover:text-blue-900 font-bold"
                aria-label={`Remove ${contact.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger and search */}
      <div className="relative">
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={`Search contacts to add...`}
          className="w-full"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="multi-contact-listbox"
          aria-label={`Search ${label.toLowerCase()}`}
        />

        {isOpen && (
          <div
            id="multi-contact-listbox"
            role="listbox"
            className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-800 max-h-60 overflow-y-auto"
          >
            {filteredContacts.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-gray-600 text-sm">
                  {searchTerm ? 'No contacts match your search' : 'No contacts available'}
                </p>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedIds.includes(contact.id)
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleToggleContact(contact.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-300 last:border-b-0 flex items-center gap-3 ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 pointer-events-none"
                      tabIndex={-1}
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{contact.name}</div>
                      {contact.role && (
                        <div className="text-xs text-gray-600">
                          {contact.role}
                        </div>
                      )}
                      {contact.emails && contact.emails.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {contact.emails[0]}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-sm text-gray-600 mt-2">
          {selectedIds.length} contact{selectedIds.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}
