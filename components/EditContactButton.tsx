'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateContact, type Contact } from '@/app/actions/contacts'
import { useRouter } from 'next/navigation'
import { useModalKeyboard } from '@/lib/hooks/useModalKeyboard'
import { toast } from '@/lib/toast'

export function EditContactButton({ contact }: { contact: Contact }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(contact.name)
  const [role, setRole] = useState(contact.role || '')
  const [emails, setEmails] = useState<string[]>(
    contact.emails && contact.emails.length > 0 ? contact.emails : ['']
  )
  const [phones, setPhones] = useState<string[]>(
    contact.phones && contact.phones.length > 0 ? contact.phones : ['']
  )
  const [notes, setNotes] = useState(contact.notes || '')
  const [isActive, setIsActive] = useState(contact.is_active ?? true)
  const [routeToInbox, setRouteToInbox] = useState(contact.route_to_inbox ?? false)

  const handleCancel = () => {
    setName(contact.name)
    setRole(contact.role || '')
    setEmails(contact.emails && contact.emails.length > 0 ? contact.emails : [''])
    setPhones(contact.phones && contact.phones.length > 0 ? contact.phones : [''])
    setNotes(contact.notes || '')
    setIsActive(contact.is_active ?? true)
    setRouteToInbox(contact.route_to_inbox ?? false)
    setError(null)
    setIsOpen(false)
  }

  const modalRef = useModalKeyboard(isOpen, handleCancel)

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
    setSaving(true)
    setError(null)

    // Filter out empty emails and phones
    const filteredEmails = emails.filter(e => e.trim())
    const filteredPhones = phones.filter(p => p.trim())

    const result = await updateContact(contact.id, {
      name,
      role: role || undefined,
      emails: filteredEmails,
      phones: filteredPhones,
      notes: notes || undefined,
      is_active: isActive,
      route_to_inbox: routeToInbox,
    })

    if ('error' in result) {
      setError(result.error || 'An error occurred')
      setSaving(false)
    } else {
      setSaving(false)
      setIsOpen(false)
      toast.success('Contact updated')
      router.refresh()
    }
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-gray-100 text-gray-900 hover:bg-gray-200 px-3 py-1 text-xs"
      >
        Edit
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="edit-contact-title" className="bg-white border border-gray-200 shadow-[var(--shadow-lg)] p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 id="edit-contact-title" className="text-xl font-bold text-gray-900">Edit Contact</h2>
          <button type="button" onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm font-medium">Close</button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 p-3 mb-4" role="alert">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Contact Name *
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Role
            </label>
            <Input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Owner, Manager, Director"
              className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy"
            />
          </div>

          {/* Email Addresses */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-900">
                Email Addresses
              </label>
              <Button
                type="button"
                onClick={handleAddEmail}
                disabled={saving}
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
                    disabled={saving}
                    className="flex-1"
                    placeholder="john@example.com"
                  />
                  {emails.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => handleRemoveEmail(index)}
                      disabled={saving}
                      className="bg-red-100 text-red-800 hover:bg-red-200 px-3 py-2 text-sm"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Phone Numbers */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-900">
                Phone Numbers
              </label>
              <Button
                type="button"
                onClick={handleAddPhone}
                disabled={saving}
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
                    disabled={saving}
                    className="flex-1"
                    placeholder="020 1234 5678"
                  />
                  {phones.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => handleRemovePhone(index)}
                      disabled={saving}
                      className="bg-red-100 text-red-800 hover:bg-red-200 px-3 py-2 text-sm"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active/Former toggle */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Status
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={`px-4 py-2 text-sm font-medium border ${isActive ? 'bg-green-100 border-green-400 text-green-800' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={`px-4 py-2 text-sm font-medium border ${!isActive ? 'bg-gray-200 border-gray-400 text-gray-800' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}
              >
                Has left
              </button>
            </div>
            {!isActive && (
              <p className="text-xs text-gray-500 mt-1">This contact will be shown as "(Former)" throughout the app.</p>
            )}
          </div>

          {/* Route to inbox */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Email routing
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={routeToInbox}
                onChange={(e) => setRouteToInbox(e.target.checked)}
                disabled={saving}
                className="mt-0.5 cursor-pointer"
                style={{ accentColor: 'var(--brand-navy)', width: 15, height: 15 }}
              />
              <span className="text-sm">
                <span className="font-medium text-gray-900">Always route to inbox</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Emails from this contact will appear in your inbox for manual filing instead of being auto-filed.
                </span>
              </span>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this contact..."
              rows={3}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 focus:border-brand-navy focus:outline-none resize-y"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving}
              className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-3 font-semibold"
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
