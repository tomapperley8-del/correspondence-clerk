'use client'

import { useState, useEffect } from 'react'
import { generateCorrespondenceSummary } from '@/app/actions/ai-summary'

export function CorrespondenceSummary({ businessId }: { businessId: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSummary() {
      setLoading(true)
      setError(null)

      const result = await generateCorrespondenceSummary(businessId)

      if ('error' in result) {
        setError(result.error)
      } else {
        setSummary(result.data)
      }

      setLoading(false)
    }

    loadSummary()
  }, [businessId])

  if (loading) {
    return (
      <div className="bg-blue-50 border-2 border-blue-300 p-4 mb-6">
        <p className="text-sm text-blue-900 italic">
          Generating correspondence summary...
        </p>
      </div>
    )
  }

  if (error) {
    return null // Silently fail - don't show errors to user
  }

  if (!summary || summary === 'No correspondence in the last 12 months.') {
    return null // Don't show if no summary available
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-300 p-4 mb-6">
      <h3 className="text-sm font-bold text-blue-900 mb-2">
        Summary (Last 12 Months)
      </h3>
      <p className="text-sm text-blue-900">{summary}</p>
    </div>
  )
}
