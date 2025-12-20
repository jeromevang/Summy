/**
 * Lightweight Tokenizer Service
 * 
 * Uses character-based estimation for token counting.
 * No heavy dependencies - just math.
 * 
 * Rationale: Loading @xenova/transformers just for token counting
 * costs 100s of MB of heap. For chunking purposes, estimation is fine.
 */

// Calibrated ratio for code (empirically determined for BERT-style tokenizers)
// Code averages ~3.5-4 chars per token due to camelCase, underscores, etc.
const CODE_CHARS_PER_TOKEN = 3.8;

// For prose/comments, slightly higher
const PROSE_CHARS_PER_TOKEN = 4.2;

// Default ratio (blend)
let calibratedRatio = 3.9;

/**
 * Initialize the tokenizer (no-op now, kept for API compatibility)
 */
export async function initializeTokenizer(_model?: string): Promise<void> {
  console.log(`[Tokenizer] Using lightweight char-based estimation (${calibratedRatio.toFixed(1)} chars/token)`);
}

/**
 * Count tokens in text (async for API compatibility)
 */
export async function countTokens(text: string): Promise<number> {
  return countTokensSync(text);
}

/**
 * Count tokens synchronously using character estimation
 */
export function countTokensSync(text: string): number {
  if (!text) return 0;
  
  // Detect if mostly code or prose
  const codeIndicators = (text.match(/[{}()\[\];=><]/g) || []).length;
  const ratio = codeIndicators > text.length * 0.02 ? CODE_CHARS_PER_TOKEN : PROSE_CHARS_PER_TOKEN;
  
  return Math.ceil(text.length / ratio);
}

/**
 * Get estimated tokens using calibrated ratio (fast)
 */
export function estimateTokensFast(text: string): number {
  return Math.ceil(text.length / calibratedRatio);
}

/**
 * Truncate text to fit within token limit
 */
export async function truncateToTokenLimit(text: string, maxTokens: number): Promise<string> {
  const estimatedChars = Math.floor(maxTokens * calibratedRatio);
  
  if (text.length <= estimatedChars) {
    return text;
  }
  
  // Try to break at a sensible boundary (newline, space)
  let cutoff = estimatedChars;
  const lastNewline = text.lastIndexOf('\n', cutoff);
  const lastSpace = text.lastIndexOf(' ', cutoff);
  
  if (lastNewline > cutoff * 0.8) {
    cutoff = lastNewline;
  } else if (lastSpace > cutoff * 0.9) {
    cutoff = lastSpace;
  }
  
  return text.slice(0, cutoff);
}

/**
 * Check if tokenizer is ready (always true now)
 */
export function isTokenizerReady(): boolean {
  return true;
}

/**
 * Get the loaded tokenizer instance (null - no longer used)
 */
export function getTokenizer(): null {
  return null;
}

/**
 * Get the current calibrated ratio
 */
export function getCalibratedRatio(): number {
  return calibratedRatio;
}

