'use client'

import { useState, useEffect } from 'react'
import { detectActions } from '@/app/actions/ai-action-detection'
import { ActionSuggestion } from '@/lib/ai/types'

interface ActionSuggestionsProps {
  businessId: string
}

export function ActionSuggestions({ businessId }: ActionSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadSuggestions() {
      setLoading(true)

      const result = await detectActions(businessId)

      if ('error' in result) {
        // Silent failure - don't show errors
        setLoading(false)
        return
      }

      if (result.data && result.data.suggestions) {
        // Sort by priority and confidence
        const sortedSuggestions = [...result.data.suggestions].sort((a, b) => {
          // Priority order: high > medium > low
          const priorityOrder = { high: 3, medium: 2, low: 1 }
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]

          if (priorityDiff !== 0) {
            return priorityDiff
          }

          // If same priority, sort by confidence
          const confidenceOrder = { high: 3, medium: 2, low: 1 }
          return confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
        })

        setSuggestions(sortedSuggestions.slice(0, 3)) // Max 3 suggestions
      }

      setLoading(false)
    }

    loadSuggestions()
  }, [businessId])

  const handleSetAction = (entryId: string | null) => {
    if (!entryId) return

    const element = document.getElementById(`entry-${entryId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Flash highlight
      element.style.backgroundColor = '#fef3c7' // yellow-100
      setTimeout(() => {
        element.style.backgroundColor = ''
      }, 2000)
    }
  }

  const handleViewEntry = (entryId: string | null) => {
    if (!entryId) return

    const element = document.getElementById(`entry-${entryId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleDismiss = (suggestion: ActionSuggestion) => {
    // Create a unique key for this suggestion
    const key = `${suggestion.action_type}-${suggestion.triggering_entry_id}`
    setDismissed(prev => new Set([...prev, key]))
  }

  const formatActionType = (actionType: string): string => {
    switch (actionType) {
      case 'follow_up':
        return 'Follow-up'
      case 'waiting_on_them':
        return 'Waiting on Them'
      case 'invoice':
        return 'Invoice'
      case 'renewal':
        return 'Renewal'
      case 'prospect':
        return 'Prospect'
      default:
        return actionType
    }
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="bg-yellow-50 border-2 border-yellow-300 p-4 mb-6">
        <p className="text-sm text-yellow-900 italic">
          Analyzing correspondence for pending actions...
        </p>
      </div>
    )
  }

  // Filter out dismissed suggestions
  const visibleSuggestions = suggestions.filter(suggestion => {
    const key = `${suggestion.action_type}-${suggestion.triggering_entry_id}`
    return !dismissed.has(key)
  })

  // Don't render if no suggestions
  if (visibleSuggestions.length === 0) {
    return null
  }

  return (
    <div className="bg-yellow-50 border-2 border-yellow-300 p-4 mb-6">
      <h3 className="text-sm font-bold text-yellow-900 mb-3">
        Suggested Actions
      </h3>
      <div className="space-y-3">
        {visibleSuggestions.map((suggestion, index) => {
          const key = `${suggestion.action_type}-${suggestion.triggering_entry_id}-${index}`
          return (
            <div key={key} className="bg-white border border-yellow-200 p-3">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-bold text-gray-900">
                  {formatActionType(suggestion.action_type)}
                </h4>
                <span className="text-xs text-gray-500 uppercase">
                  {suggestion.confidence} confidence
                </span>
              </div>

              <p className="text-sm text-gray-700 mb-3">
                {suggestion.reasoning}
              </p>

              {suggestion.suggested_due_date && (
                <p className="text-xs text-gray-600 mb-3">
                  Suggested due: {formatDate(suggestion.suggested_due_date)}
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleSetAction(suggestion.triggering_entry_id)}
                  className="px-3 py-1 text-xs bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
                  disabled={!suggestion.triggering_entry_id}
                >
                  Set {formatActionType(suggestion.action_type)}
                </button>

                {suggestion.triggering_entry_id && (
                  <button
                    onClick={() => handleViewEntry(suggestion.triggering_entry_id)}
                    className="px-3 py-1 text-xs bg-gray-200 text-gray-900 hover:bg-gray-300 transition-colors"
                  >
                    View Entry
                  </button>
                )}

                <button
                  onClick={() => handleDismiss(suggestion)}
                  className="px-3 py-1 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
