/**
 * Thread Detection Utilities
 * Lightweight heuristics to detect if text looks like an email thread
 * Per CLAUDE.md: Only suggest splitting when confidence is high
 */

export interface ThreadDetectionResult {
  looksLikeThread: boolean;
  confidence: 'low' | 'medium' | 'high';
  indicators: string[];
}

/**
 * Common email header patterns
 */
const EMAIL_HEADER_PATTERNS = [
  /^From:\s*.+/im,
  /^To:\s*.+/im,
  /^Subject:\s*.+/im,
  /^Date:\s*.+/im,
  /^Sent:\s*.+/im,
  /^On\s+.+wrote:/im,
  /^[-]{3,}\s*Original Message\s*[-]{3,}/im,
  /^[-]{3,}\s*Forwarded Message\s*[-]{3,}/im,
  /^_{5,}/m, // Outlook-style separators
];

/**
 * Patterns that suggest multiple emails in one paste
 */
const THREAD_INDICATORS = [
  /From:[\s\S]{20,}?From:/i, // Multiple "From:" headers
  /On\s+.+wrote:[\s\S]{50,}?On\s+.+wrote:/i, // Multiple "On...wrote:" patterns
  /Subject:[\s\S]{20,}?Subject:/i, // Multiple subjects
];

/**
 * Analyze raw text to detect if it looks like an email thread
 *
 * @param rawText - The raw correspondence text
 * @returns ThreadDetectionResult with confidence level and indicators
 */
export function detectEmailThread(rawText: string): ThreadDetectionResult {
  const indicators: string[] = [];
  let headerCount = 0;
  let threadPatternMatches = 0;

  // Count email header patterns
  EMAIL_HEADER_PATTERNS.forEach((pattern) => {
    if (pattern.test(rawText)) {
      headerCount++;
    }
  });

  // Check for multiple emails
  THREAD_INDICATORS.forEach((pattern) => {
    const matches = rawText.match(pattern);
    if (matches) {
      threadPatternMatches++;
      indicators.push(`Found multiple ${pattern.source.split(':')[0]} patterns`);
    }
  });

  // Count how many times common separator patterns appear
  const separatorCount = (rawText.match(/^[-_]{5,}/gm) || []).length;
  if (separatorCount >= 2) {
    indicators.push(`${separatorCount} separator lines detected`);
    threadPatternMatches++;
  }

  // Look for forwarded/reply chains
  const forwardReplyCount = (
    rawText.match(/(forwarded|original message|reply|re:|fwd:)/gi) || []
  ).length;
  if (forwardReplyCount >= 2) {
    indicators.push(`${forwardReplyCount} forward/reply keywords found`);
  }

  // Determine confidence
  let confidence: 'low' | 'medium' | 'high' = 'low';
  let looksLikeThread = false;

  if (threadPatternMatches >= 2) {
    confidence = 'high';
    looksLikeThread = true;
    indicators.push('High confidence: multiple thread patterns detected');
  } else if (threadPatternMatches === 1 || (headerCount >= 4 && separatorCount >= 1)) {
    confidence = 'medium';
    looksLikeThread = true;
    indicators.push('Medium confidence: some thread indicators present');
  } else if (headerCount >= 3) {
    confidence = 'low';
    looksLikeThread = false;
    indicators.push('Low confidence: might be a single formatted email');
  } else {
    indicators.push('Does not look like an email thread');
  }

  return {
    looksLikeThread,
    confidence,
    indicators,
  };
}

/**
 * Determine if split toggle should default to ON
 * Only default to ON when confidence is high
 *
 * @param rawText - The raw correspondence text
 * @returns boolean - true if toggle should default ON
 */
export function shouldDefaultToSplit(rawText: string): boolean {
  const detection = detectEmailThread(rawText);
  return detection.looksLikeThread && detection.confidence === 'high';
}
