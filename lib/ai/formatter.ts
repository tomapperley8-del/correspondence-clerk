/**
 * AI Formatter Service
 * Integrates with Anthropic API to format correspondence
 * Per CLAUDE.md: PRESERVE USER WORDING EXACTLY, STRICT JSON ONLY, FAIL GRACEFULLY
 */

import { stripQuotedContent } from '@/lib/inbound/utils';
import { getAnthropicClient } from './client';
import { AI_MODELS } from './models';
import {
  AIFormatterResponse,
  FormattingResult,
  SingleEntryResponse,
  ThreadSplitResponse,
} from './types';

/**
 * JSON Schema for single entry formatting
 * Used with Anthropic structured outputs to guarantee valid JSON
 */
const SINGLE_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    subject_guess: { type: 'string' },
    entry_type_guess: {
      type: 'string',
      enum: ['Email', 'Call', 'Meeting']
    },
    entry_date_guess: {
      anyOf: [
        { type: 'string', format: 'date-time' },
        { type: 'null' }
      ]
    },
    direction_guess: {
      enum: ['sent', 'received', null]
    },
    formatted_text: { type: 'string' },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    },
    extracted_names: {
      type: 'object',
      properties: {
        sender: {
          anyOf: [
            { type: 'string' },
            { type: 'null' }
          ]
        },
        recipient: {
          anyOf: [
            { type: 'string' },
            { type: 'null' }
          ]
        }
      },
      additionalProperties: false
    },
    action_suggestion: {
      anyOf: [
        {
          type: 'object',
          properties: {
            action_type: {
              type: 'string',
              enum: ['prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal']
            },
            confidence: {
              type: 'string',
              enum: ['low', 'medium', 'high']
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high']
            },
            suggested_due_date: {
              anyOf: [
                { type: 'string' },
                { type: 'null' }
              ]
            }
          },
          required: ['action_type', 'confidence', 'priority', 'suggested_due_date'],
          additionalProperties: false
        },
        { type: 'null' }
      ]
    }
  },
  required: ['subject_guess', 'entry_type_guess', 'entry_date_guess', 'formatted_text', 'warnings'],
  additionalProperties: false
} as const;

/**
 * JSON Schema for thread split formatting
 */
const THREAD_SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subject_guess: { type: 'string' },
          entry_type_guess: {
            type: 'string',
            enum: ['Email', 'Call', 'Meeting']
          },
          entry_date_guess: {
            anyOf: [
              { type: 'string', format: 'date-time' },
              { type: 'null' }
            ]
          },
          direction_guess: {
            enum: ['sent', 'received', null]
          },
          formatted_text: { type: 'string' },
          warnings: {
            type: 'array',
            items: { type: 'string' }
          },
          extracted_names: {
            type: 'object',
            properties: {
              sender: {
                anyOf: [
                  { type: 'string' },
                  { type: 'null' }
                ]
              },
              recipient: {
                anyOf: [
                  { type: 'string' },
                  { type: 'null' }
                ]
              }
            },
            additionalProperties: false
          },
          action_suggestion: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  action_type: {
                    type: 'string',
                    enum: ['prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal']
                  },
                  confidence: {
                    type: 'string',
                    enum: ['low', 'medium', 'high']
                  },
                  priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high']
                  },
                  suggested_due_date: {
                    anyOf: [
                      { type: 'string' },
                      { type: 'null' }
                    ]
                  }
                },
                required: ['action_type', 'confidence', 'priority', 'suggested_due_date'],
                additionalProperties: false
              },
              { type: 'null' }
            ]
          }
        },
        required: ['subject_guess', 'entry_type_guess', 'entry_date_guess', 'formatted_text', 'warnings'],
        additionalProperties: false
      }
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['entries', 'warnings'],
  additionalProperties: false
} as const;

/**
 * System prompt that enforces Hard Rules
 */
