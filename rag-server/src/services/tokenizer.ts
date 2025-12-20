/**
 * Tokenizer Service using @xenova/transformers
 * 
 * Provides accurate token counting for embedding models.
 * Loads the actual tokenizer used by the embedding model.
 */

import { AutoTokenizer, PreTrainedTokenizer } from '@xenova/transformers';

// Singleton tokenizer instance
let tokenizer: PreTrainedTokenizer | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;

// Calibrated ratio from actual tokenization (updated during runtime)
let calibratedRatio = 2.0; // Conservative default: ~2 chars per token for code

// Default model for tokenizer (Nomic uses BERT-style tokenizer)
const DEFAULT_TOKENIZER_MODEL = 'nomic-ai/nomic-embed-text-v1.5';

/**
 * Initialize the tokenizer
 */
export async function initializeTokenizer(model?: string): Promise<void> {
  if (tokenizer) return;
  
  if (isLoading && loadPromise) {
    await loadPromise;
    return;
  }
  
  isLoading = true;
  const modelName = model || DEFAULT_TOKENIZER_MODEL;
  
  console.log(`[Tokenizer] Loading tokenizer for ${modelName}...`);
  
  loadPromise = (async () => {
    try {
      tokenizer = await AutoTokenizer.from_pretrained(modelName, {
        // Use local cache
        cache_dir: './data/tokenizer-cache'
      });
      console.log(`[Tokenizer] Loaded successfully`);
      
      // Calibrate ratio with a sample
      await calibrateRatio();
    } catch (error) {
      console.warn(`[Tokenizer] Failed to load ${modelName}, falling back to bert-base-uncased:`, error);
      try {
        // Fallback to a common BERT tokenizer
        tokenizer = await AutoTokenizer.from_pretrained('bert-base-uncased', {
          cache_dir: './data/tokenizer-cache'
        });
        console.log(`[Tokenizer] Loaded fallback tokenizer`);
        await calibrateRatio();
      } catch (fallbackError) {
        console.error(`[Tokenizer] Failed to load fallback tokenizer:`, fallbackError);
        // Keep using conservative estimate
      }
    }
  })();
  
  await loadPromise;
  isLoading = false;
}

/**
 * Calibrate the character-to-token ratio using sample code
 */
async function calibrateRatio(): Promise<void> {
  if (!tokenizer) return;
  
  // Sample code snippet for calibration
  const sample = `
export async function processData(input: string[], options: ProcessOptions = {}): Promise<Result[]> {
  const results: Result[] = [];
  for (const item of input) {
    if (options.validate && !isValid(item)) {
      console.warn(\`Invalid item: \${item}\`);
      continue;
    }
    const processed = await transform(item, options);
    results.push({ data: processed, timestamp: Date.now() });
  }
  return results;
}
`;
  
  try {
    const encoded = tokenizer(sample, {
      return_tensors: false,
      padding: false,
      truncation: false
    });
    
    const tokens = encoded.input_ids?.length || encoded.length;
    if (tokens > 0) {
      calibratedRatio = sample.length / tokens;
      console.log(`[Tokenizer] Calibrated ratio: ${calibratedRatio.toFixed(2)} chars/token`);
    }
  } catch (error) {
    console.warn('[Tokenizer] Calibration failed, using default ratio');
  }
}

/**
 * Count tokens in text accurately (async)
 */
export async function countTokens(text: string): Promise<number> {
  if (!tokenizer) {
    await initializeTokenizer();
  }
  
  if (!tokenizer) {
    // Ultimate fallback: use calibrated ratio
    return Math.ceil(text.length / calibratedRatio);
  }
  
  try {
    const encoded = tokenizer(text, {
      return_tensors: false,
      padding: false,
      truncation: false
    });
    
    return encoded.input_ids?.length || encoded.length || Math.ceil(text.length / calibratedRatio);
  } catch (error) {
    console.error('[Tokenizer] Error counting tokens:', error);
    return Math.ceil(text.length / calibratedRatio);
  }
}

/**
 * Count tokens synchronously (uses cached tokenizer or calibrated estimate)
 */
export function countTokensSync(text: string): number {
  if (!tokenizer) {
    // Use calibrated ratio estimate
    return Math.ceil(text.length / calibratedRatio);
  }
  
  try {
    // @xenova/transformers tokenizer call is sync after loading
    const encoded = tokenizer(text, {
      return_tensors: false,
      padding: false,
      truncation: false
    });
    
    return encoded.input_ids?.length || encoded.length || Math.ceil(text.length / calibratedRatio);
  } catch {
    return Math.ceil(text.length / calibratedRatio);
  }
}

/**
 * Get estimated tokens using calibrated ratio (fast, no tokenizer needed)
 */
export function estimateTokensFast(text: string): number {
  return Math.ceil(text.length / calibratedRatio);
}

/**
 * Truncate text to fit within token limit
 */
export async function truncateToTokenLimit(text: string, maxTokens: number): Promise<string> {
  if (!tokenizer) {
    await initializeTokenizer();
  }
  
  if (!tokenizer) {
    // Rough truncation using calibrated ratio
    const estimatedChars = Math.floor(maxTokens * calibratedRatio);
    return text.slice(0, estimatedChars);
  }
  
  try {
    const encoded = tokenizer(text, {
      return_tensors: false,
      padding: false,
      truncation: true,
      max_length: maxTokens
    });
    
    // Decode back to text
    return tokenizer.decode(encoded.input_ids, { skip_special_tokens: true });
  } catch (error) {
    console.error('[Tokenizer] Error truncating:', error);
    const estimatedChars = Math.floor(maxTokens * calibratedRatio);
    return text.slice(0, estimatedChars);
  }
}

/**
 * Check if tokenizer is ready
 */
export function isTokenizerReady(): boolean {
  return tokenizer !== null;
}

/**
 * Get the loaded tokenizer instance
 */
export function getTokenizer(): PreTrainedTokenizer | null {
  return tokenizer;
}

/**
 * Get the current calibrated ratio
 */
export function getCalibratedRatio(): number {
  return calibratedRatio;
}

