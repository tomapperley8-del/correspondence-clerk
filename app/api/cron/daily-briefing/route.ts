import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildInsightPrompt } from '@/lib/ai/insight-prompts'
import { sendBriefingEmail } from '@/lib/email/briefing-email'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const BRIEFING_TTL_HOURS = 24

export async function GET(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const counts = { processed: 0, emailed: 0, cached: 0, generated: 0, errors: 0 }

  // Fetch all opted-in users
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
      // Get email from auth (not stored on user_profiles)
      const { data: authData } = await supabase.auth.admin.getUserById(profile.id)
      const email = authData?.user?.email
      if (!email) {
        console.warn(`[daily-briefing] No email for user ${profile.id}, skipping`)
        counts.errors++
        continue
      }

      const orgId = profile.organization_id

      // Check insight cache
      const { data: cached } = await supabase
        .from('insight_cache')
        .select('content, generated_at')
        .eq('org_id', orgId)
        .eq('insight_type', 'briefing')
        .is('business_id', null)
        .single()

      let content: string

      if (cached) {
        const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3600000
        if (ageHours < BRIEFING_TTL_HOURS) {
          // Cache is fresh — use it, no Claude call needed
          content = cached.content
          counts.cached++
        } else {
          content = await generateAndCache(supabase, orgId, cached)
          counts.generated++
          // Small delay between Claude calls
          await new Promise(r => setTimeout(r, 200))
        }
      } else {
        content = await generateAndCache(supabase, orgId, null)
        counts.generated++
        await new Promise(r => setTimeout(r, 200))
      }

      await sendBriefingEmail(email, profile.display_name, content)
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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected Claude response type')
  const content = block.text
  const generatedAt = new Date().toISOString()

  // Delete-then-insert: upsert can't target the partial unique index for NULL business_id
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
