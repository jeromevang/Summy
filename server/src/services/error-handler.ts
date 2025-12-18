/**
 * Error Handler Service
 * Provides retry logic, IDE-friendly error messages, and detailed logging
 */

import { db } from './database.js';

// ============================================================
// TYPES
// ============================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;      // ms
  maxDelay: number;       // ms
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface ErrorContext {
  operation: string;
  model?: string;
  tool?: string;
  sessionId?: string;
  metadata?: any;
}

export type ErrorType = 
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMIT'
  | 'LLM_UNAVAILABLE'
  | 'MCP_DISCONNECTED'
  | 'MCP_TIMEOUT'
  | 'TOOL_FAILED'
  | 'TOOL_TIMEOUT'
  | 'COMPRESSION_FAILED'
  | 'MODEL_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

// ============================================================
// DEFAULT CONFIG
// ============================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate_limit',
    '429',
    '503',
    '504'
  ]
};

// ============================================================
// IDE-FRIENDLY ERROR MESSAGES
// ============================================================

export const IDE_ERROR_MESSAGES: Record<ErrorType, string> = {
  LLM_TIMEOUT: '⏳ The AI is taking longer than expected. Retrying...',
  LLM_RATE_LIMIT: '⏸️ Rate limit reached. Waiting before retry...',
  LLM_UNAVAILABLE: '🔌 AI service is temporarily unavailable. Retrying...',
  MCP_DISCONNECTED: '🔧 Tool server disconnected. Reconnecting...',
  MCP_TIMEOUT: '⏳ Tool server is slow to respond. Retrying...',
  TOOL_FAILED: '❌ Tool execution failed. Trying alternative approach...',
  TOOL_TIMEOUT: '⏳ Tool is taking too long. Retrying...',
  COMPRESSION_FAILED: '📦 Context compression failed. Using original context.',
  MODEL_UNAVAILABLE: '🤖 Selected model is unavailable. Please check settings.',
  NETWORK_ERROR: '🌐 Network error. Checking connection...',
  INVALID_RESPONSE: '⚠️ Received invalid response. Retrying...',
  UNKNOWN: '❓ An unexpected error occurred.'
};

// ============================================================
// ERROR CLASSIFICATION
// ============================================================

export function classifyError(error: any): ErrorType {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code?.toLowerCase() || '';
  const status = error?.response?.status;

  // Rate limiting
  if (status === 429 || message.includes('rate_limit') || message.includes('rate limit')) {
    return 'LLM_RATE_LIMIT';
  }

  // Timeout errors
  if (code === 'etimedout' || message.includes('timeout')) {
    if (message.includes('mcp') || message.includes('tool')) {
      return 'MCP_TIMEOUT';
    }
    return 'LLM_TIMEOUT';
  }

  // Connection errors
  if (code === 'econnrefused' || code === 'econnreset' || code === 'enotfound') {
    if (message.includes('mcp') || message.includes('tool') || message.includes('localhost:3002')) {
      return 'MCP_DISCONNECTED';
    }
    return 'LLM_UNAVAILABLE';
  }

  // Service unavailable
  if (status === 503 || status === 504) {
    return 'LLM_UNAVAILABLE';
  }

  // Tool failures
  if (message.includes('tool') && (message.includes('fail') || message.includes('error'))) {
    return 'TOOL_FAILED';
  }

  // Model issues
  if (message.includes('model') && (message.includes('not found') || message.includes('unavailable'))) {
    return 'MODEL_UNAVAILABLE';
  }

  // Compression
  if (message.includes('compress') || message.includes('summariz')) {
    return 'COMPRESSION_FAILED';
  }

  // Invalid response
  if (message.includes('invalid') || message.includes('malformed') || message.includes('parse')) {
    return 'INVALID_RESPONSE';
  }

  // Network
  if (message.includes('network') || code.startsWith('e')) {
    return 'NETWORK_ERROR';
  }

  return 'UNKNOWN';
}

