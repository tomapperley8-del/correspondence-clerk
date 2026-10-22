import { getBusinessTable } from '@/app/actions/business-table'
import { getProspectLeads } from '@/app/actions/leads'
import { getClubCardMembers } from '@/app/actions/club-card'
import { BusinessTable } from './_components/BusinessTable'

// The business table (UI overhaul Stage 5), one of the three places in the nav
// (Stage 7). Leads and the renewals and outreach boards are views here.

export const metadata = {
  title: 'Businesses — Correspondence Clerk',
}

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; board?: string }> }) {
  const [result, leadsResult, clubCardResult, params] = await Promise.all([
    getBusinessTable(),
    getProspectLeads().catch(() => ({ data: [], error: 'Could not load prospect leads' })),
    getClubCardMembers().catch(() => ({ error: 'Could not load the Club Card view' } as Awaited<ReturnType<typeof getClubCardMembers>>)),
    searchParams,
  ])

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
          initialBoard={params.board === '1'}
          leads={leadsResult.data ?? []}
          leadsError={leadsResult.error}
          clubCard={{ rows: clubCardResult.data ?? [], lastRun: clubCardResult.lastRun ?? null, toMatch: clubCardResult.toMatch ?? 0, error: clubCardResult.error }}
        />
      )}
    </div>
  )
}
