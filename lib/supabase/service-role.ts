import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with service role key.
 * Use only in server-side code where no user session is available
 * (cron jobs, OAuth callbacks before redirect).
 * Bypasses RLS — never expose to client.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
