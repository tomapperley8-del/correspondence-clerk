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
  direction_guess?: 'sent' | 'received' | null; // For emails: sent by us or received from them
  formatted_text: string;
  warnings: string[];
  extracted_names?: {
    sender: string | null;
    recipient: string | null;
  };
}

/**
 * Single entry response (no thread split)
 */
export interface SingleEntryResponse {
  subject_guess: string;
  entry_type_guess: EntryType;
  entry_date_guess: string | null;
  direction_guess?: 'sent' | 'received' | null; // For emails: sent by us or received from them
  formatted_text: string;
  warnings: string[];
  extracted_names?: {
    sender: string | null;
    recipient: string | null;
  };
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

/**
 * Action types for correspondence
 */
export type ActionType = 'prospect' | 'follow_up' | 'waiting_on_them' | 'invoice' | 'renewal';

/**
 * Single action suggestion from AI
 */
export interface ActionSuggestion {
  action_type: ActionType;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string; // 1 sentence max
  triggering_entry_id: string | null;
  suggested_due_date: string | null;
  priority: 'low' | 'medium' | 'high';
}

/**
 * AI action detection response
 */
export interface ActionDetectionResponse {
  suggestions: ActionSuggestion[];
  warnings: string[];
}
