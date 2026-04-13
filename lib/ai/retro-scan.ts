/**
 * Phase 3: Retrospective Haiku scan.
 *
 * Assesses a single historical correspondence entry to determine if it contains
 * an unresolved obligation that should have been flagged at filing time.
 * Used for a one-time batch scan of pre-Phase-1 records.
 */

import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'
import type { ActionType } from '@/lib/ai/keyword-detection'

export interface RetroScanResult {
  has_obligation: boolean
  action_type: ActionType | null
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

const SYSTEM_PROMPT = `You review correspondence entries to identify unresolved obligations.

Action types:
- invoice: Tom is owed money (unpaid invoice or outstanding balance)
- waiting_on_them: Tom sent an invoice/payment request and is waiting for payment; or he's waiting for their response to something he sent
- follow_up: Tom needs to do something or follow up on something
- prospect: contact expressed interest that hasn't converted to a sale

Rules:
- Only flag if the obligation is CURRENT and UNRESOLVED — not if it's clearly complete, paid, or past tense
- "high" = obligation is explicit and unmistakable (e.g. specific invoice amount sent, explicit payment request)
- "medium" = obligation is likely but requires human confirmation (e.g. general financial language, could be resolved off-system)
- "low" = very uncertain; not worth surfacing
- Return has_obligation: false if the text is routine, completed, or no obligation is evident

Return valid JSON only. No prose.`

export async function assessObligationWithHaiku(entry: {
  id: string
  type: string
  direction: string | null
  entry_date: string
  subject: string | null
  formatted_text_current: string | null
}): Promise<RetroScanResult> {
  const anthropic = getAnthropicClient()

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
      model: AI_MODELS.ECONOMY,
      max_tokens: 128,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const block = response.content[0]
    if (block.type !== 'text') return { has_obligation: false, action_type: null, confidence: 'low', reasoning: 'No text response' }

    const parsed = JSON.parse(block.text.trim()) as RetroScanResult
    return parsed
  } catch {
    return { has_obligation: false, action_type: null, confidence: 'low', reasoning: 'Parse error' }
  }
}
