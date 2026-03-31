import { redirect } from 'next/navigation'

// The Daily Briefing has been replaced by Insights.
// Redirect any bookmarked links.
export default function DailyBriefingPage() {
  redirect('/insights')
}
