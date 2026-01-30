import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Verify user is authenticated and has admin role.
 * Redirects to login if not authenticated, or dashboard if not admin.
 * Use in server components protecting admin routes.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard?error=unauthorized')
  }

  return user
}

/**
 * Check if the current user is an admin without redirecting.
 * Use in server actions where you want to return an error instead of redirect.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return false
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin'
}
