'use client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ThreadDetectionResult } from '../_hooks/useThreadDetection'
import type { ExtractedContact } from '@/lib/contact-extraction'
import type { Business } from '@/app/actions/businesses'

type Props = {
  rawText: string
  draftStatus: 'saved' | 'restored' | null
  error?: string
  threadDetection: ThreadDetectionResult | null
  shouldSplit: boolean
  formattingError: string | null
  extractedContacts: ExtractedContact[]
  contactsAdded: number
  selectedBusinessId: string | null
  businesses: Business[]
  isLoading: boolean
  onChange: (v: string) => void
  onShouldSplitChange: (v: boolean) => void
  onShowContactModal: () => void
  onSaveUnformatted: () => void
}

export function TextInputSection({
  rawText, draftStatus, error,
  threadDetection, shouldSplit,
  formattingError, extractedContacts, contactsAdded,
  selectedBusinessId, businesses, isLoading,
  onChange, onShouldSplitChange, onShowContactModal, onSaveUnformatted,
}: Props) {
  const businessName = businesses.find((b) => b.id === selectedBusinessId)?.name

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label htmlFor="rawText" className="font-semibold">
          Entry Text <span className="text-red-600">*</span>
        </Label>
        {draftStatus && (
          <span className="text-xs text-gray-400 italic">
            {draftStatus === 'restored' ? 'Draft restored' : 'Draft saved'}
          </span>
        )}
      </div>
      <textarea
        id="rawText"
        value={rawText}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-h-[300px] px-3 py-2 border ${
          error ? 'border-red-400' : 'border-gray-200'
        } focus:outline-none focus:border-brand-navy font-mono text-sm`}
        placeholder="Paste email or type call/meeting notes here..."
      />
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}

      {extractedContacts.length > 0 && selectedBusinessId && contactsAdded === 0 && (
        <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200">
          <p className="text-sm text-yellow-900 mb-2">
            <strong>Detected {extractedContacts.length} contact{extractedContacts.length !== 1 ? 's' : ''} in pasted text</strong>
          </p>
          <Button
            type="button"
            onClick={onShowContactModal}
            className="bg-yellow-600 text-white hover:bg-yellow-700 px-4 py-2 text-sm font-semibold"
          >
            Review & Add Contacts
          </Button>
        </div>
      )}

      {contactsAdded > 0 && selectedBusinessId && (
        <div className="mt-3 p-4 bg-green-50 border border-green-200">
          <p className="text-sm text-green-900">
            ✓ Added {contactsAdded} contact{contactsAdded !== 1 ? 's' : ''} to {businessName}
          </p>
        </div>
      )}

      {threadDetection?.looksLikeThread && (
        <div className="mt-3 p-4 bg-brand-navy/[0.04] border border-brand-navy/30">
          <div className="flex-1">
            <p className="font-semibold text-brand-dark mb-1">
              Email thread detected ({threadDetection.confidence} confidence)
            </p>
            <p className="text-sm text-brand-navy mb-2">
              This looks like it might contain multiple emails. Split into separate entries?
            </p>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={shouldSplit}
                onChange={(e) => onShouldSplitChange(e.target.checked)}
                className="mr-2 w-4 h-4"
              />
              <span className="text-sm font-semibold">Split into individual emails</span>
            </label>
          </div>
        </div>
      )}

      {formattingError && (
        <div className="mt-3 p-4 bg-red-50 border border-red-300">
          <h3 className="font-semibold text-red-900 mb-2">AI Formatting Failed</h3>
          <p className="text-sm text-red-800 mb-3">{formattingError}</p>
          <p className="text-sm text-red-700 mb-3">
            <strong>What this means:</strong> Claude returned a response that couldn&apos;t be processed.
            This sometimes happens with very long or complex text. Your original text is preserved and you can still save it.
          </p>
          <p className="text-sm text-red-700 mb-3"><strong>Options:</strong></p>
          <ul className="list-disc list-inside text-sm text-red-700 mb-4 space-y-1">
            <li>Click &quot;Save Without Formatting&quot; to save the original text as-is</li>
            <li>Try splitting the text into smaller entries</li>
            <li>Try again later — AI formatting issues are often temporary</li>
          </ul>
          <Button
            type="button"
            onClick={onSaveUnformatted}
            disabled={isLoading}
            className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 font-semibold"
          >
            {isLoading ? 'Saving...' : 'Save Without Formatting'}
          </Button>
        </div>
      )}
    </div>
  )
}
