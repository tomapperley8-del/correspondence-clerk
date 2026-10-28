import { getBusinessTable } from '@/app/actions/business-table'
import { redirect } from 'next/navigation'
import { BusinessTable } from './_components/BusinessTable'

// The business table (UI overhaul Stage 5), one of the three places in the nav
// (Stage 7). Leads and the outreach pipeline are on the Outreach tab (Stage
// 16c), the advertisers' Renewals board on the Advertising tab (Stage 16d).

export const metadata = {
  title: 'Businesses — Correspondence Clerk',
}

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; board?: string }> }) {
  const params = await searchParams
  // The Club Card view moved to its own tab (Stage 16b); old links follow it.
  if (params.view === 'club_card') redirect('/club-card')
  // Leads and the Outreach view and board moved to the Outreach tab (Stage 16c).
  if (params.view === 'leads') redirect('/outreach')
  if (params.view === 'outreach') redirect(params.board === '1' ? '/outreach?board=1' : '/outreach')
  // The advertisers' Renewals board moved to the Advertising tab (Stage 16d).
  if (params.view === 'renewals' && params.board === '1') redirect('/advertising?board=1')
  const result = await getBusinessTable()

  return (
    <div className="mx-auto px-4 py-8 max-w-[1400px]">
      <div className="mb-5">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}
        >
          Businesses
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          One line per business: main contact, deal, last time in touch and anything needing attention. Click a name to open the business.
        </p>
      </div>

      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load the table: {result.error ?? 'no data'}</p>
      ) : (
        <BusinessTable
          data={result.data}
          initialView={params.view}
          initialQuery={params.q}
        />
      )}
    </div>
  )
}
