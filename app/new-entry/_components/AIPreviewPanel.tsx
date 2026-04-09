'use client'
import { Button } from '@/components/ui/button'
import type { AIFormatterResponse } from '@/lib/ai/types'

type Props = {
  previewData: AIFormatterResponse
  previewText: string
  isLoading: boolean
  onConfirm: () => void
  onEdit: () => void
  onSaveUnformatted: () => void
}

export function AIPreviewPanel({ previewData, previewText, isLoading, onConfirm, onEdit, onSaveUnformatted }: Props) {
  const data = previewData as unknown as Record<string, unknown>
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 shadow-[var(--shadow-lg)] p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Preview Formatted Entry</h2>
        <p className="text-sm text-gray-600 mb-4">
          Review the AI-formatted text below. You can save as-is, go back to edit, or retry formatting.
        </p>

        {typeof data.subject === 'string' && data.subject && (
          <div className="mb-3">
            <span className="text-sm font-semibold text-gray-700">Subject: </span>
            <span className="text-sm text-gray-900">{data.subject}</span>
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 p-4 mb-4 max-h-[50vh] overflow-y-auto">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
            {previewText || 'No formatted text available'}
          </pre>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-brand-navy text-white hover:bg-brand-navy-hover px-6 py-3 font-semibold"
          >
            {isLoading ? 'Saving...' : 'Save Entry'}
          </Button>
          <Button
            onClick={onEdit}
            disabled={isLoading}
            className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3"
          >
            Back to Edit
          </Button>
          <Button
            onClick={onSaveUnformatted}
            disabled={isLoading}
            className="bg-orange-100 text-orange-900 hover:bg-orange-200 px-6 py-3"
          >
            Save Without Formatting
          </Button>
        </div>
      </div>
    </div>
  )
}
