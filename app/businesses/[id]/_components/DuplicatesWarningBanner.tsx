'use client'

import React from 'react'
import { formatDateGB } from '@/lib/utils'

type DuplicateEntry = {
  id: string
  content_hash: string | null
  subject: string | null
  entry_date: string | null
  contact: { name: string } | null
}

type DuplicateGroup = {
  hash: string
  entries: DuplicateEntry[]
}

interface DuplicatesWarningBannerProps {
  duplicates: DuplicateGroup[]
  selectedDuplicateHashes: Set<string>
  isBulkOperationRunning: boolean
  isBulkDeleting: boolean
  isBulkDismissing: boolean
  selectedCount: number
  dismissableSelectedCount: number
  dismissingDuplicate: string | null
  deletingDuplicate: string | null
  onToggleHash: (hash: string) => void
  onToggleSelectAll: () => void
  onBulkDelete: () => void
  onBulkDismiss: () => void
  onDeleteDuplicate: (entryId: string, hash: string) => Promise<void>
  onDismissDuplicate: (id1: string, id2: string, hash: string) => Promise<void>
  businessId: string
}

export const DuplicatesWarningBanner = React.memo(function DuplicatesWarningBanner({
  duplicates,
  selectedDuplicateHashes,
  isBulkOperationRunning,
  isBulkDeleting,
  isBulkDismissing,
  selectedCount,
  dismissableSelectedCount,
  dismissingDuplicate,
  deletingDuplicate,
  onToggleHash,
  onToggleSelectAll,
  onBulkDelete,
  onBulkDismiss,
  onDeleteDuplicate,
  onDismissDuplicate,
}: DuplicatesWarningBannerProps) {
  return (
    <div className="bg-orange-50 border-2 border-orange-600 p-4 mb-6">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={selectedDuplicateHashes.size === duplicates.length && duplicates.length > 0}
              onChange={onToggleSelectAll}
              disabled={isBulkOperationRunning}
              className="mr-2 w-4 h-4"
            />
            <span className="font-semibold text-orange-900">
              {duplicates.length} Potential Duplicate{duplicates.length !== 1 ? 's' : ''} Found
            </span>
          </label>
          {selectedCount > 0 && (
            <span className="text-xs text-orange-700">
              ({selectedCount} selected)
            </span>
          )}
        </div>
        {selectedCount > 0 && (
          <div className="flex gap-2">
            <button
              onClick={onBulkDelete}
              disabled={isBulkOperationRunning}
              className="px-3 py-1 text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-semibold"
            >
              {isBulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Newer Entr${selectedCount === 1 ? 'y' : 'ies'}`}
            </button>
            {dismissableSelectedCount > 0 && (
              <button
                onClick={onBulkDismiss}
                disabled={isBulkOperationRunning}
                className="px-3 py-1 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                {isBulkDismissing ? 'Dismissing...' : `Dismiss ${dismissableSelectedCount} as Not Duplicate${dismissableSelectedCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}
      </div>
      {duplicates.map((dup) => (
        <div key={dup.hash} className="border-t border-orange-300 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selectedDuplicateHashes.has(dup.hash)}
              onChange={() => onToggleHash(dup.hash)}
              disabled={isBulkOperationRunning}
              className="mt-1 w-4 h-4 shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm text-orange-800 mb-2">
                <strong>{dup.entries.length} entries</strong> with identical content:
              </p>
              <ul className="text-sm text-orange-700 mb-2 space-y-1">
                {dup.entries.map(entry => (
                  <li key={entry.id}>
                    {entry.subject || 'No subject'} ({entry.entry_date ? formatDateGB(entry.entry_date) : 'No date'}) - {entry.contact?.name || 'Unknown contact'}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={() => onDeleteDuplicate(dup.entries[dup.entries.length - 1].id, dup.hash)}
                  disabled={deletingDuplicate === dup.hash || dismissingDuplicate === dup.hash || isBulkOperationRunning}
                  className="px-3 py-1 text-xs bg-red-100 text-red-900 hover:bg-red-200 disabled:opacity-50"
                >
                  {deletingDuplicate === dup.hash ? 'Deleting...' : 'Delete Newer Entry'}
                </button>
                {dup.entries.length === 2 && (
                  <button
                    onClick={() => onDismissDuplicate(dup.entries[0].id, dup.entries[1].id, dup.hash)}
                    disabled={deletingDuplicate === dup.hash || dismissingDuplicate === dup.hash || isBulkOperationRunning}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {dismissingDuplicate === dup.hash ? 'Dismissing...' : 'Not a Duplicate'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
})
