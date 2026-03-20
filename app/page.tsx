import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { LandingPage } from '@/components/marketing'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If user is logged in, redirect to dashboard
  if (user) {
    redirect('/dashboard')
  }

  // If landing page feature is enabled, show the landing page
  if (isFeatureEnabled('landingPage')) {
    return <LandingPage />
  }

  // Otherwise, redirect to login (original behavior)
  redirect('/login')
}
