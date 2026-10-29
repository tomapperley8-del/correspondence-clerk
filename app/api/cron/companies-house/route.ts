import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { readCompaniesHouseW4 } from '@/lib/prospecting/companies-house-w4'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Companies House W4 reader, weekly (UI overhaul Stage 16c2). Vercel cron, Monday morning.
 * New W4 companies in useful trades become prospect leads (Leads to accept on /outreach).
 * Free API, no AI. Also callable by a logged-in user to run it now.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const isCron = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  if (!isCron) {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const run = await readCompaniesHouseW4(createServiceRoleClient())
  return NextResponse.json(run, { status: run.ok ? 200 : 500 })
}
