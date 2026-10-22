import { getBusinessTable } from '@/app/actions/business-table'
import { BusinessTable } from './_components/BusinessTable'

// The business table (UI overhaul Stage 5). On its own route for now; the home
// page stays as it is until Tom switches it over.

export const metadata = {
  title: 'Businesses — Correspondence Clerk',
}

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const [result, params] = await Promise.all([getBusinessTable(), searchParams])

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
        <BusinessTable data={result.data} initialView={params.view} initialQuery={params.q} />
      )}
    </div>
  )
}
