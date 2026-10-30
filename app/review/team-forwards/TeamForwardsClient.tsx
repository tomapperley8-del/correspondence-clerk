'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FoldSection } from '@/components/ui/fold-section'
import { MoveCorrespondenceModal } from '@/app/businesses/[id]/_components/MoveCorrespondenceModal'
import { keepWithTeamMember } from '@/app/actions/team-forwards'
import type { TeamForwardMove, TeamForwardReview } from '@/lib/inbound/team-forwards'
import { formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'

type Row = (TeamForwardMove | TeamForwardReview) & { note: string }

export function TeamForwardsClient({ suggested, unclear }: { suggested: TeamForwardMove[]; unclear: TeamForwardReview[] }) {
  const router = useRouter()
  const [moving, setMoving] = useState<Row | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const keep = async (r: Row) => {
    setBusy(r.id)
    const res = await keepWithTeamMember(r.id)
    setBusy(null)
    if (res.error) toast.error(res.error)
    else { toast.success(`Kept with ${r.team_name}`); router.refresh() }
  }

  const list = (rows: Row[]) => (
    <ul className="divide-y divide-gray-200">
      {rows.map((r) => (
        <li key={r.id} className="py-3 flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-brand-dark">{r.subject || '(No subject)'}</div>
            <div className="text-xs text-gray-600">
              {formatDateGB(`${r.date}T12:00:00Z`)} · on {r.team_name} · first written by {r.sender}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">{r.note}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/businesses/${r.team_business_id}`} className="text-xs px-2 py-1 border border-gray-300 rounded-sm hover:bg-gray-50">
              Open on {r.team_name}
            </Link>
            <button type="button" className="text-xs px-2 py-1 bg-brand-navy text-white rounded-sm hover:bg-brand-navy-hover" onClick={() => setMoving(r)}>
              Move to business
            </button>
            <button type="button" disabled={busy === r.id} className="text-xs px-2 py-1 border border-gray-300 rounded-sm hover:bg-gray-50 disabled:opacity-50" onClick={() => keep(r)}>
              Keep with {r.team_name}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )

  const suggestedRows: Row[] = suggested.map((m) => ({ ...m, note: `Suggested: ${m.to_name} (${m.sender} is a contact there)` }))
  const unclearRows: Row[] = unclear.map((r) => ({
    ...r,
    note: r.candidates.length ? `${r.why}: ${r.candidates.map((c) => c.name).join(', ')}` : `${r.why}`,
  }))

  return (
    <div className="space-y-4">
      {suggestedRows.length === 0 && unclearRows.length === 0 && (
        <p className="text-sm text-gray-600">Nothing to sort: every forward is filed under the business that first wrote.</p>
      )}
      {suggestedRows.length > 0 && (
        <FoldSection big band="outreach" storageKey="team-forwards-suggested" title="Sender found at one business" count={suggestedRows.length} defaultOpen>
          {list(suggestedRows)}
        </FoldSection>
      )}
      {unclearRows.length > 0 && (
        <FoldSection big band="neutral" storageKey="team-forwards-unclear" title="Not clear where it belongs" count={unclearRows.length} defaultOpen>
          {list(unclearRows)}
        </FoldSection>
      )}
      {moving && (
        <MoveCorrespondenceModal
          correspondenceId={moving.id}
          currentBusinessId={moving.team_business_id}
          onClose={() => { setMoving(null); router.refresh() }}
        />
      )}
    </div>
  )
}
