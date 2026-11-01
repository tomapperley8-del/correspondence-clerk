'use client'

import { useEffect, useState } from 'react'
import { getBusinessListings, type Listing } from '@/app/actions/listings'
import { ListingActions, WebsitePill, dateGB } from '@/app/listings/_components/ListingParts'

const Step = ({ done, label, date }: { done: boolean; label: string; date: string | null }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 pr-3">
    <span className={`inline-block w-2 h-2 rounded-full ${done ? 'bg-brand-olive' : 'bg-gray-200'}`} aria-hidden="true" />
    {label} {date && <b className="font-semibold text-brand-dark tabular-nums">{date}</b>}
  </span>
)

/**
 * What's On listings for this business (Stage 20): each request, with the four steps
 * Asked, To Cleo, Cleo, Live. Shown only when there is at least one.
 */
export function BusinessListings({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<Listing[] | null>(null)

  useEffect(() => {
    let live = true
    getBusinessListings(businessId).then((r) => { if (live) setRows(r) })
    return () => { live = false }
  }, [businessId])

  if (!rows || rows.length === 0) return null
  return (
    <div className="mb-6 border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-brand-dark">What&apos;s On listings</h2>
        <a href="/listings?view=all" className="text-xs text-brand-navy hover:underline">All listings</a>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((l) => (
          <li key={l.id} className="py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-sm font-semibold text-brand-dark min-w-0">{l.title}</span>
              <ListingActions l={l} />
            </div>
            <div className="flex flex-wrap items-center mt-1">
              <Step done label="Asked" date={dateGB(l.asked_at)} />
              <Step done={!!l.sent_to_cleo_at} label={l.sent_to_cleo_at ? 'To Cleo' : 'Not sent to Cleo'} date={dateGB(l.sent_to_cleo_at)} />
              {l.cleo_replied_at && <Step done label="Cleo" date={dateGB(l.cleo_replied_at)} />}
              <WebsitePill l={l} />
            </div>
            {l.event_starts_at && <div className="text-xs text-gray-500 mt-0.5">Event {dateGB(l.event_starts_at)}{l.event_when ? ` · ${l.event_when}` : ''}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
