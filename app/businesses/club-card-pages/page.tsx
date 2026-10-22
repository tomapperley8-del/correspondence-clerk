import Link from 'next/link'
import { getClubCardReview } from '@/app/actions/club-card'
import { ClubCardReview } from './_components/ClubCardReview'

// Matching Club Card pages to businesses (UI overhaul Stage 6b). The nightly
// read of the website suggests a business for each page; Tom confirms or fixes it.

export const metadata = {
  title: 'Club Card pages — Correspondence Clerk',
}

export default async function ClubCardPagesPage() {
  const result = await getClubCardReview()

  return (
    <div className="mx-auto px-4 py-8 max-w-[1100px]">
      <div className="mb-5">
        <p className="text-sm mb-2">
          <Link href="/businesses?view=club_card" className="text-brand-navy hover:underline">← Club Card view</Link>
        </p>
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
          Match Club Card pages
        </h1>
        <p className="text-sm text-gray-600 max-w-3xl">
          Each member page on the website, read every night. Say which business it belongs to, so its offer, edit date and
          problems show on that business. Suggestions come from the page&apos;s name, phone, website and postcode. Nothing is
          changed on the website.
        </p>
      </div>
      {result.error || !result.pages ? (
        <p className="text-sm text-red-700">Could not load the pages: {result.error ?? 'no data'}</p>
      ) : result.pages.length === 0 ? (
        <p className="text-sm text-gray-500">No pages yet. They appear after the nightly read of the website.</p>
      ) : (
        <ClubCardReview pages={result.pages} businesses={result.businesses ?? []} />
      )}
    </div>
  )
}
