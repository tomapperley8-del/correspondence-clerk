import { redirect } from 'next/navigation'

// Retired in Stage 7 of the UI overhaul: Briefing is merged into Today. Prospect
// leads are the Leads view in Businesses; drafts show on each business page.

export default function BriefingRedirect() {
  redirect('/today')
}
