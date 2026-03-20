'use client'

import { useState, useEffect } from 'react'
import { ShareButton } from './ShareButton'

interface ReferralData {
  code: string
  url: string
  stats: {
    total_referrals: number
    signed_up: number
    converted: number
    pending: number
    rewards_earned: number
  }
}

export function ReferralBanner() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetchReferralData()
  }, [])

  const fetchReferralData = async () => {
    try {
      const response = await fetch('/api/referrals/create')
      if (!response.ok) throw new Error('Failed to load referral data')
      const json = await response.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referral data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="border border-gray-200 bg-gray-50 p-4 mb-6">
        <div className="animate-pulse h-4 bg-gray-200 w-48"></div>
      </div>
    )
  }

  if (error || !data) {
    return null // Don't show anything if there's an error
  }

  return (
    <div className="border border-blue-200 bg-blue-50 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-blue-900">
            Refer a Friend - Get 1 Month Free
          </h3>
          <p className="text-sm text-blue-700 mt-1">
            Share your unique link. When they subscribe, you both get a free month.
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {expanded ? 'Hide' : 'Show Details'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-blue-200">
          {/* Referral Link */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Referral Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={data.url}
                className="flex-1 px-3 py-2 border border-gray-300 bg-white text-sm"
              />
              <ShareButton url={data.url} />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-white border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">
                {data.stats.total_referrals}
              </div>
              <div className="text-xs text-gray-500">Total Referrals</div>
            </div>
            <div className="text-center p-3 bg-white border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">
                {data.stats.signed_up}
              </div>
              <div className="text-xs text-gray-500">Signed Up</div>
            </div>
            <div className="text-center p-3 bg-white border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">
                {data.stats.converted}
              </div>
              <div className="text-xs text-gray-500">Converted</div>
            </div>
            <div className="text-center p-3 bg-white border border-gray-200">
              <div className="text-2xl font-bold text-green-600">
                {data.stats.rewards_earned}
              </div>
              <div className="text-xs text-gray-500">Months Earned</div>
            </div>
          </div>

          {/* How it works */}
          <div className="mt-4 text-sm text-gray-600">
            <strong>How it works:</strong>
            <ol className="list-decimal list-inside mt-1 space-y-1">
              <li>Share your unique link with colleagues and friends</li>
              <li>They sign up and start a free trial</li>
              <li>When they subscribe, you both get 1 month free</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
