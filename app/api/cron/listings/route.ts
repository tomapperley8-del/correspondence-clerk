import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { syncAndRecord } from '@/lib/listings/sync'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * What's On listings, nightly (UI overhaul Stage 20). Vercel cron, 02:40 UTC.
 *
 * Works out each listing request from the emails in correspondence and reads the public
 * events calendar on chiswickcalendar.co.uk to see whether it is live. Free: no API key,
 * no paid call, no AI. Never writes to the website. Each run is recorded in listing_sync_runs.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: orgs, error } = await supabase.from('organizations').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const org of orgs ?? []) {
    results.push({ org: org.id, ...(await syncAndRecord(supabase, org.id)) })
  }
  const failed = results.some((r) => !r.ok)
  if (failed) console.error('[listings]', results.filter((r) => !r.ok).map((r) => r.error))
  return NextResponse.json({ results }, { status: failed ? 502 : 200 })
}
