'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportToGoogleDocs } from '@/app/actions/export-google-docs'

export function ExportToGoogleDocsButton({ businessId }: { businessId: string }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [docUrl, setDocUrl] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    setDocUrl(null)

    try {
      // Get formatted content from server
      const result = await exportToGoogleDocs(businessId)

      if ('error' in result) {
        setError(result.error)
        setExporting(false)
        return
      }

      const { businessName, content } = result.data

      // Create Google Doc using MCP
      // @ts-ignore - MCP tools are injected at runtime
      const createResult = await mcp__google_workspace__createDocument({
        title: `${businessName} - Correspondence`,
        initialContent: content
      })

      if (createResult && createResult.documentId) {
        const url = `https://docs.google.com/document/d/${createResult.documentId}/edit`
        setDocUrl(url)

        // Open in new tab
        window.open(url, '_blank')
      } else {
        setError('Failed to create Google Doc')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export failed'
      setError(errorMessage)
    }

    setExporting(false)
  }

  return (
    <div>
      <Button
        onClick={handleExport}
        disabled={exporting}
        className="bg-green-600 text-white hover:bg-green-700 px-6 py-3 font-semibold"
      >
        {exporting ? 'Exporting...' : 'Export to Google Docs'}
      </Button>

      {error && (
        <div className="mt-3 bg-red-50 border-2 border-red-600 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {docUrl && (
        <div className="mt-3 bg-green-50 border-2 border-green-600 p-3">
          <p className="text-sm text-green-900 font-semibold mb-2">
            ✓ Document created successfully!
          </p>
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Open in Google Docs →
          </a>
        </div>
      )}
    </div>
  )
}
