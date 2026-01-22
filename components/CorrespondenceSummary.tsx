'use client'

import { useState, useEffect } from 'react'
import { generateCorrespondenceSummary, type AISummaryResult } from '@/app/actions/ai-summary'
import { type Business } from '@/app/actions/businesses'
import { ContractTimeline } from './ContractTimeline'

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

  const hasCorrespondenceSummary =
    summary?.correspondence_summary && summary.correspondence_summary !== 'No correspondence in the last 12 months.'
  const hasContractStatus = summary?.contract_status

  // Don't show card if neither summary nor contract status exists
  if (!hasCorrespondenceSummary && !hasContractStatus) {
    return null
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-300 p-4 mb-6">
      <h3 className="text-sm font-bold text-blue-900 mb-3 uppercase">AI Summary (Last 12 Months)</h3>

      {/* Correspondence Summary */}
      {hasCorrespondenceSummary && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-blue-800 mb-1">Recent Activity:</h4>
          <p className="text-sm text-blue-900">{summary.correspondence_summary}</p>
        </div>
      )}

      {/* Contract Status Section */}
      {hasContractStatus && (
        <div className="mt-4 pt-4 border-t-2 border-blue-300">
          <h4 className="text-xs font-bold text-blue-800 mb-2">Contract Status:</h4>

          {/* Show timeline if contract dates exist */}
          {business.contract_start && business.contract_end && (
            <div className="mb-3">
              <ContractTimeline startDate={business.contract_start} endDate={business.contract_end} />
            </div>
          )}

          {/* AI contract analysis */}
          <p className="text-sm text-blue-900 mt-2">{summary.contract_status}</p>

          {/* Contract amount if available */}
          {business.contract_amount && (
            <p className="text-xs text-blue-800 mt-2">
              <span className="font-semibold">Contract Value:</span>{' '}
              £{business.contract_amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
