'use server'

import { createClient } from '@/lib/supabase/server'
import { getCorrespondenceByBusiness } from './correspondence'
import { getBusinessById, type Business } from './businesses'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export type AISummaryResult = {
  correspondence_summary: string
  contract_status: string | null
}

/**
 * Generate a very brief AI summary of the last 12 months of correspondence
 * and analyze contract status if contract data exists
 * Returns summary + contract analysis
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

    // Get current date for temporal awareness (needed for contract analysis)
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

    // If no recent correspondence, return a message (but still analyze contract if exists)
    if (recentEntries.length === 0) {
      // Still analyze contract even if no correspondence
      const hasContractData = business.contract_start || business.contract_end || business.deal_terms

      if (!hasContractData) {
        return {
          data: {
            correspondence_summary: 'No correspondence in the last 12 months.',
            contract_status: null,
          },
        }
      }

      // Generate contract analysis only
      const contractOnlyMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: `Today's date is ${todayFormatted}.

Analyze this contract:
- Start Date: ${business.contract_start ? new Date(business.contract_start).toLocaleDateString('en-GB') : 'Not set'}
- End Date: ${business.contract_end ? new Date(business.contract_end).toLocaleDateString('en-GB') : 'Not set'}
- Deal Terms: ${business.deal_terms || 'Not set'}
- Contract Amount: ${business.contract_amount ? `£${business.contract_amount.toLocaleString('en-GB')}` : 'Not set'}

Provide ONLY a brief 1-sentence contract status. Just the sentence, no JSON, no formatting.`,
          },
        ],
      })

      const contractStatusText =
        contractOnlyMessage.content[0].type === 'text' ? contractOnlyMessage.content[0].text.trim() : null

      return {
        data: {
          correspondence_summary: 'No correspondence in the last 12 months.',
          contract_status: contractStatusText,
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

    // Build contract context for AI if contract data exists
    const hasContractData = business.contract_start || business.contract_end || business.deal_terms
    const contractContext = hasContractData
      ? `

CONTRACT INFORMATION:
- Start Date: ${business.contract_start ? new Date(business.contract_start).toLocaleDateString('en-GB') : 'Not set'}
- End Date: ${business.contract_end ? new Date(business.contract_end).toLocaleDateString('en-GB') : 'Not set'}
- Deal Terms: ${business.deal_terms || 'Not set'}
- Contract Amount: ${business.contract_amount ? `£${business.contract_amount.toLocaleString('en-GB')}` : 'Not set'}

If contract dates are provided, analyze:
1. Is the contract expired (end date < today)?
2. Is it expiring soon (within 3 months)?
3. What are the key points from the deal terms?

Provide a brief contract status statement (1 sentence) if contract data exists. If no contract data, return null for contract_status.`
      : ''

    // Call Anthropic API for summary - request clean text output
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are summarizing correspondence between a business and a client. Today's date is ${todayFormatted}.

Based on the following correspondence entries from the last 12 months, provide a VERY BRIEF summary in 1-2 sentences. Focus on: the main topics discussed, current relationship status, and any pending actions or important developments.

IMPORTANT:
- Be aware of dates and use temporal language to indicate recency
- Do not invent information. Only summarize what is actually in the correspondence
- Be concise and factual
- Return ONLY the summary text, no JSON, no formatting, no preamble

Correspondence:
${correspondenceText}`,
        },
      ],
    })

    const correspondenceSummary = message.content[0].type === 'text' ? message.content[0].text.trim() : 'Unable to generate summary.'

    // If contract data exists, get contract status
    let contractStatus: string | null = null
    if (hasContractData) {
      const contractMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Today's date is ${todayFormatted}.

Analyze this contract:
- Start Date: ${business.contract_start ? new Date(business.contract_start).toLocaleDateString('en-GB') : 'Not set'}
- End Date: ${business.contract_end ? new Date(business.contract_end).toLocaleDateString('en-GB') : 'Not set'}
- Deal Terms: ${business.deal_terms || 'Not set'}
- Contract Amount: ${business.contract_amount ? `£${business.contract_amount.toLocaleString('en-GB')}` : 'Not set'}

Provide ONLY a brief 1-sentence contract status. Just the sentence, no JSON, no formatting.`,
          },
        ],
      })
      contractStatus = contractMessage.content[0].type === 'text' ? contractMessage.content[0].text.trim() : null
    }

    return {
      data: {
        correspondence_summary: correspondenceSummary,
        contract_status: contractStatus,
      },
    }
  } catch (err) {
    console.error('AI Summary Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)

    // If AI fails, return a simple fallback
    return { error: `Summary generation failed: ${errorMessage}` }
  }
}
