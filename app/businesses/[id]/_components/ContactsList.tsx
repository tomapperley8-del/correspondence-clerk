'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { type Contact } from '@/app/actions/contacts'
import { type Business } from '@/app/actions/businesses'
import { EditContactButton } from '@/components/EditContactButton'
import { AddContactButton } from '@/components/AddContactButton'
import { CopyButton } from '@/components/CopyButton'

interface ContactsListProps {
  contacts: Contact[]
  business: Business
  onDeleteContact: (id: string, name: string) => void
}

export const ContactsList = React.memo(function ContactsList({ contacts, business, onDeleteContact }: ContactsListProps) {
  return (
    <div className="bg-white border-2 border-gray-300 p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Contacts</h2>
        <AddContactButton businessId={business.id} />
      </div>

      {contacts && contacts.length === 0 ? (
        <p className="text-gray-600 text-sm">
          No contacts yet. Add a contact to get started.
        </p>
      ) : (
        <div className="space-y-4">
          {contacts?.map((contact) => (
            <div key={contact.id} className="border border-gray-300 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{contact.name}</h3>
                  {contact.role && (
                    <p className="text-sm text-gray-600">{contact.role}</p>
                  )}
                  {contact.emails && contact.emails.length > 0 && (
                    <div className="mt-1">
                      {contact.emails.map((email, index) => (
                        <p key={index} className="text-sm text-gray-600 flex items-center">
                          <a
                            href={`mailto:${email}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {email}
                          </a>
                          <CopyButton text={email} />
                        </p>
                      ))}
                    </div>
                  )}
                  {contact.phones && contact.phones.length > 0 && (
                    <div>
                      {contact.phones.map((phone, index) => (
                        <p key={index} className="text-sm text-gray-600 flex items-center">
                          <a
                            href={`tel:${phone}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {phone}
                          </a>
                          <CopyButton text={phone} />
                        </p>
                      ))}
                    </div>
                  )}
                  {contact.notes && (
                    <div className="mt-2 text-sm text-gray-500 italic">
                      <span className="font-medium not-italic text-gray-600">Notes: </span>
                      {contact.notes.length > 150
                        ? `${contact.notes.substring(0, 150)}...`
                        : contact.notes}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <EditContactButton contact={contact} />
                  <Button
                    onClick={() => onDeleteContact(contact.id, contact.name)}
                    className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
