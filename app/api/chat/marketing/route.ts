/**
 * Marketing chatbot API
 * Answers questions about Correspondence Clerk in a calm, helpful way
 * No pushy sales tactics - just honest information
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'

let supabaseClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseClient
}

const SYSTEM_PROMPT = `You are a helpful assistant for Correspondence Clerk, a simple tool that helps people keep track of important client emails.

ABOUT THE PRODUCT:
- It's a searchable archive for client correspondence
- You paste in important emails, they get filed by client
- You can search them later when you need to find something
- £7/month, 14-day free trial, no card required
- Works in your browser, nothing to install
- Nothing gets rewritten or changed - your exact words are preserved
- It's not a CRM - no pipelines, no tasks, no automation
- Teams can share the same archive

WHO IT'S FOR:
- Freelance consultants
- Small agencies (2-5 people)
- Accountants and bookkeepers
- Anyone who needs to find "that email from 3 months ago"

YOUR PERSONALITY:
- Helpful but not pushy
- Honest - if it's not right for them, say so
- Calm and reassuring
- No SaaS jargon or hype
- Don't oversell - just answer their question

RULES:
- Keep responses short (2-3 sentences usually)
- If they ask about features we don't have, be honest
- If they seem like they want a CRM, tell them this isn't one
- Don't ask for their email unless they want to try it
- If they're ready to try it, point them to correspondenceclerk.com/signup
- You can ask clarifying questions if needed`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const { message, history, visitor_id } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Build conversation history
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        // Keep last 10 messages
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }
    }

    messages.push({ role: 'user', content: message })

    // Generate response
    const response = await getAnthropicClient().messages.create({
      model: AI_MODELS.ECONOMY,
      max_tokens: 500,
      system: [{ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }],
      messages,
    })

    const responseContent = response.content[0]
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    const assistantResponse = responseContent.text

    // Log conversation for analytics (optional)
    try {
      await getSupabase().from('chatbot_conversations').insert({
        visitor_id: visitor_id || null,
        messages: [...messages, { role: 'assistant', content: assistantResponse }],
        status: 'active',
      })
    } catch {
      // Don't fail if logging fails
    }

    return NextResponse.json({ response: assistantResponse })
  } catch (error) {
    console.error('Chatbot error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
