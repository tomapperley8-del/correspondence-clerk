'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import {
  clearListingDecision, confirmListingMatch, hideListing, markListingLive, rejectListingMatch, showListing,
  type Listing,
} from '@/app/actions/listings'

export const dateGB = (d: string | null) => (d ? formatDateGB(d) : null)

/** The website column: Live (with a link), Possible match, or not found. */
export function WebsitePill({ l }: { l: Listing }) {
  if (l.status === 'live') {
    const when = dateGB(l.website_published_at)
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-800 whitespace-nowrap">
          {l.match_kind === 'manual' ? 'Listed (you said)' : when ? `Live ${when}` : 'Listed'}
        </span>
        {l.website_url && !l.website_gone_at && (
          <a href={l.website_url} target="_blank" rel="noreferrer" className="text-xs text-brand-navy hover:underline">View</a>
        )}
        {l.website_gone_at && <span className="text-xs text-gray-500">event over, page removed</span>}
      </span>
    )
  }
  if (l.status === 'possible') {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-800 whitespace-nowrap self-start">Possible match</span>
        {l.website_url && (
          <a href={l.website_url} target="_blank" rel="noreferrer" className="text-xs text-brand-navy hover:underline">
            {l.website_title ?? 'View'}{l.website_published_at ? ` (published ${dateGB(l.website_published_at)})` : ''}
          </a>
        )}
      </span>
    )
  }
  if (l.status === 'hidden') return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">Not a listing</span>
  return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">Not found yet</span>
}

/** The buttons for one request. */
export function ListingActions({ l }: { l: Listing }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error?: string }>, done: string) =>
    start(async () => {
      const r = await fn()
      if (r.error) return toast.error(`Could not save: ${r.error}`)
      toast.success(done)
      router.refresh()
    })
  const btn = 'px-2 py-0.5 text-xs rounded-sm border border-gray-300 bg-white text-brand-navy hover:bg-gray-50 transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
  const mainBtn = 'px-2 py-0.5 text-xs rounded-sm border border-brand-navy bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

  if (l.status === 'possible') {
    return (
      <span className="inline-flex gap-1">
        <button disabled={pending} className={mainBtn}
          onClick={() => run(() => confirmListingMatch(l.id), 'Confirmed: it is live')}>Confirm</button>
        <button disabled={pending} className={btn}
          onClick={() => run(() => rejectListingMatch(l.id), 'Not it. The next read looks again without that event')}>Not it</button>
      </span>
    )
  }
  if (l.status === 'hidden') {
    return <button disabled={pending} className={btn} onClick={() => run(() => showListing(l.id), 'Shown again')}>Show again</button>
  }
  if (l.status === 'live' && (l.match_kind === 'confirmed' || l.match_kind === 'manual')) {
    return <button disabled={pending} className={btn} onClick={() => run(() => clearListingDecision(l.id), 'Undone')}>Undo</button>
  }
  if (l.status !== 'live') {
    return (
      <span className="inline-flex gap-1">
        <button disabled={pending} className={btn} onClick={() => run(() => markListingLive(l.id), 'Marked as listed')}>Mark as listed</button>
        <button disabled={pending} className={btn} onClick={() => run(() => hideListing(l.id), 'Hidden: not a listing')}>Not a listing</button>
      </span>
    )
  }
  return null
}
