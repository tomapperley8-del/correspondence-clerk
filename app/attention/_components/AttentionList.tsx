'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import {
  snoozeBusinessAttention,
  dismissWaitingReplies,
  type AttentionReason,
  type AttentionRow,
} from '@/app/actions/attention'

const SECTIONS: { reason: AttentionReason; title: string; hint: string }[] = [
  { reason: 'money_owed', title: 'Money owed', hint: 'QuickBooks invoices past due, with no chaser in the last 7 days' },
  { reason: 'renewal', title: 'Renewals', hint: 'Ending in the next 45 days or ended in the last 60, with no outcome recorded' },
  { reason: 'waiting_on_you', title: 'Waiting on you', hint: 'They wrote in the last 30 days and nothing has gone back' },
  { reason: 'todo', title: 'Your to-dos', hint: 'Your own to-dos and follow-ups, due today or earlier' },
]

const REASON_LABEL: Record<AttentionReason, string> = {
  money_owed: 'Money owed',
  renewal: 'Renewal',
  waiting_on_you: 'Waiting on you',
  todo: 'To-do',
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

function whenText(row: AttentionRow, today: string): string | null {
  if (!row.since) return null
  const date = formatDateGB(`${row.since}T12:00:00Z`)
  const days = daysBetween(row.since, today)
  switch (row.reason) {
    case 'money_owed':
      return `Due ${date} (${days} day${days === 1 ? '' : 's'} ago)`
    case 'waiting_on_you':
      return days === 0 ? `Received today` : `Received ${date} (${days} day${days === 1 ? '' : 's'} ago)`
    case 'todo':
      return `Due ${date}`
    default:
      return null
  }
}

export function AttentionList({ rows, today }: { rows: AttentionRow[]; today: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showSnoozed, setShowSnoozed] = useState(false)

  const active = rows.filter((r) => !r.is_snoozed)
  const snoozed = rows.filter((r) => r.is_snoozed)

  function run(businessId: string, action: () => Promise<{ error?: string; success?: boolean }>, message: string) {
    setBusyId(businessId)
    startTransition(async () => {
      const result = await action()
      setBusyId(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(message)
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: 'rgba(0,0,0,0.6)' }}>Nothing needs your attention.</p>
  }

  return (
    <div className="space-y-8">
      {SECTIONS.map(({ reason, title, hint }) => {
        const items = active.filter((r) => r.reason === reason)
        if (items.length === 0) return null
        return (
          <section key={reason}>
            <h2 className="text-xl font-semibold mb-0.5" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
              {title} ({items.length})
            </h2>
            <p className="text-xs mb-3" style={{ color: 'rgba(0,0,0,0.5)' }}>{hint}</p>
            <ul className="divide-y divide-black/[0.06] border border-black/[0.06] bg-white">
              {items.map((row) => {
                const when = whenText(row, today)
                const others = row.reasons.filter((r) => r !== row.reason)
                const busy = pending && busyId === row.business_id
                return (
                  <li key={row.business_id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/businesses/${row.business_id}`}
                          className="font-semibold hover:underline"
                          style={{ color: 'var(--link-blue)' }}
                        >
                          {row.business_name}
                        </Link>
                        {row.is_overdue && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200">
                            Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-sm truncate" style={{ color: 'rgba(0,0,0,0.75)' }}>{row.detail}</p>
                      {(when || others.length > 0) && (
                        <p className="text-xs" style={{ color: 'rgba(0,0,0,0.5)' }}>
                          {when}
                          {when && others.length > 0 ? ' · ' : ''}
                          {others.length > 0 ? `Also: ${others.map((o) => REASON_LABEL[o]).join(', ')}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {row.reason === 'waiting_on_you' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(row.business_id, () => dismissWaitingReplies(row.business_id), `${row.business_name}: marked no reply needed`)}
                          className="text-xs px-2.5 py-1.5 border border-black/[0.12] hover:bg-brand-warm transition-colors disabled:opacity-50"
                        >
                          No reply needed
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(row.business_id, () => snoozeBusinessAttention(row.business_id, addDays(today, 7)), `${row.business_name} snoozed for 7 days`)}
                        className="text-xs px-2.5 py-1.5 border border-black/[0.12] hover:bg-brand-warm transition-colors disabled:opacity-50"
                      >
                        Snooze 7 days
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {snoozed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowSnoozed((v) => !v)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--link-blue)' }}
          >
            {showSnoozed ? 'Hide' : 'Show'} snoozed ({snoozed.length})
          </button>
          {showSnoozed && (
            <ul className="mt-3 divide-y divide-black/[0.06] border border-black/[0.06] bg-white">
              {snoozed.map((row) => (
                <li key={row.business_id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <Link href={`/businesses/${row.business_id}`} className="font-semibold hover:underline" style={{ color: 'var(--link-blue)' }}>
                      {row.business_name}
                    </Link>
                    <p className="text-xs" style={{ color: 'rgba(0,0,0,0.5)' }}>
                      {REASON_LABEL[row.reason]}: {row.detail} · snoozed until{' '}
                      {row.attention_snoozed_until ? formatDateGB(`${row.attention_snoozed_until}T12:00:00Z`) : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending && busyId === row.business_id}
                    onClick={() => run(row.business_id, () => snoozeBusinessAttention(row.business_id, null), `${row.business_name} is back on the list`)}
                    className="text-xs px-2.5 py-1.5 border border-black/[0.12] hover:bg-brand-warm transition-colors disabled:opacity-50 shrink-0"
                  >
                    Wake now
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
