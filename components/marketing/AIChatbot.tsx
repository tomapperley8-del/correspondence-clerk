'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I couldn\'t process that. Feel free to email us at hello@correspondenceclerk.com',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-3 shadow-lg hover:bg-gray-800 z-50"
        aria-label="Open chat"
      >
        Got questions?
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white border border-gray-200 shadow-lg z-50 flex flex-col max-h-96">
      {/* Header */}
      <div className="flex justify-between items-center p-3 border-b border-gray-200">
        <span className="font-medium text-sm">Questions?</span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-48">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask me anything about Correspondence Clerk. I&apos;m here to help, not to sell.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`text-sm ${
              message.role === 'user'
                ? 'text-right'
                : 'text-left'
            }`}
          >
            <span
              className={`inline-block p-2 ${
                message.role === 'user'
                  ? 'bg-gray-100'
                  : 'bg-gray-50 border border-gray-200'
              }`}
            >
              {message.content}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="text-sm text-gray-400">Thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-gray-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-gray-900 text-white text-sm hover:bg-gray-800 disabled:bg-gray-400"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
