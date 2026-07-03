'use client'

import { useState } from 'react'
import Link from 'next/link'
import { confirmArticle, rejectArticle, type ArticleWithBusiness } from '@/app/actions/articles'
import { formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'

const SOURCE_LABELS: Record<string, string> = {
  'chiswickcalendar.co.uk': 'CC',
  'keepthingslocal.com': 'KTL',
  'chiswickw4.com': 'W4',
}

function SourceBadge({ domain }: { domain: string }) {
  const label = SOURCE_LABELS[domain] || domain.split('.')[0]
  return (
    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-sm shrink-0 uppercase" title={domain}>
      {label}
    </span>
  )
}

type Group = {
  name: string
  id: string
  confirmed: ArticleWithBusiness[]
  pending: ArticleWithBusiness[]
}

function groupByBusiness(articles: ArticleWithBusiness[]): Group[] {
  const map: Record<string, Group> = {}
  for (const a of articles) {
    if (!map[a.business_id]) {
      map[a.business_id] = { name: a.business_name, id: a.business_id, confirmed: [], pending: [] }
    }
    if (a.status === 'pending') {
      map[a.business_id].pending.push(a)
    } else {
      map[a.business_id].confirmed.push(a)
    }
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

export function ArticlesListClient({ initialArticles }: { initialArticles: ArticleWithBusiness[] }) {
  const [articles, setArticles] = useState(initialArticles)
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('all')

  const filtered = filter === 'all' ? articles : articles.filter(a => a.status === filter)
  const groups = groupByBusiness(filtered)

  const pendingCount = articles.filter(a => a.status === 'pending').length
  const confirmedCount = articles.filter(a => a.status === 'confirmed').length

  const handleConfirm = async (id: string) => {
    const { success } = await confirmArticle(id)
    if (success) {
      setArticles(prev => prev.map(a => a.id === id ? { ...a, status: 'confirmed' as const, confirmed_at: new Date().toISOString() } : a))
      toast.success('Article confirmed')
    }
  }

  const handleReject = async (id: string) => {
    const { success } = await rejectArticle(id)
    if (success) {
      setArticles(prev => prev.filter(a => a.id !== id))
      toast.info('Article dismissed')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
        News Coverage
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        {confirmedCount} confirmed, {pendingCount} to review
      </p>

      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'confirmed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
              filter === f
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-navy'
            }`}
          >
            {f === 'all' ? `All (${articles.length})` : f === 'pending' ? `To review (${pendingCount})` : `Confirmed (${confirmedCount})`}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {filter === 'pending' ? 'No articles to review.' : filter === 'confirmed' ? 'No confirmed articles yet.' : 'No articles found.'}{' '}
          Scan for articles on individual business pages or in{' '}
          <Link href="/settings?tab=tools" className="text-brand-navy hover:underline">Settings &gt; Tools</Link>.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.id} className="bg-white border-2 border-gray-300 p-4">
              <Link
                href={`/businesses/${group.id}`}
                className="text-base font-bold text-brand-navy hover:underline"
              >
                {group.name}
              </Link>
              <span className="text-xs text-gray-400 ml-2">
                {group.confirmed.length + group.pending.length} article{group.confirmed.length + group.pending.length === 1 ? '' : 's'}
                {group.pending.length > 0 && <span className="text-amber-600 ml-1">({group.pending.length} to review)</span>}
              </span>

              {group.pending.length > 0 && (
                <div className="mt-2 space-y-2">
                  {group.pending.map(article => (
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
              )}

              {group.confirmed.length > 0 && (
                <ul className={`space-y-1.5 ${group.pending.length > 0 ? 'mt-3 pt-3 border-t border-gray-200' : 'mt-2'}`}>
                  {group.confirmed.map(article => (
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
                      <SourceBadge domain={article.source_domain} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
