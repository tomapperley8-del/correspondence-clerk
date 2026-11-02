'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import {
  runCompanyLookup, confirmCompanies, rejectCompanies, undoCompanyReview,
  type CompanyOverview, type CompanyMatch, type CompanyReviewResult,
} from '@/app/actions/companies-house'

// Companies House (Stage 17b (3)): the "Look up companies now" button with the counts, and under it the
// matches that need a person (tick, Confirm / Not this company, Undo the last change).

const btn = 'px-2.5 py-1 text-sm border border-gray-300 rounded-sm bg-white hover:bg-brand-warm disabled:opacity-50 disabled:cursor-not-allowed'

export function CompanyLookup({ overview }: { overview: CompanyOverview }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const run = async () => {
    setBusy(true)
    let attached = 0
    let suggested = 0
    let looked = 0
    try {
      for (let i = 0; i < 40; i++) {
        const r = await runCompanyLookup()
        attached += r.attached; suggested += r.suggested; looked += r.looked
        setStatus(`Looked up ${looked}; ${r.remaining} to go…`)
        if (r.error) { toast.error(`Stopped: ${r.error}`); break }
        if (r.remaining === 0 || r.looked === 0) break
      }
      toast.success(`Looked up ${looked}: ${attached} attached, ${suggested} to confirm`)
      setStatus('')
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <button className={btn} onClick={run} disabled={busy || overview.waiting === 0}>
        {busy ? 'Looking up…' : 'Look up companies now'}
      </button>
      <span className="text-gray-700" aria-live="polite">
        {status || `${overview.records} with a company record, ${overview.waiting} Active, Former or Unreviewed not yet looked up, ${overview.toConfirm} to confirm`}
        {overview.notTrading > 0 && `, ${overview.notTrading} not trading but still active`}
      </span>
    </div>
  )
}

export function CompanyMatchList({ rows }: { rows: CompanyMatch[] }) {
  const router = useRouter()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [last, setLast] = useState<{ batch: string; text: string } | null>(null)
  const [pending, start] = useTransition()

  const ids = rows.map((r) => r.candidate_id)
  const allTicked = ids.length > 0 && ids.every((id) => ticked.has(id))
  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const done = (r: CompanyReviewResult, what: string) => {
    if (r.error) return toast.error(`Could not save: ${r.error}`)
    if (r.ok > 0 && r.batch) setLast({ batch: r.batch, text: `${what} ${r.ok}.` })
    if (r.ok > 0) toast.success(`${what} ${r.ok}`)
    for (const f of r.failed.slice(0, 3)) toast.error(`${f.company}: ${f.error}`)
    setTicked(new Set())
    router.refresh()
  }
  const confirm = (list: string[]) => start(async () => done(await confirmCompanies(list), 'Confirmed'))
  const reject = (list: string[]) => start(async () => done(await rejectCompanies(list), 'Marked not this company:'))
  const undo = () => last && start(async () => {
    const r = await undoCompanyReview(last.batch)
    if (r.error) return toast.error(`Could not undo: ${r.error}`)
    toast.success(`Undone: ${r.records} company records removed`)
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
          Not this company{tickedList.length > 0 ? ` (${tickedList.length})` : ''}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">Companies House matches to confirm</caption>
          <thead>
            <tr className="bg-brand-warm text-left">
              <th scope="col" className="px-3 py-1.5 w-8"><span className="sr-only">Tick</span></th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Business</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Company on the register</th>
              <th scope="col" className="px-3 py-1.5 font-semibold"><span className="sr-only">Fix</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.candidate_id} className="border-t border-black/[0.06] align-top">
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={ticked.has(r.candidate_id)} onChange={() => toggle(r.candidate_id)} aria-label={`Tick ${r.business_name}: ${r.company_name}`} />
                </td>
                <th scope="row" className="px-3 py-1.5 text-left font-semibold">{r.business_name}</th>
                <td className="px-3 py-1.5 text-gray-700">
                  <a href={`https://find-and-update.company-information.service.gov.uk/company/${r.company_number}`} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--link-blue)' }}>
                    {r.company_name}
                  </a>{' '}
                  <span className="text-gray-600">({r.company_number}{r.company_status ? `, ${r.company_status}` : ''})</span>
                  {r.registered_office && <span className="block text-xs text-gray-600">{r.registered_office}</span>}
                  {r.why && <span className="block text-xs text-gray-600">{r.why}; check it is the same business</span>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    <button disabled={pending} onClick={() => confirm([r.candidate_id])} className="font-semibold text-brand-navy hover:underline">
                      Confirm<span className="sr-only"> {r.company_name} is {r.business_name}</span>
                    </button>
                    <button disabled={pending} onClick={() => reject([r.candidate_id])} className="font-semibold text-brand-navy hover:underline">
                      Not this company<span className="sr-only"> for {r.business_name}</span>
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
