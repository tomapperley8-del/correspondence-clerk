import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildDeskEmail, type CareGap, type ClosedItem, type DeskLine, type DraftItem } from '@/lib/email/desk-email'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const TO = process.env.DESK_EMAIL_TO || 'tom@thechiswickcalendar.co.uk'
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@correspondenceclerk.com'

/**
 * Morning desk email. Vercel cron, daily.
 *
 * 1. run_morning_pipeline(): QuickBooks to CRM, task engine refresh, automatic
 *    task closing and prospect matching, all in SQL.
 * 2. Read the desk views and send one email to Tom. No AI involved.
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

  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const [linesRes, briefRes, healthRes, closedRes, missedRes, draftsRes, gapsRes, letGoRes] = await Promise.all([
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
      .from('tasks')
      .select('signal_meta')
      .neq('status', 'done')
      .eq('signal_meta->>kind', 'routine_missed'),
    supabase
      .from('routine_drafts')
      .select('kind, outcome, recipient, reason, sent_at, bump_count, bumped_at, business_id, businesses(name)')
      .or(`created_at.gte.${new Date(now.getTime() - 26 * 3_600_000).toISOString()},bumped_at.gte.${new Date(now.getTime() - 26 * 3_600_000).toISOString()}`)
      .order('created_at', { ascending: true }),
    supabase.from('v_care_gaps').select('severity, gap, detail').order('severity'),
    supabase.from('care_exclusions').select('business_id').eq('kind', 'all'),
  ])

  const firstError = [linesRes, briefRes, healthRes, closedRes, missedRes, draftsRes, gapsRes].find(r => r.error)?.error
  if (firstError) {
    console.error('[desk-email] read error:', firstError.message)
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  const closed: ClosedItem[] = (closedRes.data ?? []).map(r => {
    const task = r.tasks as unknown as { title: string } | { title: string }[]
    const title = Array.isArray(task) ? task[0]?.title : task?.title
    return { title: title ?? '(task)', summary: r.summary ?? '', hand_written: r.signal_key == null }
  })
  const missedRoutines = (missedRes.data ?? [])
    .map(r => (r.signal_meta as { routine?: string } | null)?.routine)
    .filter((x): x is string => !!x)

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
    missedRoutines,
    pipeline,
    drafts,
    skippedCount,
    gaps: (gapsRes.data ?? []) as CareGap[],
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
