/**
 * Action resolution — checks if a newly filed correspondence entry resolves
 * any outstanding flagged actions for the same business.
 * Called after createCorrespondence (fire-and-forget).
 * Uses Haiku for cost efficiency.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'
import { revalidatePath } from 'next/cache'

const SYSTEM_PROMPT = `You are a correspondence assistant for a UK business. Your job is to identify when flagged follow-up actions have been completed based on new correspondence being filed.`

export async function checkAndResolveActions(
  orgId: string,
  businessId: string,
  newEntryText: string,
  newEntrySubject: string | null
): Promise<number> {
  try {
    const supabase = createServiceRoleClient()

    // Fetch outstanding actions for this business
    const { data: actions } = await supabase
      .from('correspondence')
      .select('id, subject, action_needed, formatted_text_current')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .neq('action_needed', 'none')
      .limit(10)

    if (!actions || actions.length === 0) return 0

    // Build prompt
    const actionsList = actions
      .map((a) => {
        const snippet = (a.formatted_text_current ?? '').slice(0, 200)
        return `ID: ${a.id} | Type: ${a.action_needed} | Subject: ${a.subject ?? '(none)'} | Last note: ${snippet}`
      })
      .join('\n')

    const userMessage = `Outstanding actions for this business:\n${actionsList}\n\nNew correspondence just filed:\nSubject: ${newEntrySubject ?? '(none)'}\nContent: ${newEntryText.slice(0, 1000)}\n\nWhich outstanding actions does this new correspondence resolve?\nReturn JSON only: { "resolved": ["id1", "id2"] }\nOnly include an ID if you are highly confident the action is complete.`

    const anthropic = getAnthropicClient()
    const response = await anthropic.messages.create({
      model: AI_MODELS.ECONOMY,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    if (block.type !== 'text' || !block.text.trim()) return 0

    // Parse JSON response
    let resolved: string[] = []
    try {
      const json = JSON.parse(block.text.trim())
      if (Array.isArray(json.resolved)) {
        resolved = json.resolved.filter((id: unknown) => typeof id === 'string')
      }
    } catch {
      // AI returned something unparseable — skip silently
      return 0
    }

    if (resolved.length === 0) return 0

    // Validate that all resolved IDs actually belong to this business + org
    const validIds = actions.map((a) => a.id)
    const safeIds = resolved.filter((id) => validIds.includes(id))

    if (safeIds.length === 0) return 0

    await supabase
      .from('correspondence')
      .update({ action_needed: 'none', due_at: null })
      .in('id', safeIds)
      .eq('organization_id', orgId)

    revalidatePath('/actions')
    return safeIds.length
  } catch (err) {
    console.error('Action resolution check failed:', err)
    return 0
  }
}
