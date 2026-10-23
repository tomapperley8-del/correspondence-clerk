'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ClubCardRow } from '@/app/actions/club-card'
import { CARD_STATE_LABEL, ISSUE_LABEL, type ClubCardIssue } from '@/lib/club-card/labels'
import { dateOnlyGB } from '@/app/businesses/[id]/_components/BusinessGlance'

// The Club Card view (UI overhaul Stage 6b): every member's website page, its
// offer, when it was last edited and the contract, with problems flagged.
// Tom fixes the website himself; nothing here writes to it.

const CHECK = 'font-semibold text-brand-olive'
const CROSS = 'font-semibold text-red-700'

function yesNo(ok: boolean, label: string, bad?: string) {
  return <span className={ok ? CHECK : CROSS}>{ok ? `✓ ${label}` : `✗ ${bad ?? label}`}</span>
}

export function ClubCardTable({ rows, lastRun, toMatch }: { rows: ClubCardRow[]; lastRun: { ran_at: string; ok: boolean } | null; toMatch: number }) {
  const [show, setShow] = useState<'all' | 'problems' | ClubCardIssue>('problems')
  const issueCounts = useMemo(() => {
    const c: Partial<Record<ClubCardIssue, number>> = {}
    for (const r of rows) for (const i of r.issues) c[i] = (c[i] ?? 0) + 1
    return c
  }, [rows])
  const shown = rows.filter((r) => (show === 'all' ? true : show === 'problems' ? r.issues.length > 0 : r.issues.includes(show)))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="border border-black/[0.12] rounded-sm px-2 py-1 text-sm bg-white">
            <option value="problems">With a problem ({rows.filter((r) => r.issues.length > 0).length})</option>
            <option value="all">All ({rows.length})</option>
            {(Object.keys(ISSUE_LABEL) as ClubCardIssue[]).filter((i) => issueCounts[i]).map((i) => (
              <option key={i} value={i}>{ISSUE_LABEL[i]} ({issueCounts[i]})</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500">
          {lastRun ? `Website last read ${new Date(lastRun.ran_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}${lastRun.ok ? '' : ' (failed)'}` : 'The website has not been read yet'}
        </span>
        {toMatch > 0 && (
          <Link href="/businesses/club-card-pages" className="text-xs font-semibold text-brand-navy hover:underline">
            {toMatch} page{toMatch === 1 ? '' : 's'} to match
          </Link>
        )}
        {toMatch === 0 && (
          <Link href="/businesses/club-card-pages" className="text-xs text-brand-navy hover:underline">Page matches</Link>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to show.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {shown.map((r) => (
            <li key={r.business_id} className="py-3 grid gap-x-4 gap-y-2 text-sm md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,14rem)]">
              <div className="min-w-0">
                <Link href={`/businesses/${r.business_id}?tab=details`} className="font-semibold text-brand-dark hover:underline break-words">{r.business_name}</Link>
                <p className={`text-xs ${r.card_state === 'member' ? 'text-gray-600' : 'text-red-700'}`}>
                  {CARD_STATE_LABEL[r.card_state]}
                  {r.contract_end && `${r.card_state === 'member' ? ', ends' : ''} ${dateOnlyGB(r.contract_end)}`}
                </p>
                {r.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.issues.map((i) => (
                      <span key={i} className="text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-800">
                        {i === 'offer_ending' && r.offer_ends ? `Offer ends ${dateOnlyGB(r.offer_ends)}` : ISSUE_LABEL[i]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {r.page_link ? (
                  <>
                    <a href={r.page_link} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline break-words">{r.page_title}</a>
                    <span className="text-xs text-gray-500">
                      {' '}· edited {r.wp_modified ? dateOnlyGB(r.wp_modified) : 'unknown'}
                      {r.offer_confirmed_at && ` · offer confirmed ${dateOnlyGB(r.offer_confirmed_at)}`}
                      {r.live_page_count > 1 && ` · ${r.live_page_count} pages`}
                    </span>
                    {r.offer_text && <p className="text-xs text-gray-700 mt-1 line-clamp-3 whitespace-pre-line">{r.offer_text}</p>}
                  </>
                ) : (
                  <p className="text-gray-500">No page on the website</p>
                )}
              </div>
              <div className="min-w-0 text-xs space-y-0.5">
                {r.page_link && (
                  <>
                    <p>
                      {yesNo((r.in_az_count ?? 0) === 1, 'A-Z', (r.in_az_count ?? 0) > 1 ? `A-Z ×${r.in_az_count}` : 'A-Z')}{' '}
                      {yesNo((r.map_count ?? 0) > 0, 'Map')}{' '}
                      {yesNo((r.categories ?? []).length > 0, (r.categories ?? []).join(', ') || 'Category', 'Category')}{' '}
                      {r.in_latest_offers && <span className={CHECK}>✓ Latest Offers</span>}
                    </p>
                    {r.category_differs && (
                      <p>
                        <span className={CROSS}>✗ Category differs: {r.category_in_app || 'none'} here, {(r.category_on_website ?? []).join(', ')} on the website</span>
                      </p>
                    )}
                    <p>
                      {(r.contact_mismatch ?? []).length > 0
                        ? <span className={CROSS}>✗ Differs: {(r.contact_mismatch ?? []).join(', ')}</span>
                        : <span className="text-gray-600">Contact details: no difference found</span>}
                    </p>
                  </>
                )}
                <p className="text-gray-600">
                  {r.articles > 0 ? `${r.articles} news article${r.articles === 1 ? '' : 's'}, latest ${r.latest_article ? dateOnlyGB(r.latest_article) : 'undated'}` : 'No news articles'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
