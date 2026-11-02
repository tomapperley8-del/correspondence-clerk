'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { confirmAdEmails, rejectAdEmails, undoAdEmailReview, type AdEmailMatch, type AdEmailResult } from '@/app/actions/ad-emails'

// Ad emails from Dawn and James (Stage 17b (5)): which advertiser is each about? Tick, Confirm or Not this business, Undo.

const btn = 'px-2.5 py-1 text-sm border border-gray-300 rounded-sm bg-white hover:bg-brand-warm disabled:opacity-50 disabled:cursor-not-allowed'

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function AdEmailList({ rows }: { rows: AdEmailMatch[] }) {
  const router = useRouter()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [last, setLast] = useState<{ batch: string; text: string } | null>(null)
  const [pending, start] = useTransition()

  const ids = rows.map((r) => r.link_id)
  const allTicked = ids.length > 0 && ids.every((id) => ticked.has(id))
  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const done = (r: AdEmailResult, what: string) => {
    if (r.error) return toast.error(`Could not save: ${r.error}`)
    if (r.ok > 0 && r.batch) setLast({ batch: r.batch, text: `${what} ${r.ok}.` })
    if (r.ok > 0) toast.success(`${what} ${r.ok}`)
    setTicked(new Set())
    router.refresh()
  }
  const confirm = (list: string[]) => start(async () => done(await confirmAdEmails(list), 'Confirmed'))
  const reject = (list: string[]) => start(async () => done(await rejectAdEmails(list), 'Marked not this business:'))
  const undo = () => last && start(async () => {
    const r = await undoAdEmailReview(last.batch)
    if (r.error) return toast.error(`Could not undo: ${r.error}`)
    toast.success(`Undone: ${r.restored} back to waiting`)
    setLast(null)
    router.refresh()
  })

  const tickedList = ids.filter((id) => ticked.has(id))

  return (
    <div className="mt-1.5 border-t border-black/[0.06]">
      {last && (
        <div role="status" className="flex items-center justify-between gap-3 px-3 py-2 bg-brand-warm text-sm">
          <span>{last.text}</span>
          <button onClick={undo} disabled={pending} className="font-semibold text-brand-navy hover:underline">Undo</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <label className="flex items-center gap-1.5 text-sm font-semibold">
          <input type="checkbox" checked={allTicked} onChange={() => setTicked(allTicked ? new Set() : new Set(ids))} />
          Select all <span className="font-normal text-gray-600">({rows.length})</span>
        </label>
        <span className="text-sm text-gray-600" aria-live="polite">{tickedList.length} ticked</span>
        <button className={btn} disabled={pending || tickedList.length === 0} onClick={() => confirm(tickedList)}>
          Confirm{tickedList.length > 0 ? ` (${tickedList.length})` : ''}
        </button>
        <button className={btn} disabled={pending || tickedList.length === 0} onClick={() => reject(tickedList)}>
          Not this business{tickedList.length > 0 ? ` (${tickedList.length})` : ''}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">Ad emails to match to an advertiser</caption>
          <thead>
            <tr className="bg-brand-warm text-left">
              <th scope="col" className="px-3 py-1.5 w-8"><span className="sr-only">Tick</span></th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Email</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Looks like it is about</th>
              <th scope="col" className="px-3 py-1.5 font-semibold"><span className="sr-only">Fix</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.link_id} className="border-t border-black/[0.06] align-top">
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={ticked.has(r.link_id)} onChange={() => toggle(r.link_id)} aria-label={`Tick ${r.subject ?? 'email'}: ${r.business_name}`} />
                </td>
                <td className="px-3 py-1.5 text-gray-700">
                  <span className="font-semibold">{r.subject ?? '(no subject)'}</span>
                  <span className="block text-xs text-gray-600">{formatDate(r.entry_date)}{r.contact_name ? `, ${r.contact_name}` : ''}</span>
                </td>
                <th scope="row" className="px-3 py-1.5 text-left font-semibold">
                  <Link href={`/businesses/${r.business_id}`} className="text-brand-dark hover:underline">{r.business_name}</Link>
                  {r.why && <span className="block text-xs font-normal text-gray-600">{r.why}; check it is the same business</span>}
                </th>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    <button disabled={pending} onClick={() => confirm([r.link_id])} className="font-semibold text-brand-navy hover:underline">
                      Confirm<span className="sr-only"> {r.subject} is about {r.business_name}</span>
                    </button>
                    <button disabled={pending} onClick={() => reject([r.link_id])} className="font-semibold text-brand-navy hover:underline">
                      Not this business<span className="sr-only"> for {r.subject}</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
