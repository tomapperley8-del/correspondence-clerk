'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export type ChatMessageRole = 'user' | 'assistant'

export interface ToolCallInfo {
  name: string
  summary?: string
}

export interface ChatMessageData {
  id: string
  role: ChatMessageRole
  content: string
  toolCalls?: ToolCallInfo[]
}

interface ChatMessageProps {
  message: ChatMessageData
}

/**
 * Renders a single chat message — user or assistant.
 * Detects email draft blocks and renders them with a Copy button.
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Tool call indicators */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-0.5 w-full">
          {message.toolCalls.map((tc, i) => (
            <div key={i} className="text-xs text-gray-400 italic px-1">
              {tc.summary || formatToolName(tc.name)}
            </div>
          ))}
        </div>
      )}

      {/* Message bubble */}
      <div
        className={`max-w-[90%] rounded-sm px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#2C4A6E] text-white'
            : 'bg-[#F5F5F3] text-gray-800 border border-gray-200'
        }`}
      >
        <MessageContent content={message.content} isUser={isUser} />
      </div>
    </div>
  )
}

/**
 * Parses message content, pulling out email draft blocks
 */
function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{content}</span>
  }

  // Split on email draft blocks: look for ```email ... ``` or Subject: line patterns
  const parts = splitEmailDrafts(content)

  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) =>
        part.type === 'email' ? (
          <EmailDraftCard key={i} content={part.content} />
        ) : (
          <MarkdownLite key={i} text={part.content} />
        )
      )}
    </div>
  )
}

/**
 * Renders an email draft with a Copy button
 */
function EmailDraftCard({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="bg-white border-2 border-gray-300 rounded-sm p-3 relative">
      <div className="flex justify-between items-start mb-1">
        <span className="text-xs font-medium text-[#7C9A5E] uppercase tracking-wide">
          Draft Email
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-xs h-6 px-2 text-gray-500 hover:text-gray-800"
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm font-[Inter,sans-serif] text-gray-800 leading-relaxed">
        {content}
      </pre>
    </div>
  )
}

/**
 * Lightweight markdown rendering — handles bold, lists, and line breaks.
 * No external library needed.
 */
function MarkdownLite({ text }: { text: string }) {
  if (!text.trim()) return null

  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Numbered list items
    if (/^\d+\.\s/.test(line)) {
      elements.push(
        <div key={i} className="pl-2 flex gap-1.5">
          <span className="text-gray-400 shrink-0">{line.match(/^\d+\./)?.[0]}</span>
          <span>{renderInline(line.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      )
      continue
    }

    // Bullet list items
    if (/^[-•*]\s/.test(line)) {
      elements.push(
        <div key={i} className="pl-2 flex gap-1.5">
          <span className="text-gray-400 shrink-0">•</span>
          <span>{renderInline(line.replace(/^[-•*]\s*/, ''))}</span>
        </div>
      )
      continue
    }

    // Headings (### / ## / #)
    if (/^#{1,3}\s/.test(line)) {
      elements.push(
        <div key={i} className="font-semibold mt-1">
          {renderInline(line.replace(/^#{1,3}\s*/, ''))}
        </div>
      )
      continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={i} className="h-1" />)
      continue
    }

    // Regular text
    elements.push(
      <div key={i}>
        {renderInline(line)}
      </div>
    )
  }

  return <div className="flex flex-col">{elements}</div>
}

/**
 * Handles **bold** and `code` within a line
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // Split on **bold** and `code` patterns
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      // Code
      parts.push(
        <code key={match.index} className="bg-gray-100 px-1 rounded text-xs font-mono">
          {match[3]}
        </code>
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/**
 * Split content into regular text and email draft blocks.
 * Detects: ```email ... ```, or blocks starting with "Subject:" followed by body text.
 */
function splitEmailDrafts(
  content: string
): Array<{ type: 'text' | 'email'; content: string }> {
  const parts: Array<{ type: 'text' | 'email'; content: string }> = []

  // First, handle fenced code blocks marked as email
  const fencedRegex = /```(?:email)?\s*\n(Subject:[\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = fencedRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim()
      if (before) parts.push({ type: 'text', content: before })
    }
    parts.push({ type: 'email', content: match[1].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex > 0) {
    const remaining = content.slice(lastIndex).trim()
    if (remaining) parts.push({ type: 'text', content: remaining })
    return parts
  }

  // Fallback: detect "Subject:" blocks that aren't inside fenced blocks
  // Look for Subject: followed by a blank line then body text, ending at next double newline or end
  const subjectRegex = /(?:^|\n\n)(Subject:\s*.+\n(?:[\s\S]*?)?)(?=\n\n(?!(?:Dear|Hi|Hello|Hey|Thanks|Best|Kind|Regards))|\n*$)/g

  while ((match = subjectRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim()
      if (before) parts.push({ type: 'text', content: before })
    }
    parts.push({ type: 'email', content: match[1].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex > 0) {
    const remaining = content.slice(lastIndex).trim()
    if (remaining) parts.push({ type: 'text', content: remaining })
    return parts
  }

  // No email drafts detected
  return [{ type: 'text', content }]
}

/**
 * Format a tool name into something readable
 */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\bget\b/i, 'Looking up')
    .replace(/\bsearch\b/i, 'Searching')
    .replace(/\brun query\b/i, 'Running query')
}
