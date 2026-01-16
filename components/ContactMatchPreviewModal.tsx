'use client';

/**
 * Contact Match Preview Modal
 * Shows which emails matched to which contacts before saving
 * Per CLAUDE.md: Manual edits only, clear labels
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ContactMatchResult } from '@/lib/contact-matching';
import type { Contact } from '@/app/actions/contacts';
import type { FormattedEntry } from '@/lib/ai/types';

interface ContactMatchPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: FormattedEntry[];
  contacts: Contact[];
  initialMatches: ContactMatchResult[];
  defaultContactId: string;
  onConfirm: (matches: ContactMatchResult[]) => void;
}

export function ContactMatchPreviewModal({
  isOpen,
  onClose,
  entries,
  contacts,
  initialMatches,
  defaultContactId,
  onConfirm,
}: ContactMatchPreviewModalProps) {
  const [matches, setMatches] = useState<ContactMatchResult[]>(initialMatches);

  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);

  const handleContactChange = (index: number, contactId: string) => {
    const newMatches = [...matches];
    const contact = contacts.find(c => c.id === contactId);
    newMatches[index] = {
      ...newMatches[index],
      contactId: contactId || null,
      contactName: contact?.name || null,
      confidence: 'high', // User manually selected
    };
    setMatches(newMatches);
  };

  const handleConfirm = () => {
    onConfirm(matches);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Email Contacts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border-2 border-blue-300 p-4">
            <p className="text-sm text-blue-900">
              <strong>Multiple contacts detected!</strong> We've automatically matched each email to the person it's from or to.
              Review and adjust if needed before saving.
            </p>
          </div>

          <div className="space-y-4">
            {entries.map((entry, index) => {
              const match = matches[index];
              const defaultContact = contacts.find(c => c.id === defaultContactId);

              return (
                <div
                  key={index}
                  className="border-2 border-gray-200 p-4 bg-gray-50"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">
                        Email #{index + 1}
                      </p>
                      <p className="text-sm text-gray-700 mb-1">
                        <strong>Subject:</strong> {entry.subject_guess}
                      </p>
                      <p className="text-sm text-gray-700 mb-1">
                        <strong>Date:</strong>{' '}
                        {entry.entry_date_guess
                          ? new Date(entry.entry_date_guess).toLocaleDateString()
                          : 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Direction:</strong>{' '}
                        {entry.direction_guess === 'sent' ? 'Sent to them' : 'Received from them'}
                      </p>
                      {entry.extracted_names && (
                        <p className="text-xs text-gray-600 mt-2">
                          {entry.direction_guess === 'received'
                            ? `From: ${entry.extracted_names.sender || 'Unknown'}`
                            : `To: ${entry.extracted_names.recipient || 'Unknown'}`}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Assign to Contact:
                      </label>
                      <select
                        value={match.contactId || defaultContactId}
                        onChange={(e) => handleContactChange(index, e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-blue-600 text-sm"
                      >
                        {!match.contactId && (
                          <option value={defaultContactId}>
                            {defaultContact?.name} (Default)
                          </option>
                        )}
                        {contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name}
                            {match.contactId === contact.id && match.matchedFrom
                              ? ` (Auto-matched from "${match.matchedFrom}")`
                              : ''}
                          </option>
                        ))}
                      </select>
                      {match.contactId && match.matchedFrom && (
                        <p className="text-xs text-green-700 mt-1">
                          ✓ Auto-matched from "{match.matchedFrom}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <p className="text-xs text-gray-600 font-mono whitespace-pre-wrap line-clamp-3">
                      {entry.formatted_text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t-2 border-gray-200">
            <Button
              onClick={onClose}
              variant="outline"
              className="px-4 py-2"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2 font-semibold"
            >
              Save {entries.length} Email{entries.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
