import Link from 'next/link'
import { getAllArticles } from '@/app/actions/articles'
import { formatDateGB } from '@/lib/utils'

export const metadata = {
  title: 'News Coverage — Correspondence Clerk',
}

export default async function ArticlesPage() {
  const articles = await getAllArticles()

  const byBusiness: Record<string, { name: string; id: string; articles: typeof articles }> = {}
  for (const a of articles) {
    if (!byBusiness[a.business_id]) {
      byBusiness[a.business_id] = { name: a.business_name, id: a.business_id, articles: [] }
    }
    byBusiness[a.business_id].articles.push(a)
  }

  const groups = Object.values(byBusiness).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
        News Coverage
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {articles.length} confirmed article{articles.length === 1 ? '' : 's'} across {groups.length} business{groups.length === 1 ? '' : 'es'}
      </p>

      {groups.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No confirmed articles yet. Scan for articles on individual business pages or in{' '}
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
                {group.articles.length} article{group.articles.length === 1 ? '' : 's'}
              </span>
              <ul className="mt-2 space-y-1">
                {group.articles.map(article => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
