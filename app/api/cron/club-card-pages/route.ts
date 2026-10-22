import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readSite, syncOrg } from '@/lib/club-card/sync'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * Club Card pages, nightly (UI overhaul Stage 6b). Vercel cron.
 *
 * Reads the public Club Card pages on chiswickcalendar.co.uk and the public
 * Club Card map, and updates club_card_pages. Free: no API key, no paid call.
 * Never writes to the website. Each run is recorded in club_card_sync_runs.
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

  let site: Awaited<ReturnType<typeof readSite>> | null = null
  let readError: string | null = null
  try {
    site = await readSite()
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e)
  }

  const results = []
  for (const org of orgs ?? []) {
    let result
    try {
      if (!site) throw new Error(`could not read the website: ${readError}`)
      result = await syncOrg(supabase, org.id, site)
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    await supabase.from('club_card_sync_runs').insert({
      organization_id: org.id,
      ok: result.ok,
      pages_seen: 'pages_seen' in result ? result.pages_seen : null,
      pages_new: 'pages_new' in result ? result.pages_new : null,
      pages_gone: 'pages_gone' in result ? result.pages_gone : null,
      auto_matched: 'auto_matched' in result ? result.auto_matched : null,
      problems: site?.problems ?? {},
      error: result.error ?? null,
    })
    results.push({ org: org.id, ...result })
  }
  if (readError) console.error('[club-card-pages]', readError)
  return NextResponse.json({ results, problems: site?.problems ?? null }, { status: readError ? 502 : 200 })
}
