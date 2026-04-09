'use client'
import { Button } from '@/components/ui/button'
import { BusinessSelector } from '@/components/BusinessSelector'
import { ContactSelector } from '@/components/ContactSelector'
import { MultiContactSelector } from '@/components/MultiContactSelector'
import type { Business } from '@/app/actions/businesses'
import type { Contact } from '@/app/actions/contacts'

type Props = {
  businesses: Business[]
  contacts: Contact[]
  selectedBusinessId: string | null
  selectedContactId: string | null
  ccContactIds: string[]
  bccContactIds: string[]
  entryType: string
  errors: { business?: string; contact?: string }
  suggestedBusinessEmail: string | null
  showBusinessEmailPrompt: boolean
  senderEmailData: { email: string; name: string } | null
  onBusinessSelect: (id: string) => Promise<void>
  onContactSelect: (id: string) => void
  onAddNewBusiness: () => void
  onAddNewContact: () => void
  onContactUpdated: (c: Contact) => void
  onCcChange: (ids: string[]) => void
  onBccChange: (ids: string[]) => void
  onAcceptBusinessEmail: () => void
  onDeclineBusinessEmail: () => void
}

export function FilingSection({
  businesses, contacts, selectedBusinessId, selectedContactId,
  ccContactIds, bccContactIds, entryType, errors,
  suggestedBusinessEmail, showBusinessEmailPrompt, senderEmailData,
  onBusinessSelect, onContactSelect, onAddNewBusiness, onAddNewContact,
  onContactUpdated, onCcChange, onBccChange,
  onAcceptBusinessEmail, onDeclineBusinessEmail,
}: Props) {
  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId)

  return (
    <>
      <BusinessSelector
        businesses={businesses}
        selectedBusinessId={selectedBusinessId}
        onSelect={onBusinessSelect}
        onAddNew={onAddNewBusiness}
        error={errors.business}
      />

      {showBusinessEmailPrompt && suggestedBusinessEmail && (
        <div className="bg-brand-navy/[0.04] border border-brand-navy/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">
                Add Email to {selectedBusiness?.name}?
              </h3>
              <p className="text-sm text-gray-700 mb-3">
                This email came from <strong>{senderEmailData?.email}</strong>.{' '}
                Would you like to add <strong>{suggestedBusinessEmail}</strong> as the primary email for this business?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={onAcceptBusinessEmail}
                  className="bg-brand-navy text-white hover:bg-brand-navy-hover px-4 py-2 text-sm font-semibold"
                >
                  Yes, Add Email
                </Button>
                <Button
                  type="button"
                  onClick={onDeclineBusinessEmail}
                  className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2 text-sm"
                >
                  No, Skip
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {entryType !== 'Note' && (
        <ContactSelector
          contacts={contacts}
          selectedContactId={selectedContactId}
          onSelect={onContactSelect}
          onAddNew={onAddNewContact}
          error={errors.contact}
          disabled={!selectedBusinessId}
          onContactUpdated={onContactUpdated}
        />
      )}

      {selectedBusinessId && contacts.length > 1 && (
        <MultiContactSelector
          label="CC Contacts (optional)"
          contacts={contacts}
          selectedIds={ccContactIds}
          excludeIds={selectedContactId ? [selectedContactId] : []}
          onSelectionChange={onCcChange}
        />
      )}

      {selectedBusinessId && contacts.length > 1 && (
        <MultiContactSelector
          label="BCC Contacts (optional)"
          contacts={contacts}
          selectedIds={bccContactIds}
          excludeIds={selectedContactId ? [selectedContactId, ...ccContactIds] : ccContactIds}
          onSelectionChange={onBccChange}
        />
      )}
    </>
  )
}
