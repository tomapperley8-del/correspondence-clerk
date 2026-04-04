/**
 * API route for free email cleaning tool
 * Simplified version of the main formatter for lead generation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'

const anthropic = getAnthropicClient()

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text is too long. Maximum 10,000 characters.' },
        { status: 400 }
      )
    }

    // Simple rate limiting by IP (basic)
    // In production, use proper rate limiting

    const cleanedText = await cleanEmail(text)

    return NextResponse.json({ cleaned_text: cleanedText })
  } catch (error) {
    console.error('Email cleaning error:', error)
    return NextResponse.json(
      { error: 'Failed to clean email' },
      { status: 500 }
    )
  }
}

async function cleanEmail(text: string): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: AI_MODELS.ECONOMY,
      max_tokens: 2000,
      system: [{ type: 'text' as const, text: 'Clean up email text. Remove unnecessary quoted text, fix formatting, but preserve actual content and wording exactly. Return ONLY the cleaned email text.', cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: text }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    return content.text
  } catch (error) {
    console.error('Anthropic API error:', error)
    // Fallback: return original text with basic cleanup
    return basicCleanup(text)
  }
}

/**
 * Basic cleanup fallback if AI fails
 */
function basicCleanup(text: string): string {
  let cleaned = text

  // Remove excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // Remove quoted reply markers
  cleaned = cleaned.replace(/^>+\s*/gm, '')

  // Remove "On ... wrote:" lines
  cleaned = cleaned.replace(/^On .* wrote:$/gm, '')

  // Remove forwarded message markers
  cleaned = cleaned.replace(/^-{2,}\s*Forwarded message\s*-{2,}$/gim, '')

  // Trim whitespace
  cleaned = cleaned.trim()

  return cleaned
}

export const dynamic = 'force-dynamic'
