'use client'

import { useState, useEffect } from 'react'
import { generateCorrespondenceSummary, type AISummaryResult } from '@/app/actions/ai-summary'
import { type Business } from '@/app/actions/businesses'

export function CorrespondenceSummary({
  businessId,
  business,
  refreshTrigger,
}: {
  businessId: string
  business: Business
  refreshTrigger?: number
}) {
  const [summary, setSummary] = useState<AISummaryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSummary() {
      setLoading(true)
      setError(null)

      const result = await generateCorrespondenceSummary(businessId)

      if ('error' in result) {
        setError(result.error || 'Failed to generate summary')
      } else {
        setSummary(result.data)
      }

      setLoading(false)
    }

    loadSummary()
  }, [businessId, refreshTrigger])

  if (loading) {
    return (
      <div className="bg-blue-50 border-2 border-blue-300 p-4 mb-6">
        <p className="text-sm text-blue-900 italic">
          Generating AI summary...
        </p>
      </div>
    )
  }

  if (error) {
    return null // Silently fail - don't show errors to user
  }

  const hasSummary =
    summary?.summary && summary.summary !== 'No correspondence in the last 12 months.'

  if (!hasSummary) {
    return null
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-300 p-4 mb-6">
      <h3 className="text-sm font-bold text-blue-900 mb-3 uppercase">AI Summary (Last 12 Months)</h3>

      <div>
        <h4 className="text-xs font-bold text-blue-800 mb-1">Recent Activity:</h4>
        <p className="text-sm text-blue-900">{summary.summary}</p>
      </div>
    </div>
  )
}
