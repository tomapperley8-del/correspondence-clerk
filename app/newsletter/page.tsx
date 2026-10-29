import { getNewsletterTab } from '@/app/actions/newsletter-tab'
import { getNewsletterList } from '@/app/actions/calendar'
import { NewsletterTab } from './_components/NewsletterTab'

// The Newsletter tab (UI overhaul Stage 16a, layout B): a strip of Wednesdays,
// the next issue's list (the same list as Today), and views for contributors,
// freebies, Club Card, deal promises, markets, every item and mentions to check.

export const metadata = {
  title: 'Newsletter — Correspondence Clerk',
}

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ view?: string; issue?: string }> }) {
  const [result, next, params] = await Promise.all([getNewsletterTab(), getNewsletterList(), searchParams])

  return (
    <div className="mx-auto px-4 py-8 max-w-[1400px]">
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
          Newsletter
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Every Wednesday issue split into its items, who writes for it, what deals promise, and who is due a mention. Read from the Mailchimp archive each Wednesday.
        </p>
      </div>
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load the Newsletter tab: {result.error ?? 'no data'}</p>
      ) : (
        <NewsletterTab
          data={result.data}
          next={next.data ?? { wednesday: result.data.today, items: [] }}
          initialView={params.view}
          initialIssue={params.issue}
        />
      )}
    </div>
  )
}
