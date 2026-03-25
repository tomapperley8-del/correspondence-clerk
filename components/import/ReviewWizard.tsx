'use client'

import { useState, useCallback } from 'react'
import type { ScanBusiness, ScanContact, ScanResult } from '@/lib/email-import/domain-grouper'

interface ReviewWizardProps {
  scanResult: ScanResult
  scanId: string
  provider: 'gmail' | 'outlook'
  onImportComplete: (imported: number, skipped: number) => void
}

export function ReviewWizard({ scanResult, scanId, provider, onImportComplete }: ReviewWizardProps) {
  const [businesses, setBusinesses] = useState<ScanBusiness[]>(scanResult.businesses)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ imported: number; skipped: number; total: number } | null>(null)
  const [expandedBusinessIds, setExpandedBusinessIds] = useState<Set<string>>(
    new Set(businesses.slice(0, 5).map((b) => b.id))
  )

  const totalSelected = businesses
    .filter((b) => !b.excluded)
    .reduce((s, b) => s + b.contacts.filter((c) => !c.excluded).reduce((cs, c) => cs + c.emailIds.length, 0), 0)

  const totalBusinessesSelected = businesses.filter((b) => !b.excluded).length
  const totalContactsSelected = businesses
    .filter((b) => !b.excluded)
    .reduce((s, b) => s + b.contacts.filter((c) => !c.excluded).length, 0)

  const updateBusiness = useCallback((businessId: string, patch: Partial<ScanBusiness>) => {
    setBusinesses((prev) =>
      prev.map((b) => (b.id === businessId ? { ...b, ...patch } : b))
    )
  }, [])

  const updateContact = useCallback((businessId: string, contactId: string, patch: Partial<ScanContact>) => {
    setBusinesses((prev) =>
      prev.map((b) =>
        b.id === businessId
          ? { ...b, contacts: b.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c)) }
          : b
      )
    )
  }, [])

  const toggleExpand = (businessId: string) => {
    setExpandedBusinessIds((prev) => {
      const next = new Set(prev)
      if (next.has(businessId)) next.delete(businessId)
      else next.add(businessId)
      return next
    })
  }

  const handleStartImport = async () => {
    if (totalSelected === 0 || importing) return
    setImporting(true)
    setProgress({ imported: 0, skipped: 0, total: totalSelected })

    const executeUrl = `/api/import/${provider}/execute`
    let offset = 0
    let importedSoFar = 0
    let skippedSoFar = 0

    // Loop through chunks until done or error
    while (true) {
      const res = await fetch(executeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, businesses, offset, importedSoFar, skippedSoFar }),
      })

      if (!res.ok || !res.body) {
        setImporting(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let nextOffset: number | null = null
      let isDone = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if ('imported' in data) {
              importedSoFar = data.imported
              skippedSoFar = data.skipped
              setProgress({ imported: data.imported, skipped: data.skipped, total: data.total ?? totalSelected })
            }
            // chunk_done: more chunks remain
            if ('nextOffset' in data) {
              nextOffset = data.nextOffset
            }
            // done: all chunks complete (no total, no nextOffset)
            if (!('nextOffset' in data) && !('total' in data) && 'imported' in data) {
              isDone = true
              onImportComplete(data.imported, data.skipped)
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (isDone || nextOffset === null) break
      offset = nextOffset
    }

    setImporting(false)
  }

  if (importing && progress) {
    const pct = progress.total > 0 ? Math.round((progress.imported / progress.total) * 100) : 0
    return (
      <div className="max-w-lg mx-auto mt-8 text-center">
        <h2 className="font-[Lora,serif] text-xl font-semibold text-brand-dark mb-6">Importing emails…</h2>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
          <div
            className="h-3 bg-brand-navy rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-gray-500">
          {progress.imported} imported · {progress.skipped} skipped · {progress.total} total
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-brand-dark">{totalBusinessesSelected}</span> businesses ·{' '}
          <span className="font-medium text-brand-dark">{totalContactsSelected}</span> contacts ·{' '}
          <span className="font-medium text-brand-dark">{totalSelected}</span> emails to import
        </p>
        <button
          onClick={handleStartImport}
          disabled={totalSelected === 0}
          className="px-5 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Start Import
        </button>
      </div>

      {/* Business list */}
      <div className="space-y-2">
        {businesses.map((business) => {
          const isExpanded = expandedBusinessIds.has(business.id)
          const emailCount = business.contacts
            .filter((c) => !c.excluded)
            .reduce((s, c) => s + c.emailIds.length, 0)
          const isExisting = !!business.existingBusinessId
          const hasNewContacts = business.contacts.some((c) => !c.existingContactId && !c.excluded)

          return (
            <div
              key={business.id}
              className={`border rounded transition-colors ${
                business.excluded ? 'border-gray-200 opacity-50' : 'border-gray-300 bg-white'
              }`}
            >
              {/* Business row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleExpand(business.id)}
                  className="text-gray-400 hover:text-gray-600 text-xs w-4 flex-shrink-0"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>

                {/* Business name */}
                <input
                  type="text"
                  value={business.name}
                  onChange={(e) => updateBusiness(business.id, { name: e.target.value })}
                  disabled={business.excluded}
                  className="flex-1 min-w-0 text-sm font-medium text-brand-dark bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-navy outline-none px-1 py-0.5 transition-colors"
                  placeholder="Business name"
                />

                {/* Badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isExisting ? (
                    <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">
                      Existing
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                      New
                    </span>
                  )}
                  {hasNewContacts && !isExisting && (
                    <span className="text-xs text-gray-400">+contacts</span>
                  )}
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {emailCount} email{emailCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => updateBusiness(business.id, { excluded: !business.excluded })}
                    className={`text-xs px-2 py-0.5 border rounded transition-colors ${
                      business.excluded
                        ? 'border-gray-300 text-gray-400 hover:border-brand-navy hover:text-brand-navy'
                        : 'border-red-200 text-red-500 hover:bg-red-50'
                    }`}
                  >
                    {business.excluded ? 'Include' : 'Exclude'}
                  </button>
                </div>
              </div>

              {/* Contact list */}
              {isExpanded && !business.excluded && (
                <div className="border-t border-gray-100">
                  {business.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className={`flex items-center gap-3 px-4 py-2.5 pl-11 border-b border-gray-50 last:border-b-0 ${
                        contact.excluded ? 'opacity-40' : ''
                      }`}
                    >
                      {/* Contact name */}
                      <input
                        type="text"
                        value={contact.name}
                        onChange={(e) => updateContact(business.id, contact.id, { name: e.target.value })}
                        disabled={contact.excluded}
                        className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-navy outline-none px-1 py-0.5 transition-colors"
                        placeholder="Contact name"
                      />

                      {/* Email address */}
                      <span className="text-xs text-gray-400 flex-shrink-0 max-w-[180px] truncate" title={contact.email}>
                        {contact.email}
                      </span>

                      {/* Badges */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {contact.existingContactId ? (
                          <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded">
                            Existing
                          </span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded">
                            New
                          </span>
                        )}
                        <span className="text-xs text-gray-400 w-14 text-right">
                          {contact.emailIds.length} email{contact.emailIds.length !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => updateContact(business.id, contact.id, { excluded: !contact.excluded })}
                          className={`text-xs px-2 py-0.5 border rounded transition-colors ${
                            contact.excluded
                              ? 'border-gray-300 text-gray-400 hover:border-brand-navy hover:text-brand-navy'
                              : 'border-red-200 text-red-500 hover:bg-red-50'
                          }`}
                        >
                          {contact.excluded ? 'Include' : 'Exclude'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {businesses.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No emails found in this date range.
        </div>
      )}

      {/* Bottom CTA */}
      {businesses.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleStartImport}
            disabled={totalSelected === 0}
            className="px-6 py-2.5 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {totalSelected} email{totalSelected !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
