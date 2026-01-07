/**
 * Message Analyzer - Smart LLM-Powered Message Importance Scoring
 *
 * Analyzes conversation messages to determine importance using LLM reasoning.
 * Supports both LMStudio (local, free) and Claude API (smarter, paid).
 *
 * Part of Smart Context Compression System
 */

import axios from 'axios';
import type { Turn } from './index.js';

// ============================================================
// TYPES
// ============================================================

export type MessageType =
  | 'task_definition'
  | 'code_implementation'
  | 'tool_execution'
  | 'decision_point'
  | 'clarification'
  | 'acknowledgment'
  | 'error_handling'
  | 'context_building';

export interface MessageScore {
  messageId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  score: number;  // 0-10 importance scale
  type: MessageType;
  reason: string;
  dependencies: number[];  // Message IDs this depends on
  tokenEstimate: number;
}

export interface AnalysisConfig {
  provider: 'lmstudio' | 'claude';
  lmstudioUrl?: string;
  claudeApiKey?: string;
  model?: string;  // Model to use for analysis
  temperature?: number;
  timeout?: number;
  batchSize?: number;  // Number of messages to analyze per batch
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export interface BatchAnalysisResult {
  scores: MessageScore[];
  totalMessagesAnalyzed: number;
  successCount: number;
  failureCount: number;
  averageScore: number;
  duration: number;  // milliseconds
}

// ============================================================
// ANALYSIS PROMPTS
// ============================================================

const ANALYSIS_PROMPT = `You are an expert at analyzing conversation importance for context compression.
Your task is to score each message on a 0-10 scale based on its importance to understanding the conversation.

SCORING CRITERIA:
- 9-10: CRITICAL - Task definition, architectural decisions, key requirements
- 7-8: IMPORTANT - Implementation details, bug fixes, significant code changes
- 4-6: USEFUL - Clarifications, minor changes, helpful context
- 1-3: LOW-VALUE - Simple acknowledgments, confirmations, routine responses
- 0: DROPPABLE - Pure "OK", "Done", "Thanks" without substance

MESSAGE TYPES:
- task_definition: Initial task or feature request
- code_implementation: Writing or modifying code
- tool_execution: Running commands, executing tools
- decision_point: Important choices or alternatives
- clarification: Questions or explanations
- acknowledgment: Simple confirmations
- error_handling: Debugging or fixing errors
- context_building: Adding background information

Return JSON array with format:
[{"id": 0, "score": 9, "type": "task_definition", "reason": "Defines core feature requirements", "dependencies": []}]

Keep reasons concise (10-15 words). Identify dependencies when a message refers to or builds on previous messages.`;

const BATCH_ANALYSIS_TEMPLATE = (messages: string) => `${ANALYSIS_PROMPT}

Analyze these messages:
${messages}

Return ONLY the JSON array, no additional text.`;

// ============================================================
// CACHE
// ============================================================

interface CacheEntry {
  score: MessageScore;
  timestamp: number;
}

const analysisCache = new Map<string, CacheEntry>();

// ============================================================
// MESSAGE ANALYZER CLASS
// ============================================================

export class MessageAnalyzer {
  private config: Required<AnalysisConfig>;

