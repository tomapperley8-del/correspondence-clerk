/**
 * AI Formatter Service
 * Integrates with Anthropic API to format correspondence
 * Per CLAUDE.md: PRESERVE USER WORDING EXACTLY, STRICT JSON ONLY, FAIL GRACEFULLY
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AIFormatterResponse,
  FormattingResult,
  SingleEntryResponse,
  ThreadSplitResponse,
} from './types';

/**
 * Initialize Anthropic client
 * API key must be in ANTHROPIC_API_KEY environment variable
 */
const getAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not found in environment variables. AI formatting will not work.'
    );
  }
  return new Anthropic({ apiKey });
};

/**
 * System prompt that enforces Hard Rules
 */
const SYSTEM_PROMPT = `You are a formatting assistant for a correspondence filing system.

HARD RULES - YOU MUST FOLLOW THESE EXACTLY:
1. PRESERVE USER WORDING EXACTLY - No rewriting, polishing, summarizing, or tone changes
2. NEVER INVENT CONTENT - No suggestions, reminders, auto follow-ups, or made-up next steps
3. STRICT JSON ONLY - Return ONLY valid JSON, never prose
4. Only improve visual layout, spacing, lists, and obvious headers
5. If uncertain about splitting, include a warning and DO NOT split

Your job is to:
- Format messy text into clean, readable correspondence
- Guess the subject line (max 90 chars, use first meaningful line if no clear subject)
- Guess the entry type (Email, Call, or Meeting)
- Extract the date/time if mentioned in ISO 8601 format, or null if not found
- Detect if this looks like an email thread and optionally split it

NEVER add content that wasn't in the original text.`;

/**
 * Validates that response matches our strict JSON contract
 */
function validateAIResponse(data: unknown): AIFormatterResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('AI response is not a valid object');
  }

  const obj = data as Record<string, unknown>;

  // Check if it's a thread split response
  if ('entries' in obj) {
    const threadResponse = obj as Partial<ThreadSplitResponse>;

    if (!Array.isArray(threadResponse.entries)) {
      throw new Error('Thread response missing valid entries array');
    }

    if (!Array.isArray(threadResponse.warnings)) {
      throw new Error('Thread response missing warnings array');
    }

    // Validate each entry
    threadResponse.entries.forEach((entry, index) => {
      validateSingleEntry(entry, `Entry ${index + 1}`);
    });

    return threadResponse as ThreadSplitResponse;
  }

  // Otherwise validate as single entry
  validateSingleEntry(obj, 'Single entry');
  return obj as SingleEntryResponse;
}

/**
 * Validates a single entry object
 */
function validateSingleEntry(entry: unknown, context: string): void {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`${context}: not a valid object`);
  }

  const obj = entry as Record<string, unknown>;

  if (typeof obj.subject_guess !== 'string') {
    throw new Error(`${context}: subject_guess must be a string`);
  }

  if (
    obj.entry_type_guess !== 'Email' &&
    obj.entry_type_guess !== 'Call' &&
    obj.entry_type_guess !== 'Meeting'
  ) {
    throw new Error(`${context}: entry_type_guess must be Email, Call, or Meeting`);
  }

  if (obj.entry_date_guess !== null && typeof obj.entry_date_guess !== 'string') {
    throw new Error(`${context}: entry_date_guess must be string or null`);
  }

  if (typeof obj.formatted_text !== 'string') {
    throw new Error(`${context}: formatted_text must be a string`);
  }

  if (!Array.isArray(obj.warnings)) {
    throw new Error(`${context}: warnings must be an array`);
  }
}

/**
 * Format correspondence using Anthropic API
 *
 * @param rawText - The raw text to format
 * @param shouldSplit - Whether to attempt thread splitting
 * @returns FormattingResult with either formatted data or error
 */
export async function formatCorrespondence(
  rawText: string,
  shouldSplit: boolean = false
): Promise<FormattingResult> {
  try {
    const client = getAnthropicClient();

    const userPrompt = shouldSplit
      ? `Format and split this email thread into individual entries. Return JSON with an "entries" array and a "warnings" array.

${rawText}`
      : `Format this correspondence entry. Return JSON with subject_guess, entry_type_guess, entry_date_guess, formatted_text, and warnings array.

${rawText}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('AI response was not text');
    }

    let jsonText = content.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError}`);
    }

    // Validate against contract
    const validated = validateAIResponse(parsed);

    return {
      success: true,
      data: validated,
    };
  } catch (error) {
    // Log error for debugging (in production, use proper logging)
    console.error('AI formatting error:', error);

    // Return graceful failure
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      shouldSaveUnformatted: true,
    };
  }
}
