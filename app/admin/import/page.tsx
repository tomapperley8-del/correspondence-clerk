'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { importMastersheet } from '@/app/actions/import-mastersheet'

interface ImportReport {
  businessesCreated: number
  businessesUpdated: number
  businessesMerged: number
  contactsCreated: number
  errors: string[]
  warnings: string[]
  duplicatesFound: { name: string; types: string[] }[]
}

export default function ImportPage() {
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setImporting(true)
    setError(null)
    setReport(null)

    const result = await importMastersheet()

    if ('error' in result) {
      setError(result.error)
    } else {
      setReport(result.data)
    }

    setImporting(false)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 hover:underline text-sm mb-2 inline-block"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Mastersheet Import
        </h1>
      </div>

      {/* Import Instructions */}
      <div className="bg-blue-50 border-2 border-blue-600 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-3">Before You Import</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
          <li>
            Ensure <code className="bg-blue-100 px-1">Mastersheet.csv</code> is
            in the project root directory
          </li>
          <li>
            The import is <strong>idempotent</strong> - you can run it multiple
            times safely
          </li>
          <li>
            Duplicate businesses (e.g., Club Card + Advertiser) will be merged
            into one record
          </li>
          <li>
            Contacts will be created from Primary Contact and Other Contacts
            columns
          </li>
          <li>Existing businesses and contacts will be updated, not duplicated</li>
        </ul>
      </div>

      {/* Import Button */}
      <div className="mb-6">
        <Button
          onClick={handleImport}
          disabled={importing}
          className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
        >
          {importing ? 'Importing...' : 'Import Mastersheet'}
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-2 border-red-600 p-6 mb-6">
          <h2 className="font-bold text-red-900 mb-2">Import Failed</h2>
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Report Display */}
      {report && (
        <div className="bg-white border-2 border-gray-300 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Import Report
          </h2>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="border-2 border-gray-300 p-4">
              <div className="text-2xl font-bold text-green-600">
                {report.businessesCreated}
              </div>
              <div className="text-sm text-gray-600">Businesses Created</div>
            </div>
            <div className="border-2 border-gray-300 p-4">
              <div className="text-2xl font-bold text-blue-600">
                {report.businessesUpdated}
              </div>
              <div className="text-sm text-gray-600">Businesses Updated</div>
            </div>
            <div className="border-2 border-gray-300 p-4">
              <div className="text-2xl font-bold text-purple-600">
                {report.businessesMerged}
              </div>
              <div className="text-sm text-gray-600">Duplicates Merged</div>
            </div>
            <div className="border-2 border-gray-300 p-4">
              <div className="text-2xl font-bold text-gray-900">
                {report.contactsCreated}
              </div>
              <div className="text-sm text-gray-600">Contacts Created</div>
            </div>
          </div>

          {/* Duplicates Found */}
          {report.duplicatesFound.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold text-gray-900 mb-2">
                Duplicates Merged ({report.duplicatesFound.length})
              </h3>
              <div className="bg-gray-50 border-2 border-gray-300 p-4 max-h-64 overflow-y-auto">
                {report.duplicatesFound.map((dup, index) => (
                  <div
                    key={index}
                    className="text-sm text-gray-800 mb-2 border-b border-gray-300 pb-2 last:border-b-0"
                  >
                    <span className="font-semibold">{dup.name}</span>
                    <div className="text-xs text-gray-600 ml-4">
                      Types: {dup.types.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold text-yellow-900 mb-2">
                Warnings ({report.warnings.length})
              </h3>
              <div className="bg-yellow-50 border-2 border-yellow-600 p-4 max-h-64 overflow-y-auto">
                {report.warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="text-sm text-yellow-800 mb-1 border-b border-yellow-300 pb-1 last:border-b-0"
                  >
                    {warning}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {report.errors.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold text-red-900 mb-2">
                Errors ({report.errors.length})
              </h3>
              <div className="bg-red-50 border-2 border-red-600 p-4 max-h-64 overflow-y-auto">
                {report.errors.map((err, index) => (
                  <div
                    key={index}
                    className="text-sm text-red-800 mb-1 border-b border-red-300 pb-1 last:border-b-0"
                  >
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Message */}
          {report.errors.length === 0 && (
            <div className="bg-green-50 border-2 border-green-600 p-4">
              <p className="text-sm text-green-800 font-semibold">
                ✓ Import completed successfully with no errors
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