  constructor(config: AnalysisConfig) {
    // Set defaults
    this.config = {
      provider: config.provider,
      lmstudioUrl: config.lmstudioUrl || 'http://localhost:1234',
      claudeApiKey: config.claudeApiKey || '',
      model: config.model || (config.provider === 'lmstudio' ? 'qwen2.5-coder-0.5b-instruct' : 'claude-3-haiku-20240307'),
      temperature: config.temperature ?? 0.1,
      timeout: config.timeout || 20000,  // 20s max per batch
      batchSize: config.batchSize || 20,  // Analyze 20 messages at a time
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTTL: config.cacheTTL || 3600000  // 1 hour
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AnalysisConfig>): void {
    this.config = { ...this.config, ...config } as Required<AnalysisConfig>;
  }

  /**
   * Analyze entire conversation and score each message
   */
  async analyzeConversation(
    messages: Turn[]
  ): Promise<MessageScore[]> {
    const startTime = Date.now();
    const scores: MessageScore[] = [];

    try {
      // Analyze in batches for better performance
      const batches = this.createBatches(messages, this.config.batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchScores = await this.analyzeBatch(batch, batchIndex * this.config.batchSize);
        scores.push(...batchScores);
      }

      console.log(`[MessageAnalyzer] Analyzed ${messages.length} messages in ${Date.now() - startTime}ms`);
      return scores;
    } catch (error) {
      console.error('[MessageAnalyzer] Analysis failed:', error);
      // Return default scores on failure (all messages score 5 - neutral)
      return messages.map((msg, index) => this.createDefaultScore(msg, index));
    }
  }

  /**
   * Analyze a batch of messages
   */
  async analyzeBatch(
    messages: Turn[],
    startIndex: number
  ): Promise<MessageScore[]> {
    // Check cache first
    if (this.config.cacheEnabled) {
      const cachedScores = this.checkCache(messages, startIndex);
      if (cachedScores.length === messages.length) {
        console.log(`[MessageAnalyzer] Cache hit for batch starting at ${startIndex}`);
        return cachedScores;
      }
    }

    // Format messages for analysis
    const formattedMessages = messages.map((msg, idx) => {
      const globalIdx = startIndex + idx;
      return `[${globalIdx}] ${msg.role}: ${this.truncateContent(msg.content, 500)}`;
    }).join('\n\n');

    const prompt = BATCH_ANALYSIS_TEMPLATE(formattedMessages);

    try {
      // Call LLM based on provider
      const response = this.config.provider === 'lmstudio'
        ? await this.callLMStudio(prompt)
        : await this.callClaude(prompt);

      // Parse response
      const analysisResults = this.parseAnalysisResponse(response);

      // Convert to MessageScore objects
      const scores = messages.map((msg, idx) => {
        const globalIdx = startIndex + idx;
        const analysis = analysisResults.find(a => a.id === globalIdx);

        if (analysis) {
          const score: MessageScore = {
            messageId: globalIdx,
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
            score: analysis.score,
            type: analysis.type,
            reason: analysis.reason,
            dependencies: analysis.dependencies || [],
            tokenEstimate: this.estimateTokens(msg.content)
          };

          // Cache the score
          if (this.config.cacheEnabled) {
            this.cacheScore(msg, globalIdx, score);
          }

          return score;
        } else {
          // Fallback to default if not found in analysis
          return this.createDefaultScore(msg, globalIdx);
        }
      });

      return scores;
    } catch (error) {
      console.error(`[MessageAnalyzer] Batch analysis failed for index ${startIndex}:`, error);
      // Return default scores on failure
      return messages.map((msg, idx) => this.createDefaultScore(msg, startIndex + idx));
    }
  }

  /**
   * Call LMStudio API for analysis
   */
  private async callLMStudio(prompt: string): Promise<string> {
    const url = `${this.config.lmstudioUrl}/v1/chat/completions`;

    const response = await axios.post(
      url,
      {
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature,
        max_tokens: 2000
      },
      {
        timeout: this.config.timeout,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Call Claude API for analysis
   */
  private async callClaude(prompt: string): Promise<string> {
    const url = 'https://api.anthropic.com/v1/messages';

    const response = await axios.post(
      url,
      {
        model: this.config.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature
      },
      {
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.claudeApiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data.content[0].text;
  }

  /**
   * Parse LLM response into structured analysis results
   */
  private parseAnalysisResponse(response: string): Array<{
    id: number;
    score: number;
    type: MessageType;
    reason: string;
    dependencies?: number[];
  }> {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('[MessageAnalyzer] No JSON array found in response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize
      return parsed.map((item: any) => ({
        id: item.id ?? 0,
        score: Math.min(10, Math.max(0, item.score ?? 5)),
        type: this.normalizeMessageType(item.type),
        reason: item.reason || 'No reason provided',
        dependencies: Array.isArray(item.dependencies) ? item.dependencies : []
      }));
    } catch (error) {
      console.error('[MessageAnalyzer] Failed to parse analysis response:', error);
      return [];
    }
  }

  /**
   * Normalize message type to ensure it matches expected types
   */
  private normalizeMessageType(type: string): MessageType {
    const validTypes: MessageType[] = [
      'task_definition',
      'code_implementation',
      'tool_execution',
      'decision_point',
      'clarification',
      'acknowledgment',
      'error_handling',
      'context_building'
    ];

    const normalized = type?.toLowerCase().replace(/[^a-z_]/g, '_') as MessageType;
    return validTypes.includes(normalized) ? normalized : 'context_building';
  }

  /**
   * Create default score for a message (fallback)
   */
  private createDefaultScore(message: Turn, index: number): MessageScore {
    // Simple heuristic scoring when LLM analysis fails
    let score = 5;  // Neutral default
    let type: MessageType = 'context_building';

    const content = message.content.toLowerCase();

    // Boost score for certain patterns
    if (content.includes('implement') || content.includes('create') || content.includes('add')) {
      score = 7;
      type = 'task_definition';
    } else if (content.includes('error') || content.includes('fix') || content.includes('bug')) {
      score = 7;
      type = 'error_handling';
    } else if (content.includes('```') || content.includes('function') || content.includes('class')) {
      score = 6;
      type = 'code_implementation';
    } else if (content.match(/^(ok|done|thanks|yes|no|sure|great)$/i)) {
      score = 1;
      type = 'acknowledgment';
    }

    return {
      messageId: index,
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      score,
      type,
      reason: 'Default heuristic scoring (LLM analysis unavailable)',
      dependencies: [],
      tokenEstimate: this.estimateTokens(message.content)
    };
  }

  /**
   * Create batches of messages for analysis
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Check cache for existing scores
   */
  private checkCache(messages: Turn[], startIndex: number): MessageScore[] {
    const scores: MessageScore[] = [];
    const now = Date.now();

    for (let i = 0; i < messages.length; i++) {
      const cacheKey = this.getCacheKey(messages[i], startIndex + i);
      const cached = analysisCache.get(cacheKey);

      if (cached && now - cached.timestamp < this.config.cacheTTL) {
        scores.push(cached.score);
      } else {
        break;  // Cache miss, need to analyze
      }
    }

    return scores;
  }

  /**
   * Cache a message score
   */
  private cacheScore(message: Turn, index: number, score: MessageScore): void {
    const cacheKey = this.getCacheKey(message, index);
    analysisCache.set(cacheKey, {
      score,
      timestamp: Date.now()
    });
  }

  /**
   * Generate cache key for a message
   */
  private getCacheKey(message: Turn, index: number): string {
    // Use hash of content + index for cache key
    const contentHash = this.simpleHash(message.content);
    return `${index}-${contentHash}`;
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Truncate content for analysis (avoid token limits)
   */
  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    return content.substring(0, maxChars) + '...';
  }

  /**
   * Estimate tokens in content (rough approximation)
   */
  private estimateTokens(content: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    analysisCache.clear();
    console.log('[MessageAnalyzer] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    let totalSize = 0;
    analysisCache.forEach((entry) => {
      totalSize += entry.score.content.length;
    });
    return {
      size: totalSize,
      entries: analysisCache.size
    };
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let defaultAnalyzer: MessageAnalyzer | null = null;

export function getMessageAnalyzer(config?: AnalysisConfig): MessageAnalyzer {
  if (!defaultAnalyzer && config) {
    defaultAnalyzer = new MessageAnalyzer(config);
  } else if (defaultAnalyzer && config) {
    defaultAnalyzer.updateConfig(config);
  }

  if (!defaultAnalyzer) {
    // Create with default LMStudio config
    defaultAnalyzer = new MessageAnalyzer({
      provider: 'lmstudio',
      lmstudioUrl: 'http://localhost:1234'
    });
  }

  return defaultAnalyzer;
}

export { analysisCache };
