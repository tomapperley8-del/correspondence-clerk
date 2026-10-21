import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAttention, getAttentionCount, getOldTodosDueCount } from '@/app/actions/attention'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { AttentionList } from './_components/AttentionList'

export const metadata = {
  title: 'Needs attention — Correspondence Clerk',
}

export default async function AttentionPage() {
  if (!isFeatureEnabled('attentionView')) notFound()

  const [rowsResult, count, oldCount] = await Promise.all([
    getAttention(),
    getAttentionCount(),
    getOldTodosDueCount(),
  ])
  const rows = rowsResult.data ?? []

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}
        >
          Needs attention{count ? ` (${count.total})` : ''}
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          One line per business, worked out fresh each time: money owed, renewals, emails waiting on you, and your own to-dos.
          Nothing to tick: a line goes when its cause goes.
        </p>
        {count && oldCount !== null && (
          <p className="text-xs mt-2 px-3 py-2 bg-brand-warm border border-black/[0.06] inline-block">
            Comparison week: the old count (To-dos due) is {oldCount}; this page counts {count.total}
            {' '}({count.businesses} business{count.businesses === 1 ? '' : 'es'}
            {count.unlinked_todos > 0 ? ` and ${count.unlinked_todos} to-do${count.unlinked_todos === 1 ? '' : 's'} with no business` : ''}).
          </p>
        )}
      </div>

      {rowsResult.error ? (
        <p className="text-sm text-red-700">Could not load the list: {rowsResult.error}</p>
      ) : (
        <AttentionList rows={rows} today={count?.today ?? new Date().toISOString().slice(0, 10)} />
      )}

      {count && count.unlinked_todos > 0 && (
        <p className="mt-8 text-sm">
          Plus {count.unlinked_todos} to-do{count.unlinked_todos === 1 ? '' : 's'} due with no business attached.{' '}
          <Link href="/todos" className="underline" style={{ color: 'var(--link-blue)' }}>
            Open To-dos
          </Link>
        </p>
      )}
    </div>
  )
}
