'use client'

import { useMemo } from 'react'

interface ContractTimelineProps {
  startDate: string
  endDate: string
}

export function ContractTimeline({ startDate, endDate }: ContractTimelineProps) {
  const timeline = useMemo(() => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const today = new Date()

    // Calculate total contract duration in days
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    // Calculate days elapsed
    const elapsedDays = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    // Calculate percentage complete (clamped 0-100)
    const percentComplete = Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100))

    // Determine status
    const isExpired = today > end
    const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const isExpiringSoon = !isExpired && daysRemaining <= 90

    // Determine color scheme
    let colorScheme: 'green' | 'yellow' | 'red'
    if (isExpired) {
      colorScheme = 'red'
    } else if (isExpiringSoon) {
      colorScheme = 'yellow'
    } else {
      colorScheme = 'green'
    }

    // Format status text
    let statusText: string
    if (isExpired) {
      const daysOverdue = Math.abs(daysRemaining)
      statusText = `Expired ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago`
    } else {
      statusText = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
    }

    return {
      percentComplete,
      colorScheme,
      statusText,
      start,
      end,
      today,
      isExpired,
      isExpiringSoon,
    }
  }, [startDate, endDate])

  const colors = {
    green: {
      bg: 'bg-green-500',
      bgLight: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-600',
    },
    yellow: {
      bg: 'bg-yellow-500',
      bgLight: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-600',
    },
    red: {
      bg: 'bg-red-500',
      bgLight: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-600',
    },
  }

  const scheme = colors[timeline.colorScheme]

  return (
    <div className="space-y-2">
      {/* Text Status with Color Coding */}
      <div className={`inline-block px-3 py-1 border-2 ${scheme.border} ${scheme.bgLight}`}>
        <span className={`font-semibold ${scheme.text}`}>
          {timeline.isExpired ? '⚠ ' : ''}
          {timeline.statusText}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        {/* Background bar */}
        <div className="h-6 bg-gray-200 border-2 border-gray-300 relative overflow-hidden">
          {/* Fill bar */}
          <div
            className={`h-full ${scheme.bg} transition-all duration-300`}
            style={{ width: `${timeline.percentComplete}%` }}
          />

          {/* Today marker */}
          {!timeline.isExpired && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-gray-900"
              style={{ left: `${timeline.percentComplete}%` }}
              title="Today"
            >
              <div className="absolute top-[-4px] left-[-3px] w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-900" />
            </div>
          )}
        </div>

        {/* Percentage label (inside bar) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-900 bg-white bg-opacity-75 px-2 py-0.5">
            {Math.round(timeline.percentComplete)}%
          </span>
        </div>
      </div>

      {/* Date Labels */}
      <div className="flex justify-between text-xs text-gray-600">
        <div>
          <span className="font-semibold">Start:</span>{' '}
          {timeline.start.toLocaleDateString('en-GB')}
        </div>
        <div>
          <span className="font-semibold">Today:</span>{' '}
          {timeline.today.toLocaleDateString('en-GB')}
        </div>
        <div>
          <span className="font-semibold">End:</span>{' '}
          {timeline.end.toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}
