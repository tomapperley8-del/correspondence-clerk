'use server'

import { createClient } from '@/lib/supabase/server'
import { getCorrespondenceByBusiness } from './correspondence'
import { getBusinessById } from './businesses'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export type AISummaryResult = {
  summary: string
}

/**
 * Generate a combined AI summary of the last 12 months of correspondence
 * and contract status (if contract data exists).
 * Returns a single summary string that naturally incorporates contract info
 * when notable (expiring soon, recently started, or expired).
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
    // Get business data for contract analysis
    const businessResult = await getBusinessById(businessId)
    if ('error' in businessResult || !businessResult.data) {
      return { error: 'Business not found' }
    }
    const business = businessResult.data

    // Get last 12 months of correspondence
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const correspondenceResult = await getCorrespondenceByBusiness(businessId, 1000, 0)

    if ('error' in correspondenceResult) {
      return { error: correspondenceResult.error }
    }

    const correspondence = correspondenceResult.data || []

    // Get current date for temporal awareness
    const today = new Date()
    const todayFormatted = today.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    // Filter to last 12 months
    const recentEntries = correspondence.filter((entry) => {
      const entryDate = new Date(entry.entry_date || entry.created_at)
      return entryDate >= twelveMonthsAgo
    })

    // Build contract context
    const hasContractData = business.contract_start || business.contract_end || business.deal_terms
    const contractContext = hasContractData
      ? `\n\nCONTRACT INFORMATION (mention ONLY if notable - expiring within 90 days, recently started, or expired):
- Start Date: ${business.contract_start ? new Date(business.contract_start).toLocaleDateString('en-GB') : 'Not set'}
- End Date: ${business.contract_end ? new Date(business.contract_end).toLocaleDateString('en-GB') : 'Not set'}
- Deal Terms: ${business.deal_terms || 'Not set'}
- Contract Amount: ${business.contract_amount ? `£${business.contract_amount.toLocaleString('en-GB')}` : 'Not set'}`
      : ''

    // If no recent correspondence
    if (recentEntries.length === 0) {
      if (!hasContractData) {
        return {
          data: {
            summary: 'No correspondence in the last 12 months.',
          },
        }
      }

      // Generate contract-only summary
      const contractOnlyMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: `Today's date is ${todayFormatted}.

No correspondence in the last 12 months, but this business has contract information:
- Start Date: ${business.contract_start ? new Date(business.contract_start).toLocaleDateString('en-GB') : 'Not set'}
- End Date: ${business.contract_end ? new Date(business.contract_end).toLocaleDateString('en-GB') : 'Not set'}
- Deal Terms: ${business.deal_terms || 'Not set'}
- Contract Amount: ${business.contract_amount ? `£${business.contract_amount.toLocaleString('en-GB')}` : 'Not set'}

Provide a brief 1-2 sentence summary noting the lack of recent correspondence and the contract status. Just the text, no JSON, no formatting.`,
          },
        ],
      })

      const summaryText =
        contractOnlyMessage.content[0].type === 'text' ? contractOnlyMessage.content[0].text.trim() : 'No correspondence in the last 12 months.'

      return {
        data: {
          summary: summaryText,
        },
      }
    }

    // Sort chronologically (oldest first)
    const sortedEntries = recentEntries.sort((a, b) => {
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return dateA - dateB
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

    // Single combined AI call
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are summarizing correspondence between a business and a client. Today's date is ${todayFormatted}.

Based on the following correspondence entries from the last 12 months, provide a VERY BRIEF summary in 1-2 sentences. Focus on: the main topics discussed, current relationship status, and any pending actions or important developments.
${contractContext}

IMPORTANT:
- Be aware of dates and use temporal language to indicate recency
- Do not invent information. Only summarize what is actually in the correspondence
- Be concise and factual
- If contract info is provided, only mention it if it is notable (expiring soon, recently started, or expired). Do not repeat contract dates verbatim.
- Return ONLY the summary text, no JSON, no formatting, no preamble

Correspondence:
${correspondenceText}`,
        },
      ],
    })

    const summary = message.content[0].type === 'text' ? message.content[0].text.trim() : 'Unable to generate summary.'

    return {
      data: {
        summary,
      },
    }
  } catch (err) {
    console.error('AI Summary Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)

    // If AI fails, return a simple fallback
    return { error: `Summary generation failed: ${errorMessage}` }
  }
}
