import { redirect } from 'next/navigation'
import { getTodayData } from '@/app/actions/today'
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

  return (
    <div className="mx-auto px-4 py-8 max-w-[980px]">
      {result.error || !result.data ? (
        <p className="text-sm text-red-700">Could not load Today: {result.error ?? 'no data'}</p>
      ) : (
        <TodayClient data={result.data} />
      )}
    </div>
  )
}
