import { redirect } from 'next/navigation'

// Retired in Stage 7 of the UI overhaul. To-dos live on Today; the Contracts
// and Outreach boards are views in Businesses. Old links (the desk email,
// bookmarks, routines) still land in the right place.

export default async function TodosRedirect({ searchParams }: { searchParams: Promise<{ view?: string; tab?: string }> }) {
  const { view, tab } = await searchParams
  const which = view ?? tab
  if (which === 'contracts' || which === 'renewals') redirect('/advertising?board=1')
  if (which === 'outreach') redirect('/outreach?board=1')
  redirect('/today')
}
