import { getTeamForwardReview } from '@/app/actions/team-forwards'
import { TeamForwardsClient } from './TeamForwardsClient'

// Stage 18: emails the team forwarded in that are still on the team member's record.
// Reached from Data health. Nothing moves on its own here.

export const metadata = {
  title: 'Team forwards — Correspondence Clerk',
}

export default async function TeamForwardsPage() {
  const result = await getTeamForwardReview()
  return (
    <div className="mx-auto px-4 py-4 max-w-[1200px]">
      <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
        Team forwards
      </h1>
      <p className="text-sm mb-4" style={{ color: 'rgba(0,0,0,0.5)' }}>
        Emails Cleo, Bridget or another team member forwarded in, still filed under them. Each shows who first wrote.
        Move it to that business, or keep it where it is. New forwards are filed under the original sender automatically.
      </p>
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load the forwards: {result.error ?? 'no data'}</p>
      ) : (
        <TeamForwardsClient suggested={result.data.suggested} unclear={result.data.unclear} />
      )}
    </div>
  )
}
