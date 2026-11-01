'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { formatDateTimeGB } from '@/lib/utils'
import { checkListingsNow, type Listing, type ListingsData } from '@/app/actions/listings'
import { ListingActions, WebsitePill, dateGB } from './ListingParts'
import { LinkBusiness } from './LinkBusiness'

type View = 'open' | 'cleo' | 'notsent' | 'live' | 'all' | 'hidden'

const VIEWS: { key: View; label: string; test: (l: Listing) => boolean }[] = [
  { key: 'open', label: 'Not live yet', test: (l) => l.is_open },
  { key: 'cleo', label: 'Waiting for Cleo', test: (l) => l.is_open && l.status === 'with_cleo' },
  { key: 'notsent', label: 'Not sent to Cleo', test: (l) => l.is_open && l.status === 'not_sent' },
  { key: 'live', label: 'Live', test: (l) => l.status === 'live' },
  { key: 'all', label: 'All', test: (l) => l.status !== 'hidden' },
  { key: 'hidden', label: 'Not a listing', test: (l) => l.status === 'hidden' },
]

const chip = 'px-2.5 py-1 text-sm rounded-sm border transition-colors duration-200 ease-out whitespace-nowrap'

export function ListingsTab({ data, initialView }: { data: ListingsData; initialView?: string }) {
  const router = useRouter()
  const [view, setView] = useState<View>(VIEWS.some((v) => v.key === initialView) ? (initialView as View) : 'open')
  const [checking, startCheck] = useTransition()
  const [openNote, setOpenNote] = useState<string | null>(null)

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, data.listings.filter(v.test).length])), [data.listings])
  const rows = useMemo(() => {
    const list = data.listings.filter(VIEWS.find((v) => v.key === view)!.test)
    // Live: newest on the website first. Otherwise newest request first (the order they arrive in).
    if (view === 'live') return [...list].sort((a, b) => (b.website_published_at ?? b.cleo_replied_at ?? '').localeCompare(a.website_published_at ?? a.cleo_replied_at ?? ''))
    return list
  }, [data.listings, view])

  const pick = (v: View) => {
    setView(v)
    const url = new URL(window.location.href)
    url.searchParams.set('view', v)
    window.history.replaceState(null, '', url)
  }

  const checkNow = () => startCheck(async () => {
    const r = await checkListingsNow()
    if (!r.ok) return toast.error(`Could not check the website: ${r.error}`)
    const res = r as { went_live?: number; possible?: number }
    toast.success(`Checked. ${res.went_live ?? 0} newly live, ${res.possible ?? 0} possible ${res.possible === 1 ? 'match' : 'matches'} to confirm`)
    router.refresh()
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 text-sm text-gray-600">
        <span>
          Website checked nightly.{' '}
          {data.lastRun
            ? <>Last checked {formatDateTimeGB(data.lastRun.ran_at)}{data.lastRun.ok ? '' : <span className="text-red-700"> (it failed: {data.lastRun.error})</span>}.</>
            : 'Not checked yet.'}
        </span>
        <button onClick={checkNow} disabled={checking}
          className="px-2.5 py-1 text-sm rounded-sm border border-gray-300 bg-white text-brand-navy hover:bg-gray-50 transition-colors duration-200 ease-out disabled:opacity-50">
          {checking ? 'Checking the website…' : 'Check the website now'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Which listings">
        {VIEWS.filter((v) => v.key !== 'hidden' || counts.hidden > 0).map((v) => (
          <button key={v.key} onClick={() => pick(v.key)} aria-pressed={view === v.key}
            className={`${chip} ${view === v.key ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-brand-dark border-gray-300 hover:bg-gray-50'}`}>
            {v.label} <span className="tabular-nums opacity-75">{counts[v.key]}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-600 border border-gray-200 bg-white p-4">
          {view === 'open' ? 'Every recent request is live on the website.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-brand-warm text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="px-3 py-2 font-semibold">From</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Asked</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Sent to Cleo</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Cleo replied</th>
                <th className="px-3 py-2 font-semibold">On the website</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Event date</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-3 py-2 min-w-[240px]">
                    <div className="font-semibold text-brand-dark">{l.title}</div>
                    {l.event_when && <div className="text-xs text-gray-500">{l.event_when}</div>}
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                      <span>{l.source === 'form' ? 'Promote my Event form' : 'Email'}</span>
                      {l.entry_business_id && l.entry_ids.length > 0 && (
                        <Link href={`/businesses/${l.entry_business_id}#entry-${l.entry_ids[l.entry_ids.length - 1]}`} className="text-brand-navy hover:underline">Open email</Link>
                      )}
                      {l.cleo_note && (
                        <button className="text-brand-navy hover:underline" onClick={() => setOpenNote(openNote === l.id ? null : l.id)}>
                          {openNote === l.id ? "Hide Cleo's reply" : "Cleo's reply"}
                        </button>
                      )}
                    </div>
                    {openNote === l.id && l.cleo_note && (
                      <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap break-words font-sans bg-brand-paper border border-gray-100 p-2">{l.cleo_note}</pre>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[190px]">
                    {l.business_id
                      ? <Link href={`/businesses/${l.business_id}`} className="text-brand-navy hover:underline">{l.business_name}</Link>
                      : <span className="text-gray-700">{l.requester_name ?? l.requester_email ?? 'Unknown'}</span>}
                    {l.requester_email && <div className="text-xs text-gray-500 break-words">{l.requester_email}</div>}
                    <LinkBusiness listingId={l.id} linked={!!l.business_id} businesses={data.businesses}
                      hint={[l.requester_email?.split('@')[1], l.requester_name, l.title].filter(Boolean).join(' ')} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dateGB(l.asked_at) ?? '–'}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dateGB(l.sent_to_cleo_at) ?? <span className="text-gray-400">–</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dateGB(l.cleo_replied_at) ?? <span className="text-gray-400">–</span>}</td>
                  <td className="px-3 py-2"><WebsitePill l={l} /></td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dateGB(l.event_starts_at) ?? <span className="text-gray-400">–</span>}</td>
                  <td className="px-3 py-2 text-right"><ListingActions l={l} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500 max-w-[80ch]">
        Live means Cleo&apos;s or your reply has the event&apos;s link, or the website has an event with the same title published after the request came in. A likely but unsure title match shows as Possible match for you to confirm. The website removes events about a month after they happen. &quot;Sent to Cleo&quot; is only known when her reply, or your forward to her, reached Correspondence Clerk.
      </p>
    </div>
  )
}
