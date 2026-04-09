'use client'
import { Button } from '@/components/ui/button'
import type { ImportedEmail } from '../_hooks/useEmailImport'

type Props = {
  emails: ImportedEmail[]
  selectedIndices: Set<number>
  onToggle: (i: number) => void
  onImport: (selected: ImportedEmail[]) => void
  onCancel: () => void
}

export function EmailSelectionDialog({ emails, selectedIndices, onToggle, onImport, onCancel }: Props) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Lora, serif' }}>
        Select Emails to Import
      </h1>
      <p className="text-gray-600 text-sm mb-6">
        {emails.length} emails found in this thread. Choose which to import.
      </p>

      <div className="space-y-3 mb-6">
        {emails.map((email, i) => {
          const checked = selectedIndices.has(i)
          const date = email.emailDate
            ? new Date(email.emailDate).toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })
            : ''
          return (
            <label
              key={i}
              className={`flex items-start gap-3 p-4 border cursor-pointer ${
                checked ? 'border-brand-navy bg-brand-navy/[0.03]' : 'border-gray-200 bg-white hover:border-gray-400'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(i)}
                className="mt-1 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{email.emailFrom || 'Unknown sender'}</div>
                {email.emailSubject && <div className="text-sm text-gray-700 mt-0.5">{email.emailSubject}</div>}
                <div className="text-xs text-gray-500 mt-0.5">{date}</div>
                {email.emailBody && (
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {email.emailBody.substring(0, 150)}{email.emailBody.length > 150 ? '…' : ''}
                  </div>
                )}
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => onImport(emails.filter((_, i) => selectedIndices.has(i)))}
          disabled={selectedIndices.size === 0}
          className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-2 font-semibold"
        >
          Import Selected ({selectedIndices.size})
        </Button>
        <Button
          onClick={onCancel}
          className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-2"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
