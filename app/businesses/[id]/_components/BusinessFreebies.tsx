'use client'

import { useEffect, useState } from 'react'
import { getBusinessFreebies, type BusinessFreebie } from '@/app/actions/newsletter-tab'
import { formatDateGB } from '@/lib/utils'

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)

/**
 * Freebies and competitions the newsletter ran for this business (Stage 16a), from the
 * Newsletter tab's items. Reader entries reach the info@ mailbox, so they are not shown.
 */
export function BusinessFreebies({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<BusinessFreebie[] | null>(null)

  useEffect(() => {
    let live = true
    getBusinessFreebies(businessId).then((r) => { if (live) setRows(r) })
    return () => { live = false }
  }, [businessId])

  if (!rows || rows.length === 0) return null
  return (
    <div className="mb-6 border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-brand-dark">Freebies in the newsletter</h2>
        <a href="/newsletter?view=freebies" className="text-xs text-brand-navy hover:underline">All freebies</a>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((f) => (
          <li key={f.id} className="py-2 text-sm flex items-start gap-3">
            <span className="text-gray-500 text-xs whitespace-nowrap w-24 flex-shrink-0">{dateGB(f.date)}</span>
            <span className="flex-1 min-w-0 text-gray-700">
              {f.link_url ? <a href={f.link_url} target="_blank" rel="noreferrer" className="hover:underline">{f.headline ?? 'Freebie'}</a> : f.headline ?? 'Freebie'}
              <span className="text-gray-500 text-xs">
                {f.kind === 'competition' ? ' · competition' : ''}{f.closes_on ? ` · closed ${dateGB(f.closes_on)}` : ''}
              </span>
            </span>
            {f.issue_url && <a href={f.issue_url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-xs text-brand-navy hover:underline">Open issue</a>}
          </li>
        ))}
      </ul>
    </div>
  )
}
