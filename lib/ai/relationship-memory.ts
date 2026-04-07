/**
 * Relationship memory — distils a business relationship into 3 sentences.
 * Called after each business-specific insight generation (fire-and-forget).
 * Uses Haiku for cost efficiency.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'

const SYSTEM_PROMPT = `You distil business relationships into exactly 3 sentences. Sentence 1: who they are and the nature of the relationship. Sentence 2: key recent developments or turning points. Sentence 3: current status and what needs attention. Be specific — use names, dates, and amounts. No hedging.`

export async function generateRelationshipMemory(
  orgId: string,
  businessId: string,
  supabase: SupabaseClient,
  contextBlock: string
): Promise<void> {
  try {
    const anthropic = getAnthropicClient()
    const response = await anthropic.messages.create({
      model: AI_MODELS.ECONOMY,
      max_tokens: 256,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${contextBlock}\n\nDistil this into exactly 3 sentences.` }],
    })

    const block = response.content[0]
    if (block.type !== 'text' || !block.text.trim()) return

    const memory = block.text.trim()

    await supabase
      .from('businesses')
      .update({
        relationship_memory: memory,
        relationship_memory_updated_at: new Date().toISOString(),
      })
      .eq('id', businessId)
      .eq('organization_id', orgId)
  } catch (err) {
    console.error('Relationship memory generation failed:', err)
  }
}
