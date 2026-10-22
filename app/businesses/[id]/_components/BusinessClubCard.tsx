'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getClubCardForBusiness, setClubCardOffer } from '@/app/actions/club-card'
import { CARD_STATE_LABEL, ISSUE_LABEL } from '@/lib/club-card/labels'
import { toast } from '@/lib/toast'
import { dateOnlyGB } from './BusinessGlance'

// Club Card section on the business page (UI overhaul Stage 6b): the member
// page on the website, its offer, listings and contact check, and news.
// Shown only for members and businesses with a page. The website isn't changed.

type Data = Awaited<ReturnType<typeof getClubCardForBusiness>>

const btn = 'text-xs font-semibold px-2.5 py-1 rounded-sm border border-black/[0.12] bg-white hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50'

export function BusinessClubCard({ businessId }: { businessId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [endDate, setEndDate] = useState('')

  const load = useCallback(async () => {
    const d = await getClubCardForBusiness(businessId)
    setData(d)
    setEndDate(d.pages[0]?.offer_ends_set ?? '')
  }, [businessId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount
    load()
  }, [load])

  if (!data || (!data.member && data.pages.length === 0)) return null
  const m = data.member
  const page = data.pages[0]

  async function save(change: { offer_ends_set?: string | null; confirm?: boolean }, done: string) {
    if (!page) return
    setBusy(true)
    const res = await setClubCardOffer(page.id, change)
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success(done)
    window.dispatchEvent(new Event('cc:nav-refresh'))
    load()
  }

  return (
    <section id="club-card" aria-labelledby="club-card-h" className="mb-6 border border-black/[0.06] rounded-sm bg-brand-warm p-4 text-sm">
      <h3 id="club-card-h" className="text-lg font-semibold text-brand-dark mb-1" style={{ fontFamily: 'var(--font-serif)' }}>Club Card page</h3>
      {m && (
        <p className={`text-xs mb-2 ${m.card_state === 'member' ? 'text-gray-600' : 'text-red-700'}`}>
          {CARD_STATE_LABEL[m.card_state]}
          {m.contract_end && `${m.card_state === 'member' ? ', ends' : ''} ${dateOnlyGB(m.contract_end)}`}
        </p>
      )}
      {m && m.issues.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {m.issues.map((i) => (
            <span key={i} className="text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-800">
              {i === 'offer_ending' && m.offer_ends ? `Offer ends ${dateOnlyGB(m.offer_ends)}` : ISSUE_LABEL[i]}
            </span>
          ))}
        </div>
      )}

      {!page ? (
        <p className="text-gray-600">
          No page on the website matched to this business. If it has one, match it on{' '}
          <Link href="/businesses/club-card-pages" className="text-brand-navy hover:underline">Match Club Card pages</Link>.
        </p>
      ) : (
        <div className="space-y-3">
          <p>
            <a href={page.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline break-words">{m?.page_title ?? page.title}</a>
            <span className="text-xs text-gray-500">
              {m?.wp_modified && ` · last edited ${dateOnlyGB(m.wp_modified)}`}
              {m?.offer_confirmed_at && ` · offer confirmed ${dateOnlyGB(m.offer_confirmed_at)}`}
            </span>
          </p>
          {data.pages.length > 1 && (
            <p className="text-xs text-gray-600">
              Also: {data.pages.slice(1).map((p, n) => (
                <span key={p.id}>{n > 0 && ', '}<a href={p.link} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">{p.title}</a></span>
              ))}
            </p>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-0.5">Club Card offer, as on the page</p>
            <p className="whitespace-pre-line text-gray-800">{m?.offer_text ?? 'No "Club Card offer" section found on the page.'}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-600">
              Offer ends
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block border border-black/[0.12] rounded-sm px-2 py-1 text-sm bg-white"
              />
            </label>
            <button type="button" className={btn} disabled={busy || endDate === (page.offer_ends_set ?? '')}
              onClick={() => save({ offer_ends_set: endDate || null }, endDate ? `Offer end set to ${dateOnlyGB(endDate)}` : 'Offer end cleared')}>
              Save end date
            </button>
            <button type="button" className={btn} disabled={busy} title="You've checked the offer on the page is still right; starts the 12 months again"
              onClick={() => save({ confirm: true }, 'Offer confirmed as still right')}>
              Offer still right
            </button>
          </div>
          {m && (
            <ul className="text-xs text-gray-700 grid gap-0.5 sm:grid-cols-2">
              <li>A-Z directory: {m.in_az_count === 0 ? 'not listed' : m.in_az_count === 1 ? 'listed' : `listed ${m.in_az_count} times`}</li>
              <li>Map: {m.map_count ? `on it${m.map_folders?.length ? ` (${m.map_folders.join(', ')})` : ''}` : 'not on it'}</li>
              <li>Category pages: {m.categories?.length ? m.categories.join(', ') : 'none'}</li>
              <li>Latest Offers: {m.in_latest_offers ? 'listed' : 'not listed'}</li>
              <li className="sm:col-span-2">
                On the page: {[m.page_address, m.page_phone, m.page_website, m.page_email].filter(Boolean).join(' · ') || 'no contact details'}
                {(m.contact_mismatch ?? []).length > 0 && <span className="text-red-700 font-semibold"> (differs from the app: {(m.contact_mismatch ?? []).join(', ')})</span>}
              </li>
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-black/[0.06]">
        <p className="text-xs font-semibold text-gray-600 mb-1">News articles</p>
        {data.articles.length === 0 ? (
          <p className="text-xs text-gray-500">None found yet.</p>
        ) : (
          <ul className="text-xs space-y-0.5">
            {data.articles.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">{a.title}</a>
                <span className="text-gray-500"> · {a.published_date ? dateOnlyGB(a.published_date) : 'undated'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
