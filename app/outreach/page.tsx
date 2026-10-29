import { getOutreachTab } from '@/app/actions/outreach-tab'
import { getOutreachNext } from '@/app/actions/outreach-next'
import { OutreachTab } from './_components/OutreachTab'

// The Outreach tab (UI overhaul Stage 16c, laid out as a workspace in 16c3): Work on next,
// leads, the outreach routine's drafts, suggestions, the pipeline and results on one page.
// Replaces the Leads and Outreach views and the Outreach board in Businesses.

export const metadata = {
  title: 'Outreach — Correspondence Clerk',
}

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ stage?: string; board?: string; q?: string }> }) {
  const [result, next, params] = await Promise.all([getOutreachTab(), getOutreachNext(), searchParams])

  return (
    <div className="mx-auto px-4 py-6 max-w-[1400px]">
      {result.error || !result.data ? (
        <>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
            Outreach
          </h1>
          <p className="text-sm text-red-700">Could not load the Outreach tab: {result.error ?? 'no data'}</p>
        </>
      ) : (
        <OutreachTab data={result.data} next={next.data ?? null} nextError={next.error} initialStage={params.stage} initialBoard={params.board === '1'} initialQuery={params.q} />
      )}
    </div>
  )
}
