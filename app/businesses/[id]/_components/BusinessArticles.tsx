'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getArticlesForBusiness,
  confirmArticle,
  rejectArticle,
  scanBusinessForArticles,
  type BusinessArticle,
} from '@/app/actions/articles'
import { formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'

export function BusinessArticles({ businessId }: { businessId: string }) {
  const [articles, setArticles] = useState<BusinessArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  const loadArticles = useCallback(async () => {
    const data = await getArticlesForBusiness(businessId)
    setArticles(data)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    loadArticles()
  }, [loadArticles])

  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await scanBusinessForArticles(businessId)
      if (result.error) {
        toast.error(result.error)
      } else if (result.new_count > 0) {
        toast.success(`Found ${result.new_count} new article${result.new_count === 1 ? '' : 's'}`)
        await loadArticles()
      } else {
        toast.info('No new articles found')
      }
    } catch {
      toast.error('Failed to scan for articles')
    }
    setScanning(false)
  }

  const handleConfirm = async (id: string) => {
    const { success } = await confirmArticle(id)
    if (success) {
      setArticles(prev =>
        prev.map(a => (a.id === id ? { ...a, status: 'confirmed' as const, confirmed_at: new Date().toISOString() } : a))
      )
    }
  }

  const handleReject = async (id: string) => {
    const { success } = await rejectArticle(id)
    if (success) {
      setArticles(prev => prev.filter(a => a.id !== id))
    }
  }

  const confirmed = articles.filter(a => a.status === 'confirmed')
  const pending = articles.filter(a => a.status === 'pending')

  if (loading) {
    return (
      <div className="bg-white border-2 border-gray-300 p-6">
        <h2 className="text-xl font-bold mb-3">News Coverage</h2>
        <div className="animate-pulse h-8 bg-gray-100 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-white border-2 border-gray-300 p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold">News Coverage</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-3 py-1.5 text-xs font-semibold border border-brand-navy text-brand-navy rounded-sm hover:bg-brand-navy hover:text-white transition-colors disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan for articles'}
        </button>
      </div>

      {pending.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-amber-700 mb-2">
            {pending.length} article{pending.length === 1 ? '' : 's'} to review
          </p>
          <div className="space-y-2">
            {pending.map(article => (
              <div
                key={article.id}
                className="flex items-start justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-sm"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-navy hover:underline block truncate"
                  >
                    {article.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {article.published_date ? formatDateGB(article.published_date) : 'Date unknown'}
                    {' · '}
                    {article.source_domain}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleConfirm(article.id)}
                    className="px-2 py-1 text-xs font-semibold bg-brand-olive text-white rounded-sm hover:opacity-90"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleReject(article.id)}
                    className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-600 rounded-sm hover:bg-gray-300"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmed.length > 0 ? (
        <ul className="space-y-1.5">
          {confirmed.map(article => (
            <li key={article.id} className="flex items-baseline gap-2">
              <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                {article.published_date ? formatDateGB(article.published_date) : '—'}
              </span>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-navy hover:underline truncate"
              >
                {article.title}
              </a>
            </li>
          ))}
        </ul>
      ) : pending.length === 0 ? (
        <p className="text-sm text-gray-400">
          No articles found yet. Click &quot;Scan for articles&quot; to search The Chiswick Calendar.
        </p>
      ) : null}
    </div>
  )
}
