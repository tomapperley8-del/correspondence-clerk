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
  return obj as unknown as SingleEntryResponse;
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
    throw new Error(
      `${context}: subject_guess must be a string (got ${typeof obj.subject_guess}: ${JSON.stringify(obj.subject_guess)})`
    );
  }

  if (
    obj.entry_type_guess !== 'Email' &&
    obj.entry_type_guess !== 'Call' &&
    obj.entry_type_guess !== 'Meeting'
  ) {
    throw new Error(
      `${context}: entry_type_guess must be Email, Call, or Meeting (got ${obj.entry_type_guess})`
    );
  }

  if (obj.entry_date_guess !== null && typeof obj.entry_date_guess !== 'string') {
    throw new Error(
      `${context}: entry_date_guess must be string or null (got ${typeof obj.entry_date_guess})`
    );
  }

  // direction_guess is optional, but if present must be valid
  if (
    obj.direction_guess !== undefined &&
    obj.direction_guess !== null &&
    obj.direction_guess !== 'sent' &&
    obj.direction_guess !== 'received'
  ) {
    throw new Error(
      `${context}: direction_guess must be "sent", "received", null, or undefined (got ${obj.direction_guess})`
    );
  }

  if (typeof obj.formatted_text !== 'string') {
    throw new Error(
      `${context}: formatted_text must be a string (got ${typeof obj.formatted_text})`
    );
  }

  if (!Array.isArray(obj.warnings)) {
    throw new Error(`${context}: warnings must be an array (got ${typeof obj.warnings})`);
  }

  // extracted_names is optional, but if present must be valid
  if (obj.extracted_names !== undefined) {
    if (typeof obj.extracted_names !== 'object' || obj.extracted_names === null) {
      throw new Error(
        `${context}: extracted_names must be an object (got ${typeof obj.extracted_names})`
      );
    }

    const extractedNames = obj.extracted_names as Record<string, unknown>;

    if (
      extractedNames.sender !== null &&
      extractedNames.sender !== undefined &&
      typeof extractedNames.sender !== 'string'
    ) {
      throw new Error(
        `${context}: extracted_names.sender must be string, null, or undefined (got ${typeof extractedNames.sender})`
      );
    }

    if (
      extractedNames.recipient !== null &&
      extractedNames.recipient !== undefined &&
      typeof extractedNames.recipient !== 'string'
    ) {
      throw new Error(
        `${context}: extracted_names.recipient must be string, null, or undefined (got ${typeof extractedNames.recipient})`
      );
    }
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
      ? `YOU MUST SPLIT THIS CORRESPONDENCE INTO SEPARATE INDIVIDUAL EMAILS.

CRITICAL: Recognize BOTH standard email formats AND Word document formats:

FORMAT 1 - Standard Email Headers:
Look for "From:", "Sent:", "To:", "Subject:", "Date:", or "On...wrote:" patterns.

FORMAT 2 - Word Document Format:
Look for "Email from [Name] to [Name], [Date]" pattern.
Examples:
- "Email from me to Freddie Mitchell, 14/12/2025"
- "Email from Freddie to me, 5/01/2026"

SEPARATORS:
- Dotted lines: ……………… (20+ dots)
- Dashed lines: ----------- (5+ dashes)
- Underscores: ___________ (5+ underscores)

Each time you see headers OR separators, that's a SEPARATE email needing its own entry.

Return JSON with this EXACT structure:
{
  "entries": [
    {
      "subject_guess": "string (max 90 chars, required)",
      "entry_type_guess": "Email",
      "entry_date_guess": "ISO 8601 string or null",
      "direction_guess": "sent" | "received" | null,
      "formatted_text": "string (ONLY this email's content)",
      "warnings": [],
      "extracted_names": {
        "sender": "string or null",
        "recipient": "string or null"
      }
    }
  ],
  "warnings": []
}

RULES:
1. Create SEPARATE entry for EACH email
2. Extract dates:
   - From "Sent:" or "Date:" headers → ISO 8601
   - From "Email from... to..., DD/MM/YYYY" → ISO 8601
   - Examples: "14/12/2025" → "2025-12-14T00:00:00Z", "5/01/2026" → "2026-01-05T00:00:00Z"
   - British format is DD/MM/YYYY
3. Extract names from headers:
   - Standard: From "From:" header
   - Word format: From "Email from [Sender] to [Recipient]"
   - Store in extracted_names field
   - Use null if cannot extract
4. Determine direction:
   - "sent" if sender is "me", "I", "Bridget", or @chiswickcalendar.co.uk
   - "received" for all other senders
   - null if cannot determine
5. CRITICAL: Strip headers from formatted_text
   - Remove "From:", "Sent:", "Subject:" lines
   - Remove "Email from... to..., date" line
   - Start formatted_text with actual message content
6. Preserve exact wording - no summarization
7. Order chronologically (oldest first)

Text to process:
${rawText}`
      : `Format this correspondence entry.

Return JSON with this EXACT structure:
{
  "subject_guess": "string (max 90 chars, required)",
  "entry_type_guess": "Email" | "Call" | "Meeting" (required),
  "entry_date_guess": "ISO 8601 string or null" (required),
  "direction_guess": "sent" | "received" | null (optional - only for emails),
  "formatted_text": "string (required)",
  "warnings": [] (required array, can be empty),
  "extracted_names": {
    "sender": "string or null",
    "recipient": "string or null"
  } (optional - only for emails)
}

If entry_type_guess is "Email":
- Support BOTH standard format AND Word document format:
  * Standard: "From:", "Sent:", "To:", "Subject:" headers
  * Word format: "Email from [Name] to [Name], DD/MM/YYYY"
- Extract names from headers and store in extracted_names field
- Determine direction_guess:
  * If sender is "me", "I", "Bridget", or @chiswickcalendar.co.uk → "sent"
  * Otherwise → "received"
  * If you cannot determine → null
- Parse dates:
  * Standard: from "Sent:" or "Date:" headers
  * Word format: from "Email from... to..., DD/MM/YYYY" (British format)
  * Convert to ISO 8601
- CRITICAL: Remove email headers from formatted_text. DO NOT include "From:", "Sent:", "To:", "Subject:", "Date:", or "Email from..." lines in the body
- Start formatted_text from the first line AFTER the headers

Text to process:
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
      console.error('Failed to parse AI response. Raw text:', jsonText);
      throw new Error(`Failed to parse AI response as JSON: ${parseError}`);
    }

    // Validate against contract
    let validated: AIFormatterResponse;
    try {
      validated = validateAIResponse(parsed);
    } catch (validationError) {
      console.error('AI response validation failed. Response:', JSON.stringify(parsed, null, 2));
      throw validationError;
    }

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
