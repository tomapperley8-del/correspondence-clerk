'use client'

import { useState } from 'react'
import { detectActions } from '@/app/actions/ai-action-detection'
import { ActionSuggestion } from '@/lib/ai/types'

interface ActionSuggestionsProps {
  businessId: string
}

export function ActionSuggestions({ businessId }: ActionSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const generate = async () => {
    setLoading(true)
    const result = await detectActions(businessId)
    if (!('error' in result) && result.data?.suggestions) {
      const sorted = [...result.data.suggestions].sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
        if (priorityDiff !== 0) return priorityDiff
        const confidenceOrder = { high: 3, medium: 2, low: 1 }
        return confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
      })
      setSuggestions(sorted.slice(0, 3))
    }
    setGenerated(true)
    setLoading(false)
  }

  const handleSetAction = (entryId: string | null) => {
    if (!entryId) return
    const element = document.getElementById(`entry-${entryId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.style.backgroundColor = '#fef3c7'
      setTimeout(() => { element.style.backgroundColor = '' }, 2000)
    }
  }

  const handleViewEntry = (entryId: string | null) => {
    if (!entryId) return
    const element = document.getElementById(`entry-${entryId}`)
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleDismiss = (suggestion: ActionSuggestion) => {
    const key = `${suggestion.action_type}-${suggestion.triggering_entry_id}`
    setDismissed(prev => new Set([...prev, key]))
  }

  const formatActionType = (actionType: string): string => {
    switch (actionType) {
      case 'follow_up': return 'Follow-up'
      case 'waiting_on_them': return 'Waiting on Them'
      case 'invoice': return 'Invoice'
      case 'renewal': return 'Renewal'
      case 'prospect': return 'Prospect'
      default: return actionType
    }
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return ''
    try {
      return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return dateString
    }
  }

  if (!generated) {
    return (
      <div className="border border-black/[0.06] bg-gray-50 p-3 mb-6 flex items-center justify-between">
        <span className="text-sm text-gray-600">Detect suggested actions from correspondence</span>
        <button
          onClick={generate}
          className="text-sm text-brand-navy hover:underline font-semibold"
        >
          Detect
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-4 mb-6">
        <p className="text-sm text-yellow-900 italic">Analyzing correspondence for pending actions...</p>
      </div>
    )
  }

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(`${s.action_type}-${s.triggering_entry_id}`))

  if (visibleSuggestions.length === 0) return null

  return (
    <div className="bg-yellow-50 border border-yellow-200 p-4 mb-6">
      <h3 className="text-sm font-bold text-yellow-900 mb-3">Suggested Actions</h3>
      <div className="space-y-3">
        {visibleSuggestions.map((suggestion, index) => {
          const key = `${suggestion.action_type}-${suggestion.triggering_entry_id}-${index}`
          return (
            <div key={key} className="bg-white border border-yellow-200 p-3">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-bold text-gray-900">{formatActionType(suggestion.action_type)}</h4>
                <span className="text-xs text-gray-500 uppercase">{suggestion.confidence} confidence</span>
              </div>
              <p className="text-sm text-gray-700 mb-3">{suggestion.reasoning}</p>
              {suggestion.suggested_due_date && (
                <p className="text-xs text-gray-600 mb-3">Suggested due: {formatDate(suggestion.suggested_due_date)}</p>
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
