'use client'

import { useMemo } from 'react'

interface ContractStatusBadgeProps {
  startDate: string
  endDate: string
  isCurrent?: boolean
}

// Parse YYYY-MM-DD (ignoring any time component) into a local-midnight Date so
// comparisons don't slip by a day in timezones behind UTC.
function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map((n) => parseInt(n, 10))
  return new Date(y, (m || 1) - 1, d || 1)
}

export function ContractStatusBadge({ startDate, endDate, isCurrent = true }: ContractStatusBadgeProps) {
  const status = useMemo(() => {
    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const msPerDay = 1000 * 60 * 60 * 24
    const daysRemaining = Math.round((end.getTime() - today.getTime()) / msPerDay)
    // The contract is valid through the whole of its end date (inclusive).
    const isExpired = daysRemaining < 0
    const isExpiringSoon = !isExpired && daysRemaining <= 90

    const formatDate = (d: Date) => d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    let badgeText: string
    let colorScheme: 'green' | 'yellow' | 'red'

    if (isExpired) {
      const daysOverdue = Math.abs(daysRemaining)
      badgeText = `Expired ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago`
      colorScheme = 'red'
    } else if (daysRemaining === 0) {
      badgeText = 'Ends today'
      colorScheme = 'yellow'
    } else if (isExpiringSoon) {
      badgeText = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
      colorScheme = 'yellow'
    } else {
      badgeText = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
      colorScheme = 'green'
    }

    return {
      startFormatted: formatDate(start),
      endFormatted: formatDate(end),
      badgeText,
      colorScheme,
    }
  }, [startDate, endDate])

  const colors = {
    green: {
      bgLight: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-600',
    },
    yellow: {
      bgLight: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-600',
    },
    red: {
      bgLight: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-600',
    },
  }

  const scheme = colors[status.colorScheme]

  if (!isCurrent) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-900">
          {status.startFormatted} &rarr; {status.endFormatted}
        </p>
        <div className="inline-block px-3 py-1 border-2 border-gray-300 bg-gray-100">
          <span className="text-sm font-semibold text-gray-500">Historical</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-900">
        {status.startFormatted} &rarr; {status.endFormatted}
      </p>
      <div className={`inline-block px-3 py-1 border-2 ${scheme.border} ${scheme.bgLight}`}>
        <span className={`text-sm font-semibold ${scheme.text}`}>
          {status.badgeText}
        </span>
      </div>
    </div>
  )
}
