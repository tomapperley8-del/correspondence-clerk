'use client'

import { useState, useEffect, useRef } from 'react'
import { generateCorrespondenceSummary, type AISummaryResult } from '@/app/actions/ai-summary'

export function CorrespondenceSummary({
  businessId,
  refreshTrigger,
}: {
  businessId: string
  refreshTrigger?: number
}) {
  const [summary, setSummary] = useState<AISummaryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const prevTrigger = useRef(refreshTrigger)

  const generate = async () => {
    setLoading(true)
    const result = await generateCorrespondenceSummary(businessId)
    if (!('error' in result)) setSummary(result.data)
    setGenerated(true)
    setLoading(false)
  }

  // Re-generate when refreshTrigger changes (e.g. after contract update), but only if already shown
  useEffect(() => {
    if (prevTrigger.current !== refreshTrigger) {
      prevTrigger.current = refreshTrigger
      if (generated) generate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  const hasSummary = summary?.summary && summary.summary !== 'No correspondence in the last 12 months.'

  if (!generated) {
    return (
      <div className="border border-black/[0.06] bg-gray-50 p-3 mb-6 flex items-center justify-between">
        <span className="text-sm text-gray-600">AI summary of last 12 months</span>
        <button
          onClick={generate}
          className="text-sm text-brand-navy hover:underline font-semibold"
        >
          Generate
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 p-4 mb-6">
        <p className="text-sm text-blue-900 italic">Generating AI summary...</p>
      </div>
    )
  }

  if (!hasSummary) return null

  return (
    <div className="bg-blue-50 border border-blue-200 p-4 mb-6">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-bold text-blue-900 uppercase">AI Summary (Last 12 Months)</h3>
        <button
          onClick={generate}
          className="text-xs text-blue-700 hover:underline"
        >
          Regenerate
        </button>
      </div>
      <p className="text-sm text-blue-900">{summary!.summary}</p>
    </div>
  )
}
