/**
 * AI Outreach Assistant API
 * Streaming endpoint with server-side tool execution loop
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { CHAT_SYSTEM_PROMPT } from '@/lib/ai/chat-system-prompt'
import { CHAT_TOOL_DEFINITIONS, executeTool } from '@/lib/ai/chat-tools'

export const maxDuration = 60 // Allow up to 60s for tool loops

type MessageParam = Anthropic.MessageParam
type ContentBlockParam = Anthropic.ContentBlockParam

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return new Response(JSON.stringify({ error: 'No organization found' }), { status: 403 })
  }

  // Rate limit: 20 requests per minute
  const rateLimit = await checkRateLimit({ limit: 20, windowMs: 60000, endpoint: 'chat' })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn)
  }

  // Parse request
  let messages: MessageParam[]
  try {
    const body = await request.json()
    messages = body.messages || []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 })
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        let currentMessages = [...messages]
        let continueLoop = true

        while (continueLoop) {
          // Stream from Anthropic
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 16384,
            system: CHAT_SYSTEM_PROMPT,
            messages: currentMessages,
            tools: CHAT_TOOL_DEFINITIONS as Anthropic.Tool[],
            stream: true,
          })

          let currentText = ''
          const toolUseBlocks: Array<{
            id: string
            name: string
            input: string
          }> = []
          let currentToolId = ''
          let currentToolName = ''
          let currentToolInput = ''
          let stopReason: string | null = null

          for await (const event of response) {
            switch (event.type) {
              case 'content_block_start':
                if (event.content_block.type === 'text') {
                  currentText = ''
                } else if (event.content_block.type === 'tool_use') {
                  currentToolId = event.content_block.id
                  currentToolName = event.content_block.name
                  currentToolInput = ''
                  send('tool_call', { name: currentToolName })
                }
                break

              case 'content_block_delta':
                if (event.delta.type === 'text_delta') {
                  currentText += event.delta.text
                  send('text_delta', { text: event.delta.text })
                } else if (event.delta.type === 'input_json_delta') {
                  currentToolInput += event.delta.partial_json
                }
                break

              case 'content_block_stop':
                if (currentToolId && currentToolName) {
                  toolUseBlocks.push({
                    id: currentToolId,
                    name: currentToolName,
                    input: currentToolInput,
                  })
                  currentToolId = ''
                  currentToolName = ''
                  currentToolInput = ''
                }
                break

              case 'message_delta':
                stopReason = event.delta.stop_reason
                break
            }
          }

          // If there are tool calls, execute them and continue the loop
          if (toolUseBlocks.length > 0 && stopReason === 'tool_use') {
            // Build assistant message content blocks
            const assistantContent: ContentBlockParam[] = []
            if (currentText) {
              assistantContent.push({ type: 'text', text: currentText })
            }
            for (const tool of toolUseBlocks) {
              let parsedInput: Record<string, unknown> = {}
              try {
                parsedInput = JSON.parse(tool.input || '{}')
              } catch {
                // Empty input is fine for some tools
              }
              assistantContent.push({
                type: 'tool_use',
                id: tool.id,
                name: tool.name,
                input: parsedInput,
              })
            }

            // Add assistant message with tool calls
            currentMessages.push({
              role: 'assistant',
              content: assistantContent,
            })

            // Execute tools and build tool result message
            const toolResults: ContentBlockParam[] = []
            for (const tool of toolUseBlocks) {
              let parsedInput: Record<string, unknown> = {}
              try {
                parsedInput = JSON.parse(tool.input || '{}')
              } catch {
                // pass
              }

              const result = await executeTool(tool.name, parsedInput, organizationId)

              send('tool_result', {
                name: tool.name,
                success: result.success,
                summary: result.success
                  ? summariseToolResult(tool.name, result.data)
                  : result.error,
              })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: tool.id,
                content: JSON.stringify(result.success ? result.data : { error: result.error }),
              } as ContentBlockParam)
            }

            // Add tool results
            currentMessages.push({
              role: 'user',
              content: toolResults,
            })

            // Continue the loop — Anthropic will process the tool results
          } else {
            // No more tool calls, we're done
            continueLoop = false
          }
        }

        send('done', {})
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Chat API error:', err)
        send('error', { message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/**
 * Generate a brief human-readable summary of tool results for the UI
 */
function summariseToolResult(toolName: string, data: unknown): string {
  if (!Array.isArray(data)) {
    if (data && typeof data === 'object' && 'name' in data) {
      return `Loaded details for ${(data as Record<string, string>).name}`
    }
    return 'Loaded data'
  }

  const count = data.length
  switch (toolName) {
    case 'get_unreplied_inbounds':
      return `Found ${count} unreplied inbound${count !== 1 ? 's' : ''}`
    case 'get_expiring_contracts':
      return `Found ${count} expiring contract${count !== 1 ? 's' : ''}`
    case 'get_stale_chases':
      return `Found ${count} stale chase${count !== 1 ? 's' : ''}`
    case 'get_correspondence_history':
      return `Loaded ${count} correspondence entr${count !== 1 ? 'ies' : 'y'}`
    case 'search_businesses':
      return `Found ${count} business${count !== 1 ? 'es' : ''}`
    case 'run_query':
      return `Query returned ${count} row${count !== 1 ? 's' : ''}`
    default:
      return `Returned ${count} result${count !== 1 ? 's' : ''}`
  }
}
