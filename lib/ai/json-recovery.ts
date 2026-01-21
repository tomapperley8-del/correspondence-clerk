export interface RecoveryResult {
  success: boolean
  data?: any
  error?: string
  attemptedFixes?: string[]
}

export function parseWithRecovery(rawText: string): RecoveryResult {
  // Stage 1: Strip only obvious markdown/code block wrappers (minimal cleanup)
  const cleaned = stripWrappingArtifacts(rawText)

  // Stage 2: Try standard parse
  try {
    const parsed = JSON.parse(cleaned)
    return {
      success: true,
      data: parsed,
      attemptedFixes: cleaned !== rawText ? ['stripped markdown wrappers'] : []
    }
  } catch (error) {
    // Stage 3: Log comprehensive debugging info
    logParsingError(rawText, error, cleaned)

    // Stage 4: Return graceful failure with clear message
    return {
      success: false,
      error: createUserFriendlyError(error),
      attemptedFixes: ['stripped markdown wrappers']
    }
  }
}

function createUserFriendlyError(error: any): string {
  const errorMsg = error.message || 'Unknown error'

  if (errorMsg.includes('Unterminated string')) {
    return 'The AI returned malformed text (unterminated string). This sometimes happens with very long or complex content. Your original text is preserved.'
  }

  if (errorMsg.includes('Unexpected token')) {
    return 'The AI returned unexpected formatting. Your original text is preserved and you can save it without formatting.'
  }

  if (errorMsg.includes('Unexpected end of JSON')) {
    return 'The AI response was incomplete or truncated. Your original text is preserved.'
  }

  return `JSON parsing failed: ${errorMsg}. Your original text is preserved.`
}

function stripWrappingArtifacts(text: string): string {
  // Remove markdown code blocks: ```json...```, ```...```
  let cleaned = text.trim()

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json|markdown)?\n?/, '')
    cleaned = cleaned.replace(/\n?```$/, '')
  }

  // Remove """json...""" or similar
  if (cleaned.startsWith('"""')) {
    cleaned = cleaned.replace(/^"""\w*\n?/, '')
    cleaned = cleaned.replace(/\n?"""$/, '')
  }

  // Remove leading/trailing prose sometimes added by Claude
  // Look for first { and last }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  return cleaned.trim()
}

function logParsingError(original: string, error: any, cleaned: string): void {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('AI Response JSON Parsing Failed')
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('Timestamp:', new Date().toISOString())
  console.error('Error:', error.message)

  // Extract position from error message if available
  const positionMatch = error.message.match(/position (\d+)/)
  const position = positionMatch ? parseInt(positionMatch[1], 10) : null

  console.error('Response length:', original.length, 'bytes')
  console.error('Cleaned length:', cleaned.length, 'bytes')

  if (position !== null) {
    console.error('Error position:', position)

    // Show context around error position (50 chars before/after)
    const contextStart = Math.max(0, position - 50)
    const contextEnd = Math.min(cleaned.length, position + 50)
    const context = cleaned.substring(contextStart, contextEnd)
    console.error('Context around error:')
    console.error(context)
    console.error(' '.repeat(Math.min(50, position - contextStart)) + '^--- Error here')
  }

  // Log first 2KB and last 2KB for debugging (truncate if very large)
  const maxLog = 2048
  console.error('\n--- First', maxLog, 'chars of response ---')
  console.error(original.substring(0, maxLog))

  if (original.length > maxLog) {
    console.error('\n--- Last', maxLog, 'chars of response ---')
    console.error(original.substring(original.length - maxLog))
  }

  console.error('\n--- Cleaned response (first 1KB) ---')
  console.error(cleaned.substring(0, 1024))

  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}
