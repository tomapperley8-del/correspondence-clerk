'use client';

/**
 * Contact Extraction Modal
 * Shows extracted contacts from Word documents and allows user to review and add them
 * Per CLAUDE.md: Manual edits only, clear labels, no icon-only buttons
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ExtractedContact } from '@/lib/contact-extraction';
import { createContact } from '@/app/actions/contacts';

interface ContactExtractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedContacts: ExtractedContact[];
  businessId: string;
  onContactsAdded: (count: number) => void;
}

export function ContactExtractionModal({
  isOpen,
  onClose,
  extractedContacts,
  businessId,
  onContactsAdded,
}: ContactExtractionModalProps) {
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(
    new Set(extractedContacts.map((_, i) => i))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleContact = (index: number) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedContacts(newSelected);
  };

  const toggleAll = () => {
    if (selectedContacts.size === extractedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(extractedContacts.map((_, i) => i)));
    }
  };

  const handleAddContacts = async () => {
    setSaving(true);
    setError(null);
    let addedCount = 0;
    const errors: string[] = [];

    for (const index of selectedContacts) {
      const contact = extractedContacts[index];

      if (!contact.name && !contact.email) {
        continue; // Skip contacts without name or email
      }

      try {
        const result = await createContact({
          business_id: businessId,
          name: contact.name || 'Unknown',
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          role: contact.role || undefined,
        });

        if ('error' in result) {
          errors.push(`${contact.name || contact.email}: ${result.error}`);
        } else {
          addedCount++;
        }
      } catch (err) {
        errors.push(`${contact.name || contact.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setSaving(false);

    if (errors.length > 0) {
      setError(`Added ${addedCount} contacts. Errors: ${errors.join(', ')}`);
      // Still notify about successful adds
      if (addedCount > 0) {
        onContactsAdded(addedCount);
      }
    } else {
      onContactsAdded(addedCount);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Extracted Contacts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select which contacts you want to add to this business. Uncheck any old or incorrect contacts.
          </p>

          {error && (
            <div className="bg-red-50 border-2 border-red-300 p-3 rounded">
              <p className="text-sm text-red-900">{error}</p>
            </div>
          )}

          <div className="border-2 border-gray-200 rounded">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="p-3 text-left">
                    <Checkbox
                      checked={selectedContacts.size === extractedContacts.length}
                      onCheckedChange={toggleAll}
                      aria-label="Select all contacts"
                    />
                  </th>
                  <th className="p-3 text-left font-semibold text-sm">Name</th>
                  <th className="p-3 text-left font-semibold text-sm">Role</th>
                  <th className="p-3 text-left font-semibold text-sm">Email</th>
                  <th className="p-3 text-left font-semibold text-sm">Phone</th>
                </tr>
              </thead>
              <tbody>
                {extractedContacts.map((contact, index) => (
                  <tr
                    key={index}
                    className={`border-b border-gray-200 ${selectedContacts.has(index) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedContacts.has(index)}
                        onCheckedChange={() => toggleContact(index)}
                        aria-label={`Select ${contact.name || contact.email}`}
                      />
                    </td>
                    <td className="p-3 text-sm">
                      {contact.name || <span className="text-gray-400 italic">No name</span>}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {contact.role || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {contact.email || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {contact.phone || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t-2 border-gray-200">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={saving}
              className="px-4 py-2"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddContacts}
              disabled={saving || selectedContacts.size === 0}
              className="px-4 py-2"
            >
              {saving
                ? 'Adding...'
                : `Add ${selectedContacts.size} Contact${selectedContacts.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
