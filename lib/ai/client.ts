/**
 * Shared Anthropic client — lazy singleton.
 * All AI consumers should import from here instead of creating their own client.
 */

import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

/**
 * Master switch for the app's own AI calls. Set AI_ENABLED=false to stop every
 * call without touching the callers: requests fail immediately, and each caller
 * falls back exactly as it does on any AI error (inbound email is stored
 * unformatted, for example). The judgement work runs in the Claude routines.
 */
export function isAiEnabled(): boolean {
  return process.env.AI_ENABLED !== 'false'
}

const aiSwitchedOff: typeof fetch = () =>
  Promise.reject(new Error('AI is switched off (AI_ENABLED=false)'))

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables.')
    }
    _client = isAiEnabled()
      ? new Anthropic({ apiKey })
      : new Anthropic({ apiKey, fetch: aiSwitchedOff, maxRetries: 0 })
  }
  return _client
}
