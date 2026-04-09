'use client'

/**
 * Lightweight markdown rendering — handles bold, lists, and line breaks.
 * No external library needed.
 */
export function MarkdownLite({ text }: { text: string }) {
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

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      parts.push(
        <code key={match.index} className="bg-gray-100 px-1 rounded text-xs font-mono">
          {match[3]}
        </code>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}
