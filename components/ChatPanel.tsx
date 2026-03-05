'use client'

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useChat } from '@/components/ChatContext'
import { ChatMessage, type ChatMessageData, type ToolCallInfo } from '@/components/ChatMessage'

/**
 * Slide-out chat panel for the AI Outreach Assistant.
 * Handles SSE streaming, tool call indicators, and message state.
 */
export function ChatPanel() {
  const { isOpen, close } = useChat()
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCallInfo[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, pendingToolCalls])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsStreaming(true)
    setPendingToolCalls([])

    // Build message history for API
    const apiMessages = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Create placeholder assistant message
    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessageData = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
    }
    setMessages((prev) => [...prev, assistantMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed (${response.status})`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedText = ''
      const accumulatedToolCalls: ToolCallInfo[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))

              switch (eventType) {
                case 'text_delta':
                  accumulatedText += data.text
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulatedText, toolCalls: [...accumulatedToolCalls] }
                        : m
                    )
                  )
                  break

                case 'tool_call':
                  accumulatedToolCalls.push({ name: data.name })
                  setPendingToolCalls([...accumulatedToolCalls])
                  break

                case 'tool_result':
                  // Update the tool call with its summary
                  const idx = accumulatedToolCalls.findIndex(
                    (tc) => tc.name === data.name && !tc.summary
                  )
                  if (idx >= 0) {
                    accumulatedToolCalls[idx] = {
                      ...accumulatedToolCalls[idx],
                      summary: data.summary,
                    }
                  }
                  setPendingToolCalls([...accumulatedToolCalls])
                  break

                case 'error':
                  accumulatedText += `\n\nError: ${data.message}`
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulatedText }
                        : m
                    )
                  )
                  break

                case 'done':
                  break
              }
            } catch {
              // Ignore malformed JSON
            }
            eventType = ''
          }
        }
      }

      // Final update with all tool calls
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulatedText, toolCalls: accumulatedToolCalls }
            : m
        )
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${errorMessage}` }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
      setPendingToolCalls([])
    }
  }, [input, isStreaming, messages])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([])
    setPendingToolCalls([])
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed top-16 right-0 bottom-0 w-full max-w-[480px] bg-white z-50 shadow-xl flex flex-col border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#FAFAF8]">
          <h2 className="font-[Lora,serif] text-lg font-semibold text-[#1E293B]">
            Outreach Assistant
          </h2>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Clear Chat
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={close}
              className="text-gray-500 hover:text-gray-800"
            >
              Close
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 mt-8">
              <p className="mb-2 font-medium text-gray-500">Outreach Assistant</p>
              <p>Ask me about your businesses, correspondence, or say &ldquo;do it&rdquo; to run the full outreach workflow.</p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Streaming tool call indicators */}
          {isStreaming && pendingToolCalls.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {pendingToolCalls
                .filter((tc) => !tc.summary)
                .map((tc, i) => (
                  <div key={i} className="text-xs text-gray-400 italic px-1 animate-pulse">
                    {formatToolName(tc.name)}...
                  </div>
                ))}
            </div>
          )}

          {/* Streaming indicator */}
          {isStreaming && pendingToolCalls.every((tc) => tc.summary) && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="inline-block w-1.5 h-1.5 bg-[#7C9A5E] rounded-full animate-pulse" />
              Thinking...
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 px-4 py-3 bg-[#FAFAF8]">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your businesses..."
              rows={1}
              className="flex-1 resize-none rounded-sm border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#2C4A6E] focus:ring-1 focus:ring-[#2C4A6E] bg-white"
              disabled={isStreaming}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="bg-[#2C4A6E] text-white hover:bg-[#1E293B] rounded-sm px-4 self-end"
            >
              Send
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  )
}

function formatToolName(name: string): string {
  const labels: Record<string, string> = {
    get_unreplied_inbounds: 'Checking unreplied inbounds',
    get_expiring_contracts: 'Checking expiring contracts',
    get_stale_chases: 'Checking stale chases',
    get_correspondence_history: 'Loading correspondence history',
    search_businesses: 'Searching businesses',
    get_business_summary: 'Loading business summary',
    run_query: 'Running database query',
  }
  return labels[name] || name.replace(/_/g, ' ')
}
