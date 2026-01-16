'use server'

import { createClient } from '@/lib/supabase/server'
import { getCorrespondenceByBusiness } from './correspondence'
import Anthropic from '@anthropic-ai/sdk'
import { ActionDetectionResponse, ActionSuggestion } from '@/lib/ai/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are an action detection assistant for a correspondence management system.

HARD RULES:
1. ANALYZE ONLY what was written - NEVER invent content
2. STRICT JSON ONLY - Return ONLY valid JSON, never prose
3. Focus on EXPLICIT keywords indicating pending actions
4. If uncertain, mark confidence as 'low' or exclude the suggestion

Detect these action types:
- prospect: New business opportunity mentioned
- follow_up: Need to follow up on previous discussion
- waiting_on_them: Waiting for their response/action
- invoice: Payment or invoicing mentioned
- renewal: Contract renewal or expiry discussed

Keywords to look for:
- Follow up: "I'll follow up", "let's reconnect", "touch base"
- Waiting: "waiting for", "let me know", "pending your"
- Invoice: "invoice", "payment", "bill", "due"
- Renewal: "renewal", "contract", "expires", "renew"
- Prospect: "interested in", "new opportunity", "proposal"

Return ONLY high-confidence suggestions based on explicit mentions.`

/**
 * Validate AI response structure
 */
function validateActionDetectionResponse(data: unknown): ActionDetectionResponse | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const response = data as Record<string, unknown>

  // Check required fields
  if (!Array.isArray(response.suggestions)) {
    return null
  }

  // Validate each suggestion
  const validSuggestions = response.suggestions.filter((suggestion: unknown) => {
    if (!suggestion || typeof suggestion !== 'object') {
      return false
    }

    const s = suggestion as Record<string, unknown>

    // Check required fields
    if (
      typeof s.action_type !== 'string' ||
      typeof s.confidence !== 'string' ||
      typeof s.reasoning !== 'string' ||
      typeof s.priority !== 'string'
    ) {
      return false
    }

    // Validate action_type
    const validActionTypes = ['prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal']
    if (!validActionTypes.includes(s.action_type)) {
      return false
    }

    // Validate confidence
    const validConfidence = ['low', 'medium', 'high']
    if (!validConfidence.includes(s.confidence)) {
      return false
    }

    // Validate priority
    const validPriority = ['low', 'medium', 'high']
    if (!validPriority.includes(s.priority)) {
      return false
    }

    // Validate nullable fields
    if (s.triggering_entry_id !== null && typeof s.triggering_entry_id !== 'string') {
      return false
    }

    if (s.suggested_due_date !== null && typeof s.suggested_due_date !== 'string') {
      return false
    }

    return true
  }) as ActionSuggestion[]

  return {
    suggestions: validSuggestions,
    warnings: Array.isArray(response.warnings) ? response.warnings.filter((w): w is string => typeof w === 'string') : [],
  }
}

/**
 * Analyze recent correspondence and detect pending actions
 * Returns suggested actions for manual user confirmation
 */
export async function detectActions(businessId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    // Get last 12 months of correspondence
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const correspondenceResult = await getCorrespondenceByBusiness(businessId, 1000, 0)

    if ('error' in correspondenceResult) {
      return { error: correspondenceResult.error }
    }

    const correspondence = correspondenceResult.data || []

    // Filter to last 12 months
    const recentEntries = correspondence.filter((entry) => {
      const entryDate = new Date(entry.entry_date || entry.created_at)
      return entryDate >= twelveMonthsAgo
    })

    // If no recent correspondence, return empty suggestions immediately
    if (recentEntries.length === 0) {
      return { data: { suggestions: [], warnings: [] } }
    }

    // Sort chronologically (newest first) and take last 5 entries
    const sortedEntries = recentEntries
      .sort((a, b) => {
        const dateA = new Date(a.entry_date || a.created_at).getTime()
        const dateB = new Date(b.entry_date || b.created_at).getTime()
        return dateB - dateA
      })
      .slice(0, 5)

    // Build a concise text summary for the AI
    const correspondenceText = sortedEntries
      .map((entry) => {
        const date = new Date(entry.entry_date || entry.created_at).toLocaleDateString('en-GB')
        const type = entry.type || 'Note'
        const subject = entry.subject || ''
        const text = entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
        // Truncate to 300 chars for performance
        const truncatedText = text.length > 300 ? text.substring(0, 300) + '...' : text
        return `Entry ID: ${entry.id}
[${date}] ${type}${subject ? ` - ${subject}` : ''}
${truncatedText}`
      })
      .join('\n\n---\n\n')

    // Call Anthropic API for action detection
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyze the following ${sortedEntries.length} most recent correspondence entries and detect any pending actions.

Return STRICT JSON ONLY in this exact format:
{
  "suggestions": [
    {
      "action_type": "follow_up" | "prospect" | "waiting_on_them" | "invoice" | "renewal",
      "confidence": "low" | "medium" | "high",
      "reasoning": "One sentence explaining why",
      "triggering_entry_id": "entry-id-from-text" or null,
      "suggested_due_date": "YYYY-MM-DD" or null,
      "priority": "low" | "medium" | "high"
    }
  ],
  "warnings": []
}

Correspondence:
${correspondenceText}`,
        },
      ],
    })

    // Extract text from response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : null

    if (!responseText) {
      console.error('AI Action Detection: No text in response')
      return { data: { suggestions: [], warnings: [] } }
    }

    // Parse JSON response
    let parsedResponse: unknown
    try {
      parsedResponse = JSON.parse(responseText)
    } catch (parseError) {
      console.error('AI Action Detection: Invalid JSON response:', parseError)
      return { data: { suggestions: [], warnings: [] } }
    }

    // Validate response structure
    const validatedResponse = validateActionDetectionResponse(parsedResponse)

    if (!validatedResponse) {
      console.error('AI Action Detection: Response validation failed')
      return { data: { suggestions: [], warnings: [] } }
    }

    return { data: validatedResponse }
  } catch (err) {
    console.error('AI Action Detection Error:', err)

    // Graceful failure - return empty suggestions
    return { data: { suggestions: [], warnings: [] } }
  }
}