// ============================================================
// RETRY LOGIC
// ============================================================

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: ErrorContext = { operation: 'unknown' },
  onRetry?: (attempt: number, error: Error, delay: number) => void
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = cfg.baseDelay;

  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Log the error
      logError(error, context, attempt);

      // Check if we should retry
      const isRetryable = isRetryableError(error, cfg.retryableErrors);
      const hasRetriesLeft = attempt <= cfg.maxRetries;

      if (!isRetryable || !hasRetriesLeft) {
        throw error;
      }

      // Calculate delay with exponential backoff
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelay);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, error, delay);
      }

      console.log(`[RETRY] Attempt ${attempt}/${cfg.maxRetries} failed, retrying in ${delay}ms...`);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryableError(error: any, retryablePatterns: string[]): boolean {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code?.toLowerCase() || '';
  const status = String(error?.response?.status || '');

  return retryablePatterns.some(pattern => 
    message.includes(pattern.toLowerCase()) ||
    code.includes(pattern.toLowerCase()) ||
    status === pattern
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// ERROR FORMATTING
// ============================================================

export function formatErrorForIDE(error: any): string {
  const errorType = classifyError(error);
  return IDE_ERROR_MESSAGES[errorType];
}

export function formatDetailedError(error: any, context: ErrorContext): string {
  const errorType = classifyError(error);
  const timestamp = new Date().toISOString();
  
  let details = `[${timestamp}] [${errorType}] ${context.operation}`;
  
  if (context.model) details += ` | Model: ${context.model}`;
  if (context.tool) details += ` | Tool: ${context.tool}`;
  if (context.sessionId) details += ` | Session: ${context.sessionId}`;
  
  details += `\n  Error: ${error?.message || 'Unknown error'}`;
  
  if (error?.code) details += `\n  Code: ${error.code}`;
  if (error?.response?.status) details += `\n  Status: ${error.response.status}`;
  if (error?.response?.data) {
    details += `\n  Response: ${JSON.stringify(error.response.data).slice(0, 200)}`;
  }

  return details;
}

// ============================================================
// LOGGING
// ============================================================

export function logError(error: any, context: ErrorContext, attempt?: number): void {
  const errorType = classifyError(error);
  const detailed = formatDetailedError(error, context);
  
  // Console logging
  console.error(`\n❌ ERROR [${errorType}]${attempt ? ` (Attempt ${attempt})` : ''}`);
  console.error(detailed);
  
  // Add notification for user
  try {
    db.addNotification({
      type: 'error',
      title: IDE_ERROR_MESSAGES[errorType],
      message: `${context.operation}: ${error?.message?.slice(0, 100) || 'Unknown error'}`
    });
  } catch (e) {
    // Don't throw if notification fails
    console.error('Failed to add error notification:', e);
  }
}

export function logWarning(message: string, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] ⚠️ WARNING: ${message}`);
  
  if (context) {
    console.warn(`  Operation: ${context.operation}`);
    if (context.model) console.warn(`  Model: ${context.model}`);
    if (context.tool) console.warn(`  Tool: ${context.tool}`);
  }
}

export function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ℹ️ ${message}`);
}

// ============================================================
// ERROR WRAPPER FOR STREAMS
// ============================================================

export class StreamErrorHandler {
  private res: any;
  private context: ErrorContext;

  constructor(res: any, context: ErrorContext) {
    this.res = res;
    this.context = context;
  }

  sendError(error: any): void {
    const ideMessage = formatErrorForIDE(error);
    logError(error, this.context);

    // Send error as SSE chunk
    const chunk = {
      id: `error-${Date.now()}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: { content: `\n\n${ideMessage}\n\n` },
        finish_reason: 'error'
      }]
    };

    try {
      this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      this.res.write('data: [DONE]\n\n');
      this.res.end();
    } catch (e) {
      // Response might already be closed
      console.error('Failed to send error to stream:', e);
    }
  }

  sendRetryNotice(attempt: number, delay: number): void {
    const message = `⏳ Retrying... (attempt ${attempt}, waiting ${Math.round(delay/1000)}s)`;
    
    const chunk = {
      id: `retry-${Date.now()}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: { content: `\n${message}\n` },
        finish_reason: null
      }]
    };

    try {
      this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    } catch (e) {
      // Response might already be closed
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================

export const errorHandler = {
  withRetry,
  classifyError,
  formatErrorForIDE,
  formatDetailedError,
  logError,
  logWarning,
  logInfo,
  StreamErrorHandler,
  DEFAULT_RETRY_CONFIG,
  IDE_ERROR_MESSAGES
};

