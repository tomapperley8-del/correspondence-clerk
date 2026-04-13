'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { assessObligationWithHaiku } from '@/lib/ai/retro-scan'
import { TIER1_FINANCIAL, TIER2_RECEIVED_COMMITMENTS, TIER2_INTEREST_SIGNALS } from '@/lib/ai/keyword-detection'
import type { ActionType } from '@/lib/ai/keyword-detection'

export interface RetroCandidate {
  id: string
  business_id: string
  business_name: string
  type: string
  direction: string | null
  entry_date: string
  subject: string | null
  snippet: string | null
}

export interface RetroMediumResult extends RetroCandidate {
  action_type: ActionType
  reasoning: string
}

export interface RetroScanSummary {
  candidates_found: number
  auto_applied: number
  needs_review: RetroMediumResult[]
  error?: string
}

/**
 * Fetches historical entries that match Tier 1 / Tier 2 keywords but have no action flag.
 * These are the candidates for the retrospective Haiku scan.
 */
export async function getRetroScanCandidates(): Promise<{ data?: RetroCandidate[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const window180dAgo = new Date(Date.now() - 180 * 86400000).toISOString()

  // Fetch Meeting/Call/Note entries (all time) + sent emails (last 180d)
  const { data, error } = await supabase
    .from('correspondence')
    .select('id, business_id, type, direction, entry_date, subject, formatted_text_current, businesses!inner(name)')
    .eq('organization_id', orgId)
    .eq('action_needed', 'none')
    .is('reply_dismissed_at', null)
    .or(`type.in.(Meeting,Call,Note),and(direction.eq.sent,entry_date.gte.${window180dAgo})`)
    .order('entry_date', { ascending: false })
    .limit(500)

  if (error) return { error: error.message }

  const allKeywords = [...TIER1_FINANCIAL, ...TIER2_RECEIVED_COMMITMENTS, ...TIER2_INTEREST_SIGNALS]

  const candidates: RetroCandidate[] = (data || [])
    .filter(e => {
      const text = (e.formatted_text_current || '').toLowerCase()
      return allKeywords.some(kw => text.includes(kw))
    })
    .map(e => {
      const bizRaw = e.businesses as unknown as { name: string } | { name: string }[] | null
      const bizName = Array.isArray(bizRaw) ? bizRaw[0]?.name : bizRaw?.name
      const text = e.formatted_text_current || ''
      const stripped = text.replace(/\*\*|__|[_*#>`~]/g, '').replace(/\s+/g, ' ').trim()
      return {
        id: e.id,
        business_id: e.business_id,
        business_name: bizName || 'Unknown',
        type: e.type,
        direction: e.direction,
        entry_date: e.entry_date,
        subject: e.subject,
        snippet: stripped.length <= 140 ? stripped : stripped.slice(0, 140).replace(/\s\S*$/, '') + '…',
      }
    })

  return { data: candidates }
}

/**
 * Runs the retrospective Haiku scan:
 * - Fetches candidates
 * - Assesses each with Haiku in parallel
 * - Auto-applies 'high' confidence results immediately
 * - Returns 'medium' confidence results for user review
 */
export async function runRetroScan(): Promise<RetroScanSummary> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { candidates_found: 0, auto_applied: 0, needs_review: [], error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { candidates_found: 0, auto_applied: 0, needs_review: [], error: 'No organization found' }

  const { data: candidates, error: fetchError } = await getRetroScanCandidates()
  if (fetchError || !candidates) return { candidates_found: 0, auto_applied: 0, needs_review: [], error: fetchError }

  // Fetch full text for Haiku assessment
  const { data: fullData, error: fullError } = await supabase
    .from('correspondence')
    .select('id, type, direction, entry_date, subject, formatted_text_current')
    .eq('organization_id', orgId)
    .in('id', candidates.map(c => c.id))

  if (fullError || !fullData) return { candidates_found: candidates.length, auto_applied: 0, needs_review: [], error: fullError?.message }

  const fullMap = new Map(fullData.map(e => [e.id, e]))

  // Run all Haiku assessments in parallel
  const results = await Promise.all(
    candidates.map(async candidate => {
      const full = fullMap.get(candidate.id)
      if (!full) return { candidate, result: null }
      const result = await assessObligationWithHaiku(full)
      return { candidate, result }
    })
  )

  let autoApplied = 0
  const needsReview: RetroMediumResult[] = []

  for (const { candidate, result } of results) {
    if (!result?.has_obligation) continue
    if (!result.action_type) continue
    if (result.confidence === 'low') continue

    if (result.confidence === 'high') {
      // Auto-apply
      const { error: updateError } = await supabase
        .from('correspondence')
        .update({ action_needed: result.action_type })
        .eq('id', candidate.id)
        .eq('organization_id', orgId)

      if (!updateError) autoApplied++
    } else if (result.confidence === 'medium') {
      needsReview.push({
        ...candidate,
        action_type: result.action_type,
        reasoning: result.reasoning,
      })
    }
  }

  return {
    candidates_found: candidates.length,
    auto_applied: autoApplied,
    needs_review: needsReview,
  }
}

/**
 * Applies a user-confirmed medium-confidence scan result.
 */
export async function applyRetroScanResult(
  entryId: string,
  actionType: ActionType
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('correspondence')
    .update({ action_needed: actionType })
    .eq('id', entryId)
    .eq('organization_id', orgId)

  return { error: error?.message }
}

/**
 * Dismisses a medium-confidence scan result (marks the entry so it won't re-appear).
 * We use reply_dismissed_at as the "skip" marker for retro scan items too,
 * since these are not actionable and the user has explicitly reviewed + skipped them.
 */
export async function dismissRetroScanResult(entryId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' }

  const { error } = await supabase
    .from('correspondence')
    .update({ reply_dismissed_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('organization_id', orgId)

  return { error: error?.message }
}