const SYSTEM_PROMPT = `You are a formatting and action-detection assistant for a correspondence filing system.

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
- Detect any single pending action in the text (action_suggestion field)

ACTION DETECTION RULES:
- Only suggest an action if explicitly mentioned in the text — NEVER invent one
- action_type must be one of: prospect, follow_up, waiting_on_them, invoice, renewal
- Set confidence based on how explicit the trigger is: "I'll follow up next week" = high, vague hints = low
- suggested_due_date: extract if mentioned (ISO 8601 date), otherwise null
- If no clear action is present, set action_suggestion to null

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
 * Attempt deterministic extraction for short, well-structured emails.
 * Returns a SingleEntryResponse if the email matches known patterns, or null if AI is needed.
 * This avoids an API call for trivially simple emails (confirmations, short replies, etc.)
 */
function tryDeterministicExtraction(text: string): SingleEntryResponse | null {
  const stripped = text.trim()
  // Only attempt for short emails (under 600 chars after stripping)
  if (stripped.length > 600) return null

  // Must have recognisable email headers
  const fromMatch = stripped.match(/^From:\s*(.+?)(?:\s*<(.+?)>)?$/im)
  const subjectMatch = stripped.match(/^Subject:\s*(.+)$/im)
  const dateMatch = stripped.match(/^(?:Sent|Date):\s*(.+)$/im)
  const toMatch = stripped.match(/^To:\s*(.+?)(?:\s*<(.+?)>)?$/im)

  // Need at least subject + date to proceed
  if (!subjectMatch || !dateMatch) return null

  // Parse the date
  let parsedDate: string | null = null
  const dateStr = dateMatch[1].trim()
  // Try DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY patterns
  const britishDate = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (britishDate) {
    const [, day, month, year] = britishDate
    const d = new Date(Number(year), Number(month) - 1, Number(day))
    if (!isNaN(d.getTime())) parsedDate = d.toISOString().split('T')[0]
  }
  if (!parsedDate) {
    // Try native Date parsing as fallback
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) parsedDate = d.toISOString().split('T')[0]
  }
  if (!parsedDate) return null // Can't parse date — let AI handle it

  // Extract body: everything after the last header line
  const headerPattern = /^(?:From|To|Cc|Bcc|Sent|Date|Subject):\s*.+$/gim
  let lastHeaderEnd = 0
  let match
  while ((match = headerPattern.exec(stripped)) !== null) {
    lastHeaderEnd = match.index + match[0].length
  }
  const body = stripped.substring(lastHeaderEnd).trim()
  if (!body || body.length < 5) return null // No meaningful body

  // Determine direction from From: header
  const senderName = fromMatch?.[1]?.trim().replace(/["']/g, '') || null
  const recipientName = toMatch?.[1]?.trim().replace(/["']/g, '') || null

  return {
    subject_guess: subjectMatch[1].trim().substring(0, 90),
    entry_type_guess: 'Email',
    entry_date_guess: parsedDate,
    direction_guess: null, // Let the caller determine direction from context
    formatted_text: body,
    warnings: [],
    extracted_names: {
      sender: senderName,
      recipient: recipientName,
    },
    action_suggestion: null,
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

    // For thread splitting, use raw text — stripping removes From:/Sent:/To: headers
    // that the AI needs to find where each email begins and ends.
    // For single-email mode, strip quoted/replied content as normal.
    const cleanText = shouldSplit ? rawText.trim() : stripQuotedContent(rawText)

    // Capture what was stripped for metadata (primarily "---Original Message---" blocks)
    // Only relevant in single-email mode where we actually strip.
    let quotedContent: string | undefined
    if (!shouldSplit && cleanText !== rawText.trim()) {
      const originalMsgMatch = rawText.match(/(-{3,}\s*original\s+message\s*-{3,}[\s\S]*)/i)
      const onWroteMatch = rawText.match(/(on\s+.{5,80}\s+wrote:[\s\S]*)/i)
      const fromSentToMatch = rawText.match(/(^from:\s.+\nsent:\s.+\nto:.+(?:\nsubject:.+)?[\s\S]*)/im)
      quotedContent = (originalMsgMatch?.[0] || onWroteMatch?.[0] || fromSentToMatch?.[0])?.trim()
    }

    // Fast path: skip AI for short, well-structured emails with clear headers
    if (!shouldSplit) {
      const deterministicResult = tryDeterministicExtraction(cleanText)
      if (deterministicResult) {
        return {
          success: true,
          data: deterministicResult,
          quotedContent,
        }
      }
    }

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
      },
      "action_suggestion": {
        "action_type": "follow_up" | "prospect" | "waiting_on_them" | "invoice" | "renewal",
        "confidence": "low" | "medium" | "high",
        "priority": "low" | "medium" | "high",
        "suggested_due_date": "YYYY-MM-DD or null"
      } or null
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
   - "sent" if sender is "me", "I", "Bridget", "Tom", "James", "Dawn", or @chiswickcalendar.co.uk
   - "received" for all other senders
   - null if cannot determine
5. CRITICAL: Strip headers from formatted_text
   - Remove "From:", "Sent:", "Subject:" lines
   - Remove "Email from... to..., date" line
   - Start formatted_text with actual message content
6. Preserve exact wording - no summarization
7. Order chronologically (oldest first)

Text to process:
${cleanText}`
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
  } (optional - only for emails),
  "action_suggestion": {
    "action_type": "follow_up" | "prospect" | "waiting_on_them" | "invoice" | "renewal",
    "confidence": "low" | "medium" | "high",
    "priority": "low" | "medium" | "high",
    "suggested_due_date": "YYYY-MM-DD or null"
  } or null (null if no pending action detected)
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
${cleanText}`;

    const response = await client.beta.messages.create({
      // Thread splitting requires more reasoning (date extraction, direction detection across
      // multiple emails) — use Sonnet. Single-email formatting stays on Haiku.
      model: shouldSplit ? AI_MODELS.PREMIUM : AI_MODELS.ECONOMY,
      max_tokens: 4096,
      temperature: 0,
      betas: ['structured-outputs-2025-11-13'],
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      output_format: {
        type: 'json_schema',
        schema: shouldSplit ? THREAD_SPLIT_SCHEMA : SINGLE_ENTRY_SCHEMA,
      },
    });

    // Check if response was truncated
    if (response.stop_reason === 'max_tokens') {
      console.error('Response truncated due to max_tokens limit');
      return {
        success: false,
        error: 'This correspondence is too long to format in one request. Please split it into smaller sections.',
        shouldSaveUnformatted: true,
      };
    }

    // Extract text from response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('AI response was not text');
    }

    // With structured outputs, response is guaranteed to be valid JSON
    const jsonText = content.text.trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      // This should never happen with structured outputs
      console.error('Unexpected JSON parse error with structured outputs:', parseError);
      console.error('Raw response:', jsonText.substring(0, 1000));
      throw new Error('Failed to parse AI response despite structured outputs');
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
      quotedContent,
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
