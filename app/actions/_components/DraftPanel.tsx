'use client'

import { useState, useEffect } from 'react'
import { generateDraftReply } from '@/app/actions/draft-reply'

type DraftPanelProps = {
  correspondenceId: string
  onUseInLog: (draft: string) => void
  onClose: () => void
}

export function DraftPanel({ correspondenceId, onUseInLog, onClose }: DraftPanelProps) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function fetchDraft() {
    setLoading(true)
    setError(null)
    const result = await generateDraftReply(correspondenceId)
    if ('error' in result) {
      setError(result.error)
    } else {
      setDraft(result.draft)
    }
    setLoading(false)
  }

  useEffect(() => { fetchDraft() }, [correspondenceId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCopy() {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="px-4 py-3 bg-blue-50/40 border-t border-blue-100 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-brand-dark">Draft reply</span>
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Close
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4">
          <div className="w-3.5 h-3.5 border-2 border-brand-navy border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-500">Generating draft…</span>
        </div>
      )}

      {error && !loading && (
        <div className="py-2">
          <p className="text-xs text-red-600 mb-2">Couldn&apos;t generate draft — {error}</p>
          <button
            onClick={fetchDraft}
            className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={5}
            className="w-full text-sm border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:border-brand-navy bg-white"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1 text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => onUseInLog(draft)}
              className="px-3 py-1 text-xs font-medium border border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-white transition-colors"
            >
              Use in Log
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  )
}
