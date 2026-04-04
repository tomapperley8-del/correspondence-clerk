/**
 * Shared Anthropic client — lazy singleton.
 * All AI consumers should import from here instead of creating their own client.
 */

import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables.')
    }
    _client = new Anthropic({ apiKey })
  }
  return _client
}
