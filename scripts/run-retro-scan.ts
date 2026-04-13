/**
 * One-time retrospective obligation scan.
 * Run with: npx tsx scripts/run-retro-scan.ts
 *
 * Uses service role to bypass browser session requirement.
 */

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceRoleClient } from '../lib/supabase/service-role'
import {
  TIER1_FINANCIAL,
  TIER2_RECEIVED_COMMITMENTS,
  TIER2_INTEREST_SIGNALS,
  detectPaymentResolution,
} from '../lib/ai/keyword-detection'

const ECONOMY_MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `You review correspondence entries to identify unresolved obligations.

Action types:
- invoice: Tom is owed money (unpaid invoice or outstanding balance)
- waiting_on_them: Tom sent an invoice/payment request and is waiting for payment; or he's waiting for their response to something he sent
- follow_up: Tom needs to do something or follow up on something
- prospect: contact expressed interest that hasn't converted to a sale

Rules:
- Only flag if the obligation is CURRENT and UNRESOLVED — not if it's clearly complete, paid, or past tense
- "high" = obligation is explicit and unmistakable (e.g. specific invoice amount sent, explicit payment request)
- "medium" = obligation is likely but requires human confirmation
- "low" = very uncertain; not worth surfacing
- Return has_obligation: false if the text is routine, completed, or no obligation is evident

Return valid JSON only. No prose.`

interface ScanResult {
  has_obligation: boolean
  action_type: 'invoice' | 'waiting_on_them' | 'follow_up' | 'prospect' | null
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

async function assessEntry(
  anthropic: Anthropic,
  entry: {
    id: string
    type: string
    direction: string | null
    entry_date: string
    subject: string | null
    formatted_text_current: string | null
  }
): Promise<ScanResult> {
  const text = (entry.formatted_text_current || '').slice(0, 600)
  const userContent = `Type: ${entry.type}
Direction: ${entry.direction || 'none (Meeting/Call/Note)'}
Date: ${entry.entry_date.slice(0, 10)}
Subject: ${entry.subject || '(none)'}

Text:
${text}

Does this entry contain an unresolved obligation? Return JSON:
{"has_obligation": true/false, "action_type": "invoice"|"waiting_on_them"|"follow_up"|"prospect"|null, "confidence": "high"|"medium"|"low", "reasoning": "one sentence"}`

  try {
    const response = await anthropic.messages.create({
      model: ECONOMY_MODEL,
      max_tokens: 128,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })
    const block = response.content[0]
    if (block.type !== 'text') throw new Error('No text')
    return JSON.parse(block.text.trim()) as ScanResult
  } catch {
    return { has_obligation: false, action_type: null, confidence: 'low', reasoning: 'Parse error' }
  }
}

async function main() {
  const supabase = createServiceRoleClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Get the org ID for Tom's account
  const { data: profiles } = await supabase.from('user_profiles').select('organization_id').limit(1)
  if (!profiles?.length) { console.error('No user profiles found'); process.exit(1) }
  const orgId = profiles[0].organization_id
  console.log(`Org ID: ${orgId}`)

  const window180dAgo = new Date(Date.now() - 180 * 86400000).toISOString()

  // Fetch candidates
  const { data: rawData, error } = await supabase
    .from('correspondence')
    .select('id, business_id, type, direction, entry_date, subject, formatted_text_current, businesses!inner(name)')
    .eq('organization_id', orgId)
    .eq('action_needed', 'none')
    .is('reply_dismissed_at', null)
    .or(`type.in.(Meeting,Call,Note),and(direction.eq.sent,entry_date.gte.${window180dAgo})`)
    .order('entry_date', { ascending: false })
    .limit(500)

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }

  const allKeywords = [...TIER1_FINANCIAL, ...TIER2_RECEIVED_COMMITMENTS, ...TIER2_INTEREST_SIGNALS]

  const candidates = (rawData || []).filter(e => {
    const text = (e.formatted_text_current || '').toLowerCase()
    // Skip payment confirmations — these are resolutions, not obligations
    if (detectPaymentResolution(text)) return false
    return allKeywords.some(kw => text.includes(kw))
  })

  console.log(`Candidates found: ${candidates.length}`)
  if (candidates.length === 0) { console.log('Nothing to scan.'); return }

  // Run all Haiku assessments in parallel
  console.log('Running Haiku assessments in parallel…')
  const results = await Promise.all(candidates.map(c => assessEntry(anthropic, c)))

  let autoApplied = 0
  const mediumItems: Array<{ id: string; business_name: string; type: string; direction: string | null; entry_date: string; subject: string | null; action_type: string; reasoning: string }> = []

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const r = results[i]
    const bizRaw = c.businesses as unknown as { name: string } | { name: string }[] | null
    const bizName = Array.isArray(bizRaw) ? bizRaw[0]?.name : bizRaw?.name

    if (!r.has_obligation || !r.action_type || r.confidence === 'low') continue

    if (r.confidence === 'high') {
      const { error: updateError } = await supabase
        .from('correspondence')
        .update({ action_needed: r.action_type })
        .eq('id', c.id)
      if (!updateError) {
        autoApplied++
        console.log(`  AUTO: [${r.action_type}] ${bizName} — ${c.subject || c.type} (${c.entry_date.slice(0, 10)})`)
        console.log(`        ${r.reasoning}`)
      }
    } else if (r.confidence === 'medium') {
      mediumItems.push({
        id: c.id,
        business_name: bizName || 'Unknown',
        type: c.type,
        direction: c.direction,
        entry_date: c.entry_date,
        subject: c.subject,
        action_type: r.action_type,
        reasoning: r.reasoning,
      })
    }
  }

  console.log(`\n=== SCAN COMPLETE ===`)
  console.log(`Auto-applied: ${autoApplied}`)
  console.log(`Needs review: ${mediumItems.length}`)

  if (mediumItems.length > 0) {
    console.log(`\n--- MEDIUM CONFIDENCE (review in Settings → Tools → Obligation Scan) ---`)
    for (const item of mediumItems) {
      console.log(`  [${item.action_type}] ${item.business_name} — ${item.subject || item.type} (${item.entry_date.slice(0, 10)})`)
      console.log(`        ${item.reasoning}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
