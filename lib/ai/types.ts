/**
 * AI Output Contract Types
 * Strict JSON schemas for Anthropic API responses
 * Per CLAUDE.md Hard Rules: AI returns validated JSON, never prose
 */

export type EntryType = 'Email' | 'Call' | 'Meeting';

/**
 * Single formatted entry from AI
 */
export interface FormattedEntry {
  subject_guess: string;
  entry_type_guess: EntryType;
  entry_date_guess: string | null; // ISO 8601 format
  formatted_text: string;
  warnings: string[];
}

/**
 * Single entry response (no thread split)
 */
export interface SingleEntryResponse {
  subject_guess: string;
  entry_type_guess: EntryType;
  entry_date_guess: string | null;
  formatted_text: string;
  warnings: string[];
}

/**
 * Thread split response (multiple entries)
 */
export interface ThreadSplitResponse {
  entries: FormattedEntry[];
  warnings: string[];
}

/**
 * Union type for AI responses
 */
export type AIFormatterResponse = SingleEntryResponse | ThreadSplitResponse;

/**
 * Type guard to check if response is a thread split
 */
export function isThreadSplitResponse(
  response: AIFormatterResponse
): response is ThreadSplitResponse {
  return 'entries' in response;
}

/**
 * Result of formatting operation (success or failure)
 */
export type FormattingResult =
  | { success: true; data: AIFormatterResponse }
  | { success: false; error: string; shouldSaveUnformatted: true };
