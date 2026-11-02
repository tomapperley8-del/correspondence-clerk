'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import {
  fileSentMailToBusiness, ignoreSentMail, undoSentMailBatch, type SentMailToReview,
} from '@/app/actions/sent-mail-review'
import { BusinessPicker } from './QboMatchList'

// Sent email to review (Stage 17b): tick recipients, then Choose business (files their emails there) or Ignore.
// Each row also has its own two buttons. The last change can be undone from the bar at the top.

export function SentMailList({ rows, businesses }: { rows: SentMailToReview[]; businesses: { id: string; name: string }[] }) {
  const router = useRouter()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState<string | 'bulk' | null>(null)
  const [last, setLast] = useState<{ batch: string; text: string } | null>(null)
  const [pending, start] = useTransition()

  const all = rows.map((r) => r.recipient)
  const allTicked = all.length > 0 && all.every((k) => ticked.has(k))
  const tickedKeys = all.filter((k) => ticked.has(k))
  const toggle = (k: string) => setTicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const done = (r: { ok: number; batch?: string; error?: string }, text: string) => {
    if (r.error) return toast.error(`Could not save: ${r.error}`)
    if (r.batch) setLast({ batch: r.batch, text })
    toast.success(text)
    setTicked(new Set()); setPicking(null)
    router.refresh()
  }
  const file = (keys: string[], b: { id: string; name: string }) => start(async () => {
    const r = await fileSentMailToBusiness(keys, b.id)
    done(r, `Filed ${r.ok} sent ${r.ok === 1 ? 'email' : 'emails'} to ${b.name}.`)
  })
  const ignore = (keys: string[]) => start(async () => {
    const r = await ignoreSentMail(keys)
    done(r, `Ignored ${r.ok} sent ${r.ok === 1 ? 'email' : 'emails'}.`)
  })
  const undo = () => last && start(async () => {
    const r = await undoSentMailBatch(last.batch)
    if (r.error) return toast.error(`Could not undo: ${r.error}`)
    toast.success(`Undone: ${r.emails} filed ${r.emails === 1 ? 'email' : 'emails'} removed${r.contacts ? `, ${r.contacts} new contacts removed` : ''}${r.kept ? `, ${r.kept} new contacts kept (they now hold other records)` : ''}`)
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
          <input type="checkbox" checked={allTicked} onChange={() => setTicked(allTicked ? new Set() : new Set(all))} />
          Select all <span className="font-normal text-gray-600">({rows.length})</span>
        </label>
        <span className="text-sm text-gray-600" aria-live="polite">{tickedKeys.length} ticked</span>
        <div className="relative">
          <button className={btn} disabled={pending || tickedKeys.length === 0} onClick={() => setPicking(picking === 'bulk' ? null : 'bulk')}>
            Choose business{tickedKeys.length > 0 ? ` for ${tickedKeys.length}` : ''}
          </button>
          {picking === 'bulk' && (
            <div className="absolute z-10 left-0">
              <BusinessPicker businesses={businesses} label="Business for the ticked recipients" onCancel={() => setPicking(null)} onPick={(b) => file(tickedKeys, b)} />
            </div>
          )}
        </div>
        <button className={btn} disabled={pending || tickedKeys.length === 0} onClick={() => ignore(tickedKeys)}>
          Ignore{tickedKeys.length > 0 ? ` (${tickedKeys.length})` : ''}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">Sent email to review</caption>
          <thead>
            <tr className="bg-brand-warm text-left">
              <th scope="col" className="px-3 py-1.5 w-8"><span className="sr-only">Tick</span></th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Sent to</th>
              <th scope="col" className="px-3 py-1.5 font-semibold">Emails</th>
              <th scope="col" className="px-3 py-1.5 font-semibold"><span className="sr-only">Fix</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.recipient} className="border-t border-black/[0.06] align-top">
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={ticked.has(r.recipient)} onChange={() => toggle(r.recipient)} aria-label={`Tick ${r.recipient}`} />
                </td>
                <th scope="row" className="px-3 py-1.5 text-left font-semibold">
                  {r.recipient_name || r.recipient}
                  {r.recipient_name && <span className="block font-normal text-xs text-gray-600">{r.recipient}</span>}
                </th>
                <td className="px-3 py-1.5 text-gray-700">
                  {r.n} sent, last {r.last_sent ? formatDateGB(r.last_sent) : ''}
                  {(r.subjects ?? []).map((s) => <span key={s} className="block text-xs text-gray-600">{s}</span>)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    <span className="relative">
                      <button disabled={pending} onClick={() => setPicking(picking === r.recipient ? null : r.recipient)} className="font-semibold text-brand-navy hover:underline">
                        Choose business<span className="sr-only"> for {r.recipient}</span>
                      </button>
                      {picking === r.recipient && (
                        <div className="absolute z-10 right-0 text-left">
                          <BusinessPicker businesses={businesses} label={`Business for ${r.recipient}`} onCancel={() => setPicking(null)} onPick={(b) => file([r.recipient], b)} />
                        </div>
                      )}
                    </span>
                    <button disabled={pending} onClick={() => ignore([r.recipient])} className="font-semibold text-brand-navy hover:underline">
                      Ignore<span className="sr-only"> {r.recipient}</span>
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
