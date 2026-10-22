import { redirect } from 'next/navigation'

// Retired in Stage 7 of the UI overhaul: Needs attention is merged into Today.

export default function AttentionRedirect() {
  redirect('/today')
}
