import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { lookUpBatch, refreshStale } from '@/lib/prospecting/companies-house-records'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Companies House records for our own businesses (UI overhaul Stage 17b (3)). Daily: re-reads the stalest
 * records (a record is re-read once it is a week old, so each is current within about a week), then searches
 * for any in-scope business not yet looked up. Free API, no AI. Also callable by a logged-in user.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const isCron = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  if (!isCron) {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const supabase = createServiceRoleClient()
  let error: string | undefined
  let refreshed = { refreshed: 0, failed: 0 } as Awaited<ReturnType<typeof refreshStale>>
  let looked = { looked: 0, attached: 0, suggested: 0, remaining: 0 } as Awaited<ReturnType<typeof lookUpBatch>>
  try {
    refreshed = await refreshStale(supabase, 40000)
    error = refreshed.error
    const left = 52000 - (Date.now() - started)
    if (!error && left > 8000) {
      looked = await lookUpBatch(supabase, { budgetMs: left })
      error = looked.error
    }
  } catch (e) {
    error = (e as Error).message
  }
  await supabase.from('scraper_logs').insert({
    scraper_type: 'prospecting',
    sources_checked: ['Companies House records'],
    leads_created: 0,
    errors: error ? [{ source: 'Companies House records', error }] : [],
    duration_seconds: Math.round((Date.now() - started) / 1000),
  })
  return NextResponse.json({ ok: !error, refreshed, looked, error }, { status: error ? 500 : 200 })
}
