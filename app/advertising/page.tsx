import { getAdvertisingTab } from '@/app/actions/advertising-tab'
import { AdvertisingTab } from './_components/AdvertisingTab'

// The Advertising tab (UI overhaul Stage 16d, layout B): renewals coming up
// and a card per advertiser. Takes over the advertisers' Renewals board from
// Businesses.

export const metadata = {
  title: 'Advertising — Correspondence Clerk',
}

export default async function AdvertisingPage({ searchParams }: { searchParams: Promise<{ show?: string; board?: string; view?: string }> }) {
  const [result, params] = await Promise.all([getAdvertisingTab(), searchParams])

  return (
    <div className="mx-auto px-4 py-8 max-w-[1400px]">
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
          Advertising
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Every advertiser: the deal, renewals, invoices, emails and coverage. Performance stats will join once their source is chosen.
        </p>
      </div>
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load the Advertising tab: {result.error ?? 'no data'}</p>
      ) : (
        <AdvertisingTab
          data={result.data}
          initialShow={params.show}
          initialView={params.board === '1' ? 'board' : params.view}
        />
      )}
    </div>
  )
}
