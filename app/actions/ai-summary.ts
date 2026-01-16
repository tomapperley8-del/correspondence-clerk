'use server'

import { createClient } from '@/lib/supabase/server'
import { getCorrespondenceByBusiness } from './correspondence'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Generate a very brief AI summary of the last 12 months of correspondence
 * Returns 1-2 sentences summarizing the main topics and current status
 */
export async function generateCorrespondenceSummary(businessId: string) {
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

    // If no recent correspondence, return a message
    if (recentEntries.length === 0) {
      return { data: 'No correspondence in the last 12 months.' }
    }

    // Sort chronologically (oldest first)
    const sortedEntries = recentEntries.sort((a, b) => {
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return dateA - dateB
    })

    // Get current date for temporal awareness
    const today = new Date()
    const todayFormatted = today.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    // Build a concise text summary for the AI
    const correspondenceText = sortedEntries
      .map((entry) => {
        const date = new Date(entry.entry_date || entry.created_at).toLocaleDateString('en-GB')
        const type = entry.type || 'Note'
        const subject = entry.subject || ''
        const text = entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
        // Truncate to first 200 chars to keep context window reasonable
        const truncatedText = text.length > 200 ? text.substring(0, 200) + '...' : text
        return `[${date}] ${type}${subject ? ` - ${subject}` : ''}: ${truncatedText}`
      })
      .join('\n\n')

    // Call Anthropic API for summary
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `You are summarizing correspondence between a business and a client. Today's date is ${todayFormatted}.

Based on the following correspondence entries from the last 12 months, provide a VERY BRIEF summary in 1-2 sentences. Focus on: the main topics discussed, current relationship status, and any pending actions or important developments.

IMPORTANT: Be aware of dates and use temporal language to indicate recency. For example:
- "Last contacted 2 weeks ago..."
- "Most recent discussion in October was about..."
- "No contact since September..."
- "Recent exchange last week regarding..."

Do not invent information. Only summarize what is actually in the correspondence. Be concise and factual.

Correspondence:
${correspondenceText}`,
        },
      ],
    })

    // Extract text from response
    const summary = message.content[0].type === 'text' ? message.content[0].text : 'Unable to generate summary.'

    return { data: summary.trim() }
  } catch (err) {
    console.error('AI Summary Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)

    // If AI fails, return a simple fallback
    return { error: `Summary generation failed: ${errorMessage}` }
  }
}
