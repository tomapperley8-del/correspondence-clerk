import { getListings } from '@/app/actions/listings'
import { ListingsTab } from './_components/ListingsTab'

// The Listings tab (UI overhaul Stage 20, layout A): every What's On listing request, when it
// went to Cleo, her reply, and whether it is live on the website.

export const metadata = {
  title: 'Listings — Correspondence Clerk',
}

// "Check the website now" runs the nightly read from this page.
export const maxDuration = 120

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [result, params] = await Promise.all([getListings(), searchParams])

  return (
    <div className="mx-auto px-4 py-4 max-w-[1400px]">
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
          Listings
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          What&apos;s On requests: Promote my Event forms and emails asking to be listed. When each went to Cleo, her reply, and whether it is live on chiswickcalendar.co.uk.
        </p>
      </div>
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load the listings: {result.error ?? 'no data'}</p>
      ) : (
        <ListingsTab data={result.data} initialView={params.view} />
      )}
    </div>
  )
}
