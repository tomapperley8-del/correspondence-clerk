import { getClubCardTab } from '@/app/actions/club-card-tab'
import { ClubCardTab } from './_components/ClubCardTab'

// The Club Card tab (UI overhaul Stage 16b): members, their website pages,
// renewals and coverage in one place. Replaces the Club Card view in
// Businesses and the Club Card half of the Renewals board.

export const metadata = {
  title: 'Club Card — Correspondence Clerk',
}

export default async function ClubCardPage({ searchParams }: { searchParams: Promise<{ show?: string; b?: string; q?: string }> }) {
  const [result, params] = await Promise.all([getClubCardTab(), searchParams])

  return (
    <div className="mx-auto px-4 py-8 max-w-[1500px]">
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
          Club Card
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Every member, their website page and offer, the card, renewals and coverage. The website is read every night; fix it yourself in WordPress.
        </p>
      </div>
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load the Club Card tab: {result.error ?? 'no data'}</p>
      ) : (
        <ClubCardTab data={result.data} initialShow={params.show} initialBusiness={params.b} initialQuery={params.q} />
      )}
    </div>
  )
}
