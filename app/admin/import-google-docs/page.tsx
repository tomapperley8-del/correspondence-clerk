'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  importGoogleDocsData,
  listGoogleDocsFolder,
  readGoogleDocsBatch,
} from '@/app/actions/import-google-docs'
import Link from 'next/link'

const FOLDER_ID = '1Lmd4lRiynEUkxkspyrQmUqsNsXCcUJMD'

export default function ImportGoogleDocsPage() {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [report, setReport] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setImporting(true)
    setProgress('Fetching documents from Google Drive...')
    setError(null)
    setReport(null)

    try {
      // List documents in the folder
      const folderResult = await listGoogleDocsFolder(FOLDER_ID)

      if ('error' in folderResult) {
        setError(folderResult.error)
        setImporting(false)
        return
      }

      const documents = folderResult.data

      setProgress(`Found ${documents.length} documents. Reading content...`)

      // Read all documents in parallel batches
      const documentsData = []
      const BATCH_SIZE = 5

      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE)
        const batchStart = i + 1
        const batchEnd = Math.min(i + BATCH_SIZE, documents.length)

        setProgress(
          `Reading documents ${batchStart}-${batchEnd}/${documents.length}...`
        )

        const batchResult = await readGoogleDocsBatch(batch)

        if ('error' in batchResult) {
          console.error(`Failed to read batch ${batchStart}-${batchEnd}:`, batchResult.error)
          continue
        }

        documentsData.push(...batchResult.data)
      }

      setProgress(`Read ${documentsData.length} documents. Processing and importing...`)

      // Import the data
      const result = await importGoogleDocsData(documentsData)

      if ('error' in result) {
        setError(result.error || 'Import failed')
      } else {
        setReport(result.data)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Import failed'
      setError(errorMessage)
    }

    setImporting(false)
    setProgress('')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/dashboard"
        className="text-blue-600 hover:text-blue-800 hover:underline text-sm mb-4 inline-block"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Import from Google Docs
      </h1>

      <div className="bg-white border-2 border-gray-300 p-6 mb-6">
        <p className="text-sm text-gray-700 mb-4">
          This will import contacts and correspondence from your Google Drive folder
          containing merged contact and correspondence documents.
        </p>

        <p className="text-sm text-gray-700 mb-4">
          <strong>What will be imported:</strong>
        </p>
        <ul className="text-sm text-gray-700 mb-6 list-disc list-inside space-y-1">
          <li>Contact information (name, email, phone, role)</li>
          <li>Historical correspondence entries with dates</li>
          <li>Business will be matched by name to existing businesses</li>
        </ul>

        <p className="text-sm text-yellow-800 bg-yellow-50 border-2 border-yellow-600 p-3 mb-6">
          <strong>Note:</strong> This may take several minutes to process all documents.
          Make sure you have run the Mastersheet import first so all businesses exist.
        </p>

        <Button
          onClick={handleImport}
          disabled={importing}
          className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
        >
          {importing ? 'Importing...' : 'Start Import'}
        </Button>
      </div>

      {progress && (
        <div className="bg-blue-50 border-2 border-blue-600 p-4 mb-6">
          <p className="text-sm text-blue-900">{progress}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-600 p-4 mb-6">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {report && (
        <div className="bg-green-50 border-2 border-green-600 p-6">
          <h2 className="text-lg font-bold text-green-900 mb-4">
            Import Complete!
          </h2>

          <div className="space-y-2 text-sm text-green-900 mb-4">
            <p>
              <strong>Documents Processed:</strong> {report.documentsProcessed}
            </p>
            <p>
              <strong>Businesses Matched:</strong> {report.businessesMatched}
            </p>
            <p>
              <strong>Contacts Created:</strong> {report.contactsCreated}
            </p>
            <p>
              <strong>Correspondence Entries Created:</strong>{' '}
              {report.correspondenceCreated}
            </p>
          </div>

          {report.businessesNotFound.length > 0 && (
            <div className="mt-4 pt-4 border-t-2 border-green-600">
              <h3 className="text-sm font-bold text-yellow-800 mb-2">
                Businesses Not Found ({report.businessesNotFound.length})
              </h3>
              <ul className="text-xs text-yellow-800 list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
                {report.businessesNotFound.map((name: string, i: number) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {report.warnings.length > 0 && (
            <div className="mt-4 pt-4 border-t-2 border-green-600">
              <h3 className="text-sm font-bold text-yellow-800 mb-2">
                Warnings ({report.warnings.length})
              </h3>
              <ul className="text-xs text-yellow-800 list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
                {report.warnings.slice(0, 20).map((warning: string, i: number) => (
                  <li key={i}>{warning}</li>
                ))}
                {report.warnings.length > 20 && (
                  <li className="font-semibold">
                    ... and {report.warnings.length - 20} more warnings
                  </li>
                )}
              </ul>
            </div>
          )}

          {report.errors.length > 0 && (
            <div className="mt-4 pt-4 border-t-2 border-green-600">
              <h3 className="text-sm font-bold text-red-800 mb-2">
                Errors ({report.errors.length})
              </h3>
              <ul className="text-xs text-red-800 list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
                {report.errors.map((error: string, i: number) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
