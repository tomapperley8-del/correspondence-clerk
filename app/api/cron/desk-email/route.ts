import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildDeskEmail, WORK_ON_NEXT_BUCKETS, type CareGap, type ClosedItem, type DeskLine, type DraftItem, type DeskTabs } from '@/lib/email/desk-email'
import { loadTodayCore, loadSystemMisses } from '@/lib/today-source'
import { loadMentionQueue } from '@/lib/newsletter/due'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const TO = process.env.DESK_EMAIL_TO || 'tom@thechiswickcalendar.co.uk'
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@correspondenceclerk.com'

/**
 * Morning desk email. Vercel cron, daily.
 *
 * 1. run_morning_pipeline(): QuickBooks to CRM, task engine refresh, automatic
 *    task closing and prospect matching, all in SQL.
 * 2. Read the desk views and send one email to Tom. No AI involved. The work
 *    list is Today's own (lib/today-source.ts), so the email matches the app.
 *
 * ?dry=1 returns the email instead of sending it.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const supabase = createServiceRoleClient()
  const now = new Date()

  // Dry runs never write, so they skip the pipeline.
  let pipeline: Record<string, unknown> | null = null
  if (!dry) {
    const { data, error } = await supabase.rpc('run_morning_pipeline')
    if (error) console.error('[desk-email] pipeline error:', error.message)
    else pipeline = data as Record<string, unknown>
  }

  // Today's list for the organisation (one organisation; DESK_EMAIL_ORG_ID picks one if there are more)
  let orgId = process.env.DESK_EMAIL_ORG_ID ?? null
  if (!orgId) {
    const { data: org } = await supabase.from('organizations').select('id').order('created_at').limit(1).maybeSingle()
    orgId = org?.id ?? null
  }
  if (!orgId) return NextResponse.json({ error: 'No organisation found' }, { status: 500 })
  let todayCore: Awaited<ReturnType<typeof loadTodayCore>>
  try {
    todayCore = await loadTodayCore(supabase, orgId)
  } catch (e) {
    console.error('[desk-email] Today read error:', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const [linesRes, briefRes, healthRes, closedRes, draftsRes, gapsRes, letGoRes, system, tabs] = await Promise.all([
    supabase.from('v_morning_desk').select('section, heading, sort, line, is_priority'),
    supabase.from('v_daily_brief').select('*').maybeSingle(),
    supabase.from('v_system_health').select('*').maybeSingle(),
    supabase
      .from('task_evidence')
      .select('summary, signal_key, tasks!inner(title)')
      .eq('action', 'closed')
      .gte('observed_at', since)
      .order('observed_at', { ascending: true }),
    supabase
      .from('routine_drafts')
      .select('kind, outcome, recipient, reason, sent_at, bump_count, bumped_at, business_id, businesses(name)')
      .or(`created_at.gte.${new Date(now.getTime() - 26 * 3_600_000).toISOString()},bumped_at.gte.${new Date(now.getTime() - 26 * 3_600_000).toISOString()}`)
      .order('created_at', { ascending: true }),
    supabase.from('v_care_gaps').select('severity, gap, detail').order('severity'),
    supabase.from('care_exclusions').select('business_id').eq('kind', 'all'),
    // Stage 18: the system alarm, and the tabs' lists from the tabs' own sources
    loadSystemMisses(supabase),
    loadDeskTabs(supabase, orgId, todayCore.today),
  ])

  const firstError = [linesRes, briefRes, healthRes, closedRes, draftsRes, gapsRes].find(r => r.error)?.error
  if (firstError) {
    console.error('[desk-email] read error:', firstError.message)
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  const closed: ClosedItem[] = (closedRes.data ?? []).map(r => {
    const task = r.tasks as unknown as { title: string } | { title: string }[]
    const title = Array.isArray(task) ? task[0]?.title : task?.title
    return { title: title ?? '(task)', summary: r.summary ?? '', hand_written: r.signal_key == null }
  })

  // Businesses Tom has told us to stop writing to drop out of the list, even if
  // an unsent draft from before the decision is still sitting in Outlook.
  const letGo = new Set((letGoRes.data ?? []).map(r => r.business_id))
  const draftRows = (draftsRes.data ?? []).filter(r => !letGo.has(r.business_id))
  const drafts: DraftItem[] = draftRows
    .filter(r => r.outcome === 'drafted' && !r.sent_at)
    .map(r => {
      const biz = r.businesses as unknown as { name: string } | { name: string }[] | null
      const name = Array.isArray(biz) ? biz[0]?.name : biz?.name
      return {
        kind: r.kind,
        business: name ?? '(business)',
        recipient: r.recipient,
        reason: r.reason,
        bumps: typeof r.bump_count === 'number' ? r.bump_count : 0,
      }
    })
  const skippedCount = draftRows.filter(r => r.outcome === 'skipped').length

  const email = buildDeskEmail({
    now,
    lines: (linesRes.data ?? []) as DeskLine[],
    brief: briefRes.data,
    health: healthRes.data,
    closed,
    system,
    pipeline,
    drafts,
    skippedCount,
    gaps: (gapsRes.data ?? []) as CareGap[],
    today: { date: todayCore.today, items: todayCore.items },
    tabs: tabs ?? undefined,
  })

  if (dry) {
    return new NextResponse(email.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-subject': email.subject } })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 })
  }
  const { error: sendError } = await new Resend(apiKey).emails.send({
    from: `Correspondence Clerk <${FROM}>`,
    to: TO,
    subject: email.subject,
    html: email.html,
    text: email.text,
  })
  if (sendError) {
    console.error('[desk-email] send error:', sendError)
    return NextResponse.json({ error: sendError.message }, { status: 502 })
  }

  await supabase.from('routine_heartbeat').insert({ routine: 'desk_email', summary: email.subject })
  return NextResponse.json({ sent: true, subject: email.subject, pipeline })
}

/** The coming Wednesday's date (today if it is Wednesday): the next newsletter. */
function nextWednesday(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Stage 18: what the Outreach, Newsletter, Club Card and Data health tabs list, read from the
 * same views and rules as the tabs. Null if any read fails: the email still goes without them.
 */
async function loadDeskTabs(supabase: ReturnType<typeof createServiceRoleClient>, orgId: string, today: string): Promise<DeskTabs | null> {
  try {
    const buckets = WORK_ON_NEXT_BUCKETS.map((b) => b.bucket)
    const [nextRes, offersRes, healthRes, queue] = await Promise.all([
      supabase.from('v_outreach_next').select('name, bucket, days_quiet, draft_ready, next_order')
        .eq('organization_id', orgId).in('bucket', buckets).order('next_order', { ascending: true }).limit(2000),
      supabase.from('v_club_card_members').select('business_name, offer_text, issues')
        .eq('organization_id', orgId).contains('issues', ['offer_old']).order('business_name'),
      supabase.from('v_data_health_counts').select('n').eq('organization_id', orgId).eq('fixed_on', '/data-health'),
      loadMentionQueue(supabase, orgId, today),
    ])
    const err = [nextRes, offersRes, healthRes].find((r) => r.error)?.error
    if (err) throw new Error(err.message)
    const next = nextRes.data ?? []
    const counts: Record<string, number> = {}
    for (const r of next) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1
    return {
      workOnNext: next.slice(0, 6).map((r) => ({ name: r.name, bucket: r.bucket, days_quiet: r.days_quiet, draft_ready: !!r.draft_ready })),
      workOnNextCounts: counts,
      dueMention: { wednesday: nextWednesday(today), rows: queue },
      offersToCheck: (offersRes.data ?? []).map((o) => ({ name: o.business_name, offer: o.offer_text })),
      dataHealth: (healthRes.data ?? []).reduce((t, r) => t + Number(r.n ?? 0), 0),
    }
  } catch (e) {
    console.error('[desk-email] tabs read error:', (e as Error).message)
    return null
  }
}
