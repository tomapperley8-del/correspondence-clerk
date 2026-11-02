'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import {
  matchQboCustomers, makeBusinessesFromQbo, undoQboMatch,
  type QboToMatch, type QboMatchResult,
} from '@/app/actions/qbo-match'

// QuickBooks customers to match (Stage 17b): tick customers, then Confirm the suggestions, Choose one
// business for all the ticked, or Make a new business for each. Each row also has its own three buttons.
// The last change can be undone from the bar at the top.

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const dateGB = (d: string | null) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')
const money = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export function BusinessPicker({ businesses, onPick, onCancel, label }: {
  businesses: { id: string; name: string }[]
  onPick: (b: { id: string; name: string }) => void
  onCancel: () => void
  label: string
}) {
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const term = key(q)
    return term ? businesses.filter((b) => key(b.name).includes(term)).slice(0, 8) : []
  }, [q, businesses])
  return (
    <div className="mt-1 w-64 border border-gray-300 bg-white shadow-[var(--shadow-sm)]">
      <input
        autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        placeholder="Type a business name" aria-label={label}
        className="w-full px-2 py-1 text-sm border-b border-gray-200 focus:outline-none"
      />
      <ul role="listbox" aria-label="Businesses" className="max-h-48 overflow-y-auto">
        {matches.map((b) => (
          <li key={b.id}>
            <button onClick={() => onPick(b)} className="w-full text-left px-2 py-1 text-sm hover:bg-brand-warm">{b.name}</button>
          </li>
        ))}
        {q && matches.length === 0 && <li className="px-2 py-1 text-xs text-gray-500">No business by that name</li>}
      </ul>
      <div className="flex justify-end px-2 py-1 border-t border-gray-200">
        <button onClick={onCancel} className="text-xs text-gray-600 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

export function QboMatchList({ rows, businesses }: { rows: QboToMatch[]; businesses: { id: string; name: string }[] }) {
  const router = useRouter()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState<string | 'bulk' | null>(null)
  const [last, setLast] = useState<{ batch: string; text: string } | null>(null)
  const [pending, start] = useTransition()

  const allIds = rows.map((r) => r.qbo_customer_id)
  const allTicked = allIds.length > 0 && allIds.every((id) => ticked.has(id))
  const tickedRows = rows.filter((r) => ticked.has(r.qbo_customer_id))
  const withSuggestion = tickedRows.filter((r) => r.suggested_business_id)

  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const done = (r: QboMatchResult, what: string) => {
    if (r.error) return toast.error(`Could not save: ${r.error}`)
    if (r.ok > 0 && r.batch) setLast({ batch: r.batch, text: `${what} ${r.ok} ${r.ok === 1 ? 'customer' : 'customers'}.` })
    if (r.ok > 0) toast.success(`${what} ${r.ok} ${r.ok === 1 ? 'customer' : 'customers'}`)
    for (const f of r.failed.slice(0, 3)) toast.error(`${f.customer}: ${f.error}`)
    setTicked(new Set()); setPicking(null)
    router.refresh()
  }

  const confirm = (list: QboToMatch[]) => start(async () => {
    const pairs = list.filter((r) => r.suggested_business_id).map((r) => ({ customerId: r.qbo_customer_id, businessId: r.suggested_business_id! }))
    done(await matchQboCustomers(pairs), 'Matched')
  })
  const choose = (list: QboToMatch[], b: { id: string; name: string }) => start(async () => {
    done(await matchQboCustomers(list.map((r) => ({ customerId: r.qbo_customer_id, businessId: b.id }))), `Linked to ${b.name}:`)
  })
  const make = (list: QboToMatch[]) => start(async () => {
    done(await makeBusinessesFromQbo(list.map((r) => r.qbo_customer_id)), 'Made a business for')
  })
  const undo = () => last && start(async () => {
    const r = await undoQboMatch(last.batch)
    if (r.error) return toast.error(`Could not undo: ${r.error}`)
    toast.success(`Undone: ${r.links} links${r.businesses ? `, ${r.businesses} new businesses removed` : ''}${r.kept ? `, ${r.kept} new businesses kept (they now hold other records)` : ''}`)
    setLast(null)
    router.refresh()
  })

  const btn = 'px-2.5 py-1 text-sm border border-gray-300 rounded-sm bg-white hover:bg-brand-warm disabled:opacity-50 disabled:cursor-not-allowed'

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
          <input type="checkbox" checked={allTicked} onChange={() => setTicked(allTicked ? new Set() : new Set(allIds))} />
          Select all <span className="font-normal text-gray-600">({rows.length})</span>
        </label>
        <span className="text-sm text-gray-600" aria-live="polite">{tickedRows.length} ticked</span>
        <button className={btn} disabled={pending || withSuggestion.length === 0} onClick={() => confirm(withSuggestion)}>
          Confirm suggestion{withSuggestion.length > 0 ? ` (${withSuggestion.length})` : ''}
        </button>
        <div className="relative">
          <button className={btn} disabled={pending || tickedRows.length === 0} onClick={() => setPicking(picking === 'bulk' ? null : 'bulk')}>
            Choose business{tickedRows.length > 0 ? ` for ${tickedRows.length}` : ''}
          </button>
          {picking === 'bulk' && (
            <div className="absolute z-10 left-0">
              <BusinessPicker businesses={businesses} label="Business for the ticked customers" onCancel={() => setPicking(null)} onPick={(b) => choose(tickedRows, b)} />
            </div>
          )}
        </div>
        <button className={btn} disabled={pending || tickedRows.length === 0} onClick={() => make(tickedRows)}>
          Make new business{tickedRows.length > 0 ? ` (${tickedRows.length})` : ''}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">QuickBooks customers to match</caption>
          <thead>
            <tr className="bg-brand-warm text-left">
              <th scope="col" className="px-3 py-1.5 w-8"><span className="sr-only">Tick</span></th>
              <th scope="col" className="px-3 py-1.5 font-semibold">QuickBooks customer</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Invoices</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Suggested business</th>
              <th scope="col" className="px-3 py-1.5 font-semibold"><span className="sr-only">Fix</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.qbo_customer_id} className="border-t border-black/[0.06] align-top">
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={ticked.has(r.qbo_customer_id)} onChange={() => toggle(r.qbo_customer_id)} aria-label={`Tick ${r.customer_name}`} />
                </td>
                <th scope="row" className="px-3 py-1.5 text-left font-semibold">
                  {r.customer_name}
                  {r.customer_email && <span className="block font-normal text-xs text-gray-600">{r.customer_email}</span>}
                </th>
                <td className="px-3 py-1.5 text-gray-700">
                  {r.invoices_n} {r.invoices_n === 1 ? 'invoice' : 'invoices'}, {money(r.total_invoiced)}, last {dateGB(r.last_invoice_date)}
                  {r.open_balance > 0 && <span className="block text-red-700">{money(r.open_balance)} owed</span>}
                </td>
                <td className="px-3 py-1.5 text-gray-700">
                  {r.suggested_business_name
                    ? <>{r.suggested_business_name}<span className="block text-xs text-gray-600">{r.suggested_why}; check it is the same business</span></>
                    : <span className="text-gray-500">No suggestion</span>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {r.suggested_business_id && (
                      <button disabled={pending} onClick={() => confirm([r])} className="font-semibold text-brand-navy hover:underline">
                        Confirm<span className="sr-only"> {r.customer_name} is {r.suggested_business_name}</span>
                      </button>
                    )}
                    <span className="relative">
                      <button disabled={pending} onClick={() => setPicking(picking === r.qbo_customer_id ? null : r.qbo_customer_id)} className="font-semibold text-brand-navy hover:underline">
                        Choose business<span className="sr-only"> for {r.customer_name}</span>
                      </button>
                      {picking === r.qbo_customer_id && (
                        <div className="absolute z-10 right-0 text-left">
                          <BusinessPicker businesses={businesses} label={`Business for ${r.customer_name}`} onCancel={() => setPicking(null)} onPick={(b) => choose([r], b)} />
                        </div>
                      )}
                    </span>
                    <button disabled={pending} onClick={() => make([r])} className="font-semibold text-brand-navy hover:underline">
                      Make new business<span className="sr-only"> for {r.customer_name}</span>
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
