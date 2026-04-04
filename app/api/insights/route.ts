/**
 * Insights API — one-shot AI-generated summaries
 *
 * POST /api/insights
 * Body: { type: InsightType; businessId?: string; force?: boolean; customPromptText?: string }
 * Response: { content: string; generatedAt: string; fromCache: boolean }
 *
 * Data is pre-fetched server-side — no Claude tool-calling.
 * Results are cached in insight_cache; force=true bypasses cache.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient } from '@/lib/ai/client'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { buildInsightPrompt, INSIGHT_METADATA, type InsightType } from '@/lib/ai/insight-prompts'
import { AI_MODELS } from '@/lib/ai/models'

export const maxDuration = 60

const KNOWN_TYPES = new Set(Object.keys(INSIGHT_METADATA))

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 403 })
  }

  // Parse body
  let type: InsightType
  let businessId: string | null
  let force: boolean
  let customPromptText: string | undefined

  try {
    const body = await request.json()
    type = body.type
    businessId = body.businessId ?? null
    force = body.force === true
    customPromptText = body.customPromptText
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Validate type
  // Custom presets encode as 'custom_<uuid>' — normalise to 'custom' for dispatch
  const isCustomPreset = typeof type === 'string' && type.startsWith('custom_')
  const dispatchType: InsightType = isCustomPreset ? 'custom' : type

  if (!KNOWN_TYPES.has(dispatchType)) {
    return NextResponse.json({ error: `Unknown insight type: ${type}` }, { status: 400 })
  }

  // Business-specific insights require a businessId
  const meta = INSIGHT_METADATA[dispatchType]
  if (meta.scope === 'business' && !businessId) {
    return NextResponse.json({ error: `${type} requires a businessId` }, { status: 400 })
  }

  // Rate limit — 30/min (one-shot, not conversational)
  const rateLimit = await checkRateLimit({ limit: 30, windowMs: 60000, endpoint: 'insights' })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn)
  }

  // Cache check
  if (!force) {
    const cached = await getCachedInsight(supabase, organizationId, businessId, type)
    if (cached) {
      const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3600000
      if (ageHours < meta.cacheTtlHours) {
        return NextResponse.json({
          content: cached.content,
          generatedAt: cached.generated_at,
          fromCache: true,
        })
      }
    }
  }

  // Fetch previous cached versions for "learning" context (before we overwrite)
  const previous = await getPreviousCachedVersions(supabase, organizationId, businessId, type, 2)

  // If this is a custom preset, load the prompt text from the presets table
  let resolvedCustomPromptText = customPromptText
  if (isCustomPreset && !resolvedCustomPromptText) {
    const presetId = type.replace('custom_', '')
    const { data: preset } = await supabase
      .from('user_ai_presets')
      .select('prompt_text, scope')
      .eq('id', presetId)
      .eq('user_id', user.id)
      .single()
    if (!preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }
    resolvedCustomPromptText = preset.prompt_text
    // If preset scope is business, businessId must be provided for business context
  }

  // Build prompt (pre-fetches all data)
  let systemPrompt: string
  let userPrompt: string
  try {
    ;({ systemPrompt, userPrompt } = await buildInsightPrompt(
      dispatchType,
      organizationId,
      businessId,
      supabase,
      previous,
      resolvedCustomPromptText
    ))
  } catch (err) {
    console.error('Insight prompt build error:', err)
    return NextResponse.json({ error: 'Failed to build insight prompt' }, { status: 500 })
  }

  // Formulaic insights use Haiku (cheaper); strategic insights use Sonnet
  const HAIKU_INSIGHTS = new Set(['data_health_org', 'data_health_biz', 'reconnect_list', 'prospecting_targets'])
  const insightModel = HAIKU_INSIGHTS.has(dispatchType) ? AI_MODELS.ECONOMY : AI_MODELS.PREMIUM

  // Call Claude — no tools, no streaming, one-shot
  let content: string
  try {
    const anthropic = getAnthropicClient()
    const response = await anthropic.messages.create({
      model: insightModel,
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    })
    const block = response.content[0]
    if (block.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }
    content = block.text
  } catch (err) {
    console.error('Insight Claude error:', err)
    return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 500 })
  }

  const generatedAt = new Date().toISOString()

  // Upsert cache — two paths for nullable business_id uniqueness
  try {
    await upsertInsightCache(supabase, organizationId, businessId, type, content, generatedAt)
  } catch (err) {
    // Cache write failure doesn't fail the request — return content anyway
    console.error('Insight cache write error:', err)
  }

  return NextResponse.json({ content, generatedAt, fromCache: false })
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function getCachedInsight(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  orgId: string,
  businessId: string | null,
  insightType: string
) {
  let query = supabase
    .from('insight_cache')
    .select('content, generated_at')
    .eq('org_id', orgId)
    .eq('insight_type', insightType)

  if (businessId) {
    query = query.eq('business_id', businessId)
  } else {
    query = query.is('business_id', null)
  }

  const { data } = await query.single()
  return data
}

async function getPreviousCachedVersions(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  orgId: string,
  businessId: string | null,
  insightType: string,
  limit: number
): Promise<Array<{ content: string; generated_at: string }>> {
  let query = supabase
    .from('insight_cache')
    .select('content, generated_at')
    .eq('org_id', orgId)
    .eq('insight_type', insightType)
    .order('generated_at', { ascending: false })
    .limit(limit)

  if (businessId) {
    query = query.eq('business_id', businessId)
  } else {
    query = query.is('business_id', null)
  }

  const { data } = await query
  return data ?? []
}

async function upsertInsightCache(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  orgId: string,
  businessId: string | null,
  insightType: string,
  content: string,
  generatedAt: string
) {
  // Must use two separate upsert paths because the unique indexes are partial
  // (one for business_id IS NULL, one for business_id IS NOT NULL)
  if (businessId) {
    await supabase
      .from('insight_cache')
      .upsert(
        { org_id: orgId, business_id: businessId, insight_type: insightType, content, generated_at: generatedAt },
        { onConflict: 'org_id,business_id,insight_type' }
      )
  } else {
    // For org-wide: delete existing then insert (upsert can't target partial index by name)
    await supabase
      .from('insight_cache')
      .delete()
      .eq('org_id', orgId)
      .eq('insight_type', insightType)
      .is('business_id', null)

    await supabase
      .from('insight_cache')
      .insert({ org_id: orgId, business_id: null, insight_type: insightType, content, generated_at: generatedAt })
  }
}
