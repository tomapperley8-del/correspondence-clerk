import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'
import { buildInsightPrompt } from '@/lib/ai/insight-prompts'
import { sendBriefingEmail, type BriefingActionItem } from '@/lib/email/briefing-email'
import { createActionToken } from '@/lib/email/action-token'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const BRIEFING_TTL_HOURS = 24
const MAX_ACTION_ITEMS = 5
const ACTIONS_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://correspondence-clerk.vercel.app') + '/api/actions/quick-act'

// ---------------------------------------------------------------------------
// Fetch and prioritise top actions for the email
// Uses service-role client (no auth session in cron context).
// Mirrors the logic in getNeedsReply() + getOutstandingActions() server actions.
// ---------------------------------------------------------------------------
async function fetchTopActionsForEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  userId: string
): Promise<BriefingActionItem[]> {
  const oneYearAgo = new Date()
  oneYearAgo.setDate(oneYearAgo.getDate() - 365)
  const now = new Date()

  // Fetch outstanding flagged actions
  const { data: flagged } = await supabase
    .from('correspondence')
    .select('id, business_id, subject, entry_date, direction, action_needed, due_at, businesses!inner(id, name)')
    .eq('organization_id', orgId)
    .neq('action_needed', 'none')
    .is('reply_dismissed_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(50)

  // Fetch recent received emails (for needs-reply detection)
  const { data: recent } = await supabase
    .from('correspondence')
    .select('id, business_id, subject, entry_date, direction, action_needed, due_at, businesses!inner(id, name)')
    .eq('organization_id', orgId)
    .gte('entry_date', oneYearAgo.toISOString())
    .is('reply_dismissed_at', null)
    .order('entry_date', { ascending: false })
    .limit(500)

  const entries = recent || []

  // Build latest-non-received map per business (same logic as getNeedsReply)
  const latestNonReceivedByBusiness = new Map<string, Date>()
  for (const entry of entries) {
    if (entry.direction === 'received' || !entry.entry_date) continue
    const d = new Date(entry.entry_date)
    const existing = latestNonReceivedByBusiness.get(entry.business_id)
    if (!existing || d > existing) latestNonReceivedByBusiness.set(entry.business_id, d)
  }

  // Filter needs-reply candidates
  const needsReplyRaw = entries.filter(entry => {
    if (entry.direction !== 'received') return false
    if (entry.action_needed === 'waiting_on_them') return false
    if (entry.due_at && new Date(entry.due_at) > now) return false
    if (!entry.entry_date) return false
    const entryDate = new Date(entry.entry_date)
    const latestNonReceived = latestNonReceivedByBusiness.get(entry.business_id)
    return !latestNonReceived || latestNonReceived < entryDate
  })

  // Deduplicate: one per business
  const seen = new Set<string>()
  const needsReply = needsReplyRaw
    .filter(e => {
      if (seen.has(e.business_id)) return false
      seen.add(e.business_id)
      return true
    })
    .map(e => ({ ...e, _source: 'needs_reply' as const }))

  // Exclude flagged items already in needs-reply (avoid double-showing same entry)
  const needsReplyIds = new Set(needsReply.map(e => e.id))
  const flaggedItems = (flagged || [])
    .filter(e => !needsReplyIds.has(e.id))
    .map(e => ({ ...e, _source: 'outstanding' as const }))

  // Score each item for urgency ordering
  type RawItem = (typeof needsReply)[0] | (typeof flaggedItems)[0]
  function scoreItem(item: RawItem): number {
    const nowMs = now.getTime()
    if (item._source === 'needs_reply') {
      const daysAgo = (nowMs - new Date(item.entry_date!).getTime()) / 86_400_000
      if (daysAgo >= 7) return 10000 + daysAgo
      if (daysAgo >= 3) return 8000 + daysAgo
      return 6000 + daysAgo
    }
    // outstanding action
    if (!item.due_at) return 5000
    const dueMs = new Date(item.due_at).getTime()
    if (dueMs < nowMs) return 9000 + (nowMs - dueMs) / 86_400_000  // overdue
    const daysUntil = (dueMs - nowMs) / 86_400_000
    if (daysUntil <= 0) return 8500     // due today
    if (daysUntil <= 1) return 7500     // due tomorrow
    return 5000 - daysUntil             // due soon
  }

  const merged = [...needsReply, ...flaggedItems].sort((a, b) => scoreItem(b) - scoreItem(a))
  const top5 = merged.slice(0, MAX_ACTION_ITEMS)

  // Build BriefingActionItem with tokens and badge labels
  return top5.map(item => {
    const biz = item.businesses as unknown as { name: string }
    const subject = (item.subject || '(No subject)').slice(0, 80)

    let badgeLabel: string
    let badgeColour: BriefingActionItem['badgeColour']

    if (item._source === 'needs_reply') {
      const daysAgo = Math.round((now.getTime() - new Date(item.entry_date!).getTime()) / 86_400_000)
      badgeLabel = `REPLY · ${daysAgo}d ago`
      badgeColour = daysAgo >= 7 ? 'red' : 'amber'
    } else {
      if (!item.due_at) {
        badgeLabel = (item.action_needed || 'ACTION').toUpperCase().replace('_', ' ')
        badgeColour = 'blue'
      } else {
        const dueDate = new Date(item.due_at)
        if (dueDate < now) {
          const daysOverdue = Math.round((now.getTime() - dueDate.getTime()) / 86_400_000)
          badgeLabel = `OVERDUE · ${daysOverdue}d`
          badgeColour = 'red'
        } else {
          const daysUntil = Math.round((dueDate.getTime() - now.getTime()) / 86_400_000)
          if (daysUntil === 0) { badgeLabel = 'DUE TODAY'; badgeColour = 'amber' }
          else if (daysUntil === 1) { badgeLabel = 'DUE TOMORROW'; badgeColour = 'amber' }
          else { badgeLabel = `DUE IN ${daysUntil}D`; badgeColour = 'blue' }
        }
      }
    }

    const doneToken = createActionToken(item.id, 'done', userId)
    const snoozeToken = createActionToken(item.id, 'snooze', userId)

    return {
      id: item.id,
      businessId: item.business_id,
      businessName: biz.name,
      subject,
      badgeLabel,
      badgeColour,
      doneUrl: `${ACTIONS_URL}?token=${doneToken}`,
      snoozeUrl: `${ACTIONS_URL}?token=${snoozeToken}`,
    }
  })
}

// ---------------------------------------------------------------------------
// Main cron handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const counts = { processed: 0, emailed: 0, cached: 0, generated: 0, errors: 0 }

  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, organization_id, display_name')
    .eq('briefing_email_opt_out', false)

  if (profilesError || !profiles) {
    console.error('[daily-briefing] Failed to fetch profiles:', profilesError)
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
  }

  for (const profile of profiles) {
    counts.processed++
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(profile.id)
      const email = authData?.user?.email
      if (!email) {
        console.warn(`[daily-briefing] No email for user ${profile.id}, skipping`)
        counts.errors++
        continue
      }

      const orgId = profile.organization_id

      // Fetch top action items and AI briefing in parallel
      const [actionItems, cached] = await Promise.all([
        fetchTopActionsForEmail(supabase, orgId, profile.id).catch(err => {
          console.error('[daily-briefing] action fetch failed:', err)
          return [] as BriefingActionItem[]
        }),
        supabase
          .from('insight_cache')
          .select('content, generated_at')
          .eq('org_id', orgId)
          .eq('insight_type', 'briefing')
          .is('business_id', null)
          .single()
          .then(r => r.data),
      ])

      let content: string

      if (cached) {
        const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3600000
        if (ageHours < BRIEFING_TTL_HOURS) {
          content = cached.content
          counts.cached++
        } else {
          content = await generateAndCache(supabase, orgId, cached)
          counts.generated++
          await new Promise(r => setTimeout(r, 200))
        }
      } else {
        content = await generateAndCache(supabase, orgId, null)
        counts.generated++
        await new Promise(r => setTimeout(r, 200))
      }

      await sendBriefingEmail(email, profile.display_name, content, actionItems)
      counts.emailed++

    } catch (err) {
      console.error(`[daily-briefing] Error processing user ${profile.id}:`, err)
      counts.errors++
    }
  }

  console.log('[daily-briefing] Done:', counts)
  return NextResponse.json(counts)
}

async function generateAndCache(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  existing: { content: string; generated_at: string } | null
): Promise<string> {
  const previous = existing ? [existing] : []

  const { systemPrompt, userPrompt } = await buildInsightPrompt(
    'briefing',
    orgId,
    null,
    supabase,
    previous
  )

  const anthropic = getAnthropicClient()
  const response = await anthropic.messages.create({
    model: AI_MODELS.ECONOMY,
    max_tokens: 2048,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected Claude response type')
  const content = block.text
  const generatedAt = new Date().toISOString()

  await supabase
    .from('insight_cache')
    .delete()
    .eq('org_id', orgId)
    .eq('insight_type', 'briefing')
    .is('business_id', null)

  await supabase
    .from('insight_cache')
    .insert({ org_id: orgId, business_id: null, insight_type: 'briefing', content, generated_at: generatedAt })

  return content
}
