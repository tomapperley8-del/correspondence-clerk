import type { RoutineDraft } from '@/app/actions/leads'

const KIND_LABEL: Record<string, string> = {
  renewal: 'Renewal',
  overdue: 'Payment chaser',
  checkin: 'Check-in',
  outreach: 'New business',
}

function formatDateGB(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Everything the routines have done for this business in the last year: the
 * drafts they wrote (and whether Tom sent them, and whether they answered) and
 * the times they looked and held back, with why. The same rows feed the home
 * page and the morning desk email.
 */
export function BusinessDrafts({ drafts }: { drafts: RoutineDraft[] }) {
  if (drafts.length === 0) return null

  return (
    <div className="mb-6 border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-brand-dark mb-2">Drafts and decisions by the routines</h2>
      <ul className="divide-y divide-gray-100">
        {drafts.map(d => {
          const status = d.outcome === 'skipped'
            ? `Held back${d.snooze_until ? ` until ${formatDateGB(d.snooze_until)}` : ''}`
            : d.replied_at
              ? `Sent ${formatDateGB(d.sent_at ?? d.created_at)}, they replied ${formatDateGB(d.replied_at)}`
              : d.sent_at
                ? `Sent ${formatDateGB(d.sent_at)}`
                : 'Waiting in your Outlook Drafts'
          return (
            <li key={d.id} className="py-2 text-sm">
              <p className="text-gray-800">
                <span className="font-medium">{KIND_LABEL[d.kind] ?? d.kind}</span>
                <span className="text-gray-400"> · {formatDateGB(d.created_at)}</span>
                {d.subject && <span className="text-gray-500"> · {d.subject}</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {status}
                {d.reason && ` · ${d.reason}`}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
