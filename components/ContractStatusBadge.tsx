'use client'

import { useMemo } from 'react'

interface ContractStatusBadgeProps {
  startDate: string
  endDate: string
}

export function ContractStatusBadge({ startDate, endDate }: ContractStatusBadgeProps) {
  const status = useMemo(() => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const today = new Date()

    const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const isExpired = today > end
    const isExpiringSoon = !isExpired && daysRemaining <= 90

    // Format dates in DD/MM/YYYY
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
