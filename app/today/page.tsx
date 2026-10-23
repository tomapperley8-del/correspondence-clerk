import { redirect } from 'next/navigation'
import { getTodayData } from '@/app/actions/today'
import { getCalendarItems, getNewsletterList } from '@/app/actions/calendar'
import { addDays } from '@/lib/today'
import { weekStart } from '@/lib/calendar'
import { TodayClient } from './_components/TodayClient'

// Today (UI overhaul Stage 7): the home page. `/` and sign-in come here, and
// /briefing, /todos and /attention redirect here.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Today — Correspondence Clerk',
}

export default async function TodayPage() {
  const result = await getTodayData()
  if (result.error === 'Unauthorized') redirect('/login')
  // Stage 12: the calendar's first week and the newsletter list come with the page.
  const start = result.data ? weekStart(result.data.today) : null
  const [calendar, newsletter] = start
    ? await Promise.all([getCalendarItems(start, addDays(start, 6)), getNewsletterList()])
    : [null, null]

  return (
    <div className="mx-auto px-4 py-8 max-w-[980px]">
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load Today: {result.error ?? 'no data'}</p>
      ) : (
        <TodayClient
          data={result.data}
          calendar={calendar?.data ?? []}
          newsletter={newsletter?.data ?? { wednesday: result.data.today, items: [] }}
        />
      )}
    </div>
  )
}
