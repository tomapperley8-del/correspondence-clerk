'use client'

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useChat } from '@/components/ChatContext'
import { ChatMessage, type ChatMessageData, type ToolCallInfo } from '@/components/ChatMessage'

/**
 * Slide-out chat panel for the AI Outreach Assistant.
 * Smooth streaming via rAF render loop with mutable refs.
 */
export function ChatPanel() {
  const { isOpen, close } = useChat()
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCallInfo[]>([])
  const [streamingPhase, setStreamingPhase] = useState<'idle' | 'thinking' | 'tools' | 'writing'>('idle')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isNearBottom = useRef(true)

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el && isNearBottom.current) {
        el.scrollTop = el.scrollHeight
      }
    })
  }, [])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200)
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
    setStreamingPhase('thinking')
    setPendingToolCalls([])

    // Build message history for API
    const apiMessages = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Create placeholder assistant message
    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', toolCalls: [] },
    ])

    // Mutable state for the rAF render loop
    let accText = ''
    let accTools: ToolCallInfo[] = []
    let rendering = true

    // Render loop — syncs mutable state to React at screen refresh rate
    let lastText = ''
    let lastToolCount = 0

    const tick = () => {
      if (!rendering) return
      if (accText !== lastText || accTools.length !== lastToolCount) {
        lastText = accText
        lastToolCount = accTools.length
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: accText, toolCalls: [...accTools] }
              : m
          )
        )
        scrollToBottom()
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))

              switch (eventType) {
                case 'text_delta':
                  if (streamingPhase !== 'writing') setStreamingPhase('writing')
                  accText += data.text
                  break

                case 'tool_call':
                  setStreamingPhase('tools')
                  accTools = [...accTools, { name: data.name }]
                  setPendingToolCalls([...accTools])
                  break

                case 'tool_result': {
                  const idx = accTools.findIndex(
                    (tc) => tc.name === data.name && !tc.summary
                  )
                  if (idx >= 0) {
                    accTools = accTools.map((tc, i) =>
                      i === idx ? { ...tc, summary: data.summary } : tc
                    )
                  }
                  setPendingToolCalls([...accTools])
                  setStreamingPhase('thinking')
                  break
                }

                case 'error':
                  accText += `\n\nError: ${data.message}`
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

      // Stop render loop and final sync
      rendering = false
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accText, toolCalls: accTools }
            : m
        )
      )
    } catch (err) {
      rendering = false
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${errorMessage}` } : m
        )
      )
    } finally {
      rendering = false
      setIsStreaming(false)
      setStreamingPhase('idle')
      setPendingToolCalls([])
    }
  }, [input, isStreaming, messages, scrollToBottom, streamingPhase])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([])
    setPendingToolCalls([])
    setStreamingPhase('idle')
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed top-16 right-0 bottom-0 w-full max-w-[480px] bg-white z-50 shadow-xl flex flex-col border-l border-gray-200 transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
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
        <div
          ref={scrollRef}
          onScroll={checkNearBottom}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 mt-8">
              <p className="mb-2 font-medium text-gray-500">Outreach Assistant</p>
              <p>
                Ask me about your businesses, correspondence, or say &ldquo;do
                it&rdquo; to run the full outreach workflow.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Tool call indicators during streaming */}
          {isStreaming && pendingToolCalls.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {pendingToolCalls
                .filter((tc) => !tc.summary)
                .map((tc, i) => (
                  <div
                    key={i}
                    className="text-xs text-gray-400 italic px-1 animate-pulse"
                  >
                    {formatToolName(tc.name)}...
                  </div>
                ))}
            </div>
          )}

          {/* Thinking indicator — visible when waiting for API or between tool calls */}
          {isStreaming && (streamingPhase === 'thinking' || streamingPhase === 'tools') && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="inline-block w-1.5 h-1.5 bg-[#7C9A5E] rounded-full animate-pulse" />
              {streamingPhase === 'tools' ? 'Looking up data...' : 'Thinking...'}
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
          <p className="text-[10px] text-gray-400 mt-1">Shift+Enter for new line</p>
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
