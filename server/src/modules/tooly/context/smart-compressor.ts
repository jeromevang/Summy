/**
 * Smart Compressor - Intelligent Context Compression
 *
 * Uses message importance scores to make smart compression decisions:
 * - Preserve high-importance messages
 * - Compress medium-importance messages into summaries
 * - Drop low-importance messages
 *
 * Part of Smart Context Compression System
 */

import type { Turn } from './index.js';
import type { MessageScore, MessageType } from './message-analyzer.js';

// ============================================================
// TYPES
// ============================================================

export type CompressionAction = 'preserve' | 'compress' | 'drop';
export type CompressionMode = 'conservative' | 'aggressive' | 'context-aware';

export interface CompressionDecision {
  action: CompressionAction;
  messageId: number;
  score: number;
  reason: string;
  originalTokens: number;
  compressedTokens?: number;  // Only for 'compress' action
}

export interface CompressionStats {
  totalMessages: number;
  preservedCount: number;
  compressedCount: number;
  droppedCount: number;
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
  compressionRatio: number;  // 0.0-1.0 (0 = 100% reduction, 1 = no reduction)
  duration: number;  // milliseconds
}

export interface CompressedMessage extends Turn {
  originalMessageIds: number[];  // IDs of messages this represents
  compressionType: 'original' | 'summary';
}

export interface CompressionResult {
  uncompressedTranscript: Turn[];
  compressedTranscript: CompressedMessage[];
  decisions: CompressionDecision[];
  stats: CompressionStats;
}

export interface CompressionConfig {
  mode: CompressionMode;
  skipLast: number;  // Always preserve last N messages
  preserveToolCalls: boolean;  // Always preserve messages with tool calls
  maxSummaryLength: number;  // Max characters for compressed summaries
  targetCompressionRatio?: number;  // Optional target ratio (0.3 = 70% reduction)
}

// ============================================================
// COMPRESSION THRESHOLDS
// ============================================================

interface ModeThresholds {
  preserveThreshold: number;  // Score >= this → preserve
  dropThreshold: number;      // Score <= this → drop
  summaryGroupSize: number;   // Max messages to combine in one summary
}

const THRESHOLDS: Record<CompressionMode, ModeThresholds> = {
  conservative: {
    preserveThreshold: 7,
    dropThreshold: 3,
    summaryGroupSize: 3
  },
  aggressive: {
    preserveThreshold: 8,
    dropThreshold: 4,
    summaryGroupSize: 5
  },
  'context-aware': {
    preserveThreshold: 7.5,
    dropThreshold: 3.5,
    summaryGroupSize: 4
  }
};

// ============================================================
// SMART COMPRESSOR CLASS
// ============================================================

export class SmartCompressor {
  private config: CompressionConfig;

  constructor(config?: Partial<CompressionConfig>) {
    this.config = {
      mode: config?.mode || 'conservative',
      skipLast: config?.skipLast ?? 5,
      preserveToolCalls: config?.preserveToolCalls ?? true,
      maxSummaryLength: config?.maxSummaryLength || 300,
      targetCompressionRatio: config?.targetCompressionRatio
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Main compression logic
   */
  async compress(
    messages: Turn[],
    scores: MessageScore[]
  ): Promise<CompressionResult> {
    const startTime = Date.now();

    // Ensure messages and scores match
    if (messages.length !== scores.length) {
      throw new Error(`Message count (${messages.length}) doesn't match scores count (${scores.length})`);
    }

    // Choose compression strategy based on mode
    const result = await this.compressWithMode(messages, scores);

    // Calculate final stats
    result.stats.duration = Date.now() - startTime;

    console.log(
      `[SmartCompressor] Compressed ${messages.length} → ${result.compressedTranscript.length} messages ` +
      `(${Math.round(result.stats.compressionRatio * 100)}% reduction) in ${result.stats.duration}ms`
    );

    return result;
  }

  /**
   * Compress using the configured mode
   */
  private async compressWithMode(
    messages: Turn[],
    scores: MessageScore[]
  ): Promise<CompressionResult> {
    switch (this.config.mode) {
      case 'conservative':
        return this.conservativeCompress(messages, scores);
      case 'aggressive':
        return this.aggressiveCompress(messages, scores);
      case 'context-aware':
        return this.contextAwareCompress(messages, scores);
      default:
        return this.conservativeCompress(messages, scores);
    }
  }

  /**
   * Conservative compression: preserve more, compress less
   */
  private async conservativeCompress(
    messages: Turn[],
    scores: MessageScore[]
  ): Promise<CompressionResult> {
    const thresholds = THRESHOLDS.conservative;
    return this.applyThresholdCompression(messages, scores, thresholds);
  }

  /**
   * Aggressive compression: drop more, compress more
   */
  private async aggressiveCompress(
    messages: Turn[],
    scores: MessageScore[]
  ): Promise<CompressionResult> {
    const thresholds = THRESHOLDS.aggressive;
    return this.applyThresholdCompression(messages, scores, thresholds);
  }

  /**
   * Context-aware compression: dynamic thresholds based on conversation
   */
  private async contextAwareCompress(
    messages: Turn[],
    scores: MessageScore[]
  ): Promise<CompressionResult> {
    // Calculate dynamic thresholds based on score distribution
    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    const medianScore = sortedScores[Math.floor(sortedScores.length / 2)].score;
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

    // Adjust thresholds based on conversation characteristics
    const thresholds: ModeThresholds = {
      preserveThreshold: Math.max(7, avgScore + 2),
      dropThreshold: Math.max(2, medianScore - 3),
      summaryGroupSize: 4
    };

    console.log(
      `[SmartCompressor] Context-aware thresholds: preserve >= ${thresholds.preserveThreshold}, ` +
      `drop <= ${thresholds.dropThreshold} (avg: ${avgScore.toFixed(1)}, median: ${medianScore})`
    );

    return this.applyThresholdCompression(messages, scores, thresholds);
  }

  /**
   * Apply threshold-based compression logic
   */
  private async applyThresholdCompression(
    messages: Turn[],
    scores: MessageScore[],
    thresholds: ModeThresholds
  ): Promise<CompressionResult> {
    const decisions: CompressionDecision[] = [];
    const compressedMessages: CompressedMessage[] = [];
    let originalTokens = 0;
    let compressedTokens = 0;

    // Identify which messages to preserve, compress, or drop
    const actions = this.determineActions(messages, scores, thresholds);

    // Group consecutive "compress" messages together
    const groups = this.groupCompressibleMessages(actions);

    for (const group of groups) {
      if (group.action === 'preserve') {
        // Add preserved messages as-is
        for (const idx of group.indices) {
          const message = messages[idx];
          const score = scores[idx];

          compressedMessages.push({
            ...message,
            originalMessageIds: [idx],
            compressionType: 'original'
          });

          const tokens = this.estimateTokens(message.content);
          originalTokens += tokens;
          compressedTokens += tokens;

          decisions.push({
            action: 'preserve',
            messageId: idx,
            score: score.score,
            reason: score.reason,
            originalTokens: tokens
          });
        }
      } else if (group.action === 'compress') {
        // Compress group into summary
        const groupMessages = group.indices.map(idx => messages[idx]);
        const groupScores = group.indices.map(idx => scores[idx]);
        const summary = this.createSummary(groupMessages, groupScores);

        const groupOriginalTokens = groupMessages.reduce(
          (sum, msg) => sum + this.estimateTokens(msg.content),
          0
        );
        const summaryTokens = this.estimateTokens(summary);

        compressedMessages.push({
          role: 'system',
          content: summary,
          originalMessageIds: group.indices,
          compressionType: 'summary'
        });

        originalTokens += groupOriginalTokens;
        compressedTokens += summaryTokens;

        // Add decisions for each compressed message
        for (let i = 0; i < group.indices.length; i++) {
          const idx = group.indices[i];
          const score = groupScores[i];
          const msgTokens = this.estimateTokens(groupMessages[i].content);

          decisions.push({
            action: 'compress',
            messageId: idx,
            score: score.score,
            reason: `Summarized with ${group.indices.length} other messages`,
            originalTokens: msgTokens,
            compressedTokens: Math.round(summaryTokens / group.indices.length)
          });
        }
      } else if (group.action === 'drop') {
        // Drop messages (don't add to compressed transcript)
        for (const idx of group.indices) {
          const message = messages[idx];
          const score = scores[idx];
          const tokens = this.estimateTokens(message.content);

          originalTokens += tokens;

          decisions.push({
            action: 'drop',
            messageId: idx,
            score: score.score,
            reason: score.reason,
            originalTokens: tokens
          });
        }
      }
    }

    // Calculate stats
    const stats: CompressionStats = {
      totalMessages: messages.length,
      preservedCount: decisions.filter(d => d.action === 'preserve').length,
      compressedCount: decisions.filter(d => d.action === 'compress').length,
      droppedCount: decisions.filter(d => d.action === 'drop').length,
      originalTokens,
      compressedTokens,
      tokensSaved: originalTokens - compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      duration: 0  // Will be set by caller
    };

    return {
      uncompressedTranscript: messages,
      compressedTranscript: compressedMessages,
      decisions,
      stats
    };
  }

  /**
   * Determine action for each message
   */
  private determineActions(
    messages: Turn[],
    scores: MessageScore[],
    thresholds: ModeThresholds
  ): Array<{ index: number; action: CompressionAction; score: number }> {
    const actions: Array<{ index: number; action: CompressionAction; score: number }> = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const score = scores[i];

      // Always preserve last N messages
      if (i >= messages.length - this.config.skipLast) {
        actions.push({ index: i, action: 'preserve', score: score.score });
        continue;
      }

      // Always preserve messages with tool calls
      if (this.config.preserveToolCalls && message.toolCalls && message.toolCalls.length > 0) {
        actions.push({ index: i, action: 'preserve', score: score.score });
        continue;
      }

      // Determine action based on score
      if (score.score >= thresholds.preserveThreshold) {
        actions.push({ index: i, action: 'preserve', score: score.score });
      } else if (score.score <= thresholds.dropThreshold) {
        actions.push({ index: i, action: 'drop', score: score.score });
      } else {
        actions.push({ index: i, action: 'compress', score: score.score });
      }
    }

    return actions;
  }

  /**
   * Group consecutive messages with the same action
   */
  private groupCompressibleMessages(
    actions: Array<{ index: number; action: CompressionAction; score: number }>
  ): Array<{ action: CompressionAction; indices: number[] }> {
    const groups: Array<{ action: CompressionAction; indices: number[] }> = [];
    let currentGroup: { action: CompressionAction; indices: number[] } | null = null;

    for (const item of actions) {
      if (!currentGroup || currentGroup.action !== item.action) {
        // Start new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = { action: item.action, indices: [item.index] };
      } else if (item.action === 'compress' && currentGroup.indices.length >= THRESHOLDS[this.config.mode].summaryGroupSize) {
        // Max group size reached for compression, start new group
        groups.push(currentGroup);
        currentGroup = { action: item.action, indices: [item.index] };
      } else {
        // Add to current group
        currentGroup.indices.push(item.index);
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Create summary for a group of messages
   */
  private createSummary(messages: Turn[], scores: MessageScore[]): string {
    // Extract key information from messages
    const roles = messages.map(m => m.role);
    const types = scores.map(s => s.type);
    const uniqueTypes = [...new Set(types)];

    // Build summary
    let summary = `[Summarized ${messages.length} messages: `;

    // Add role distribution
    const userCount = roles.filter(r => r === 'user').length;
    const assistantCount = roles.filter(r => r === 'assistant').length;
    if (userCount > 0) summary += `${userCount} user, `;
    if (assistantCount > 0) summary += `${assistantCount} assistant, `;

    // Add types
    summary += `Types: ${uniqueTypes.join(', ')}]\n\n`;

    // Add key content snippets from highest-scoring messages
    const topMessages = messages
      .map((msg, idx) => ({ msg, score: scores[idx] }))
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 3);  // Top 3 messages

    for (const { msg, score } of topMessages) {
      const snippet = this.extractKeySnippet(msg.content, 100);
      summary += `• [${score.type}, score: ${score.score}] ${snippet}\n`;
    }

    // Truncate if too long
    if (summary.length > this.config.maxSummaryLength) {
      summary = summary.substring(0, this.config.maxSummaryLength - 3) + '...';
    }

    return summary;
  }

  /**
   * Extract key snippet from content
   */
  private extractKeySnippet(content: string, maxLength: number): string {
    // Remove excessive whitespace
    const cleaned = content.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Try to break at sentence boundary
    const truncated = cleaned.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');

    const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (breakPoint > maxLength * 0.5) {
      return truncated.substring(0, breakPoint + 1);
    }

    return truncated + '...';
  }

  /**
   * Estimate tokens in content
   */
  private estimateTokens(content: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  /**
   * Export compression result as JSONL
   */
  exportAsJSONL(result: CompressionResult, type: 'uncompressed' | 'compressed'): string {
    const messages = type === 'uncompressed'
      ? result.uncompressedTranscript
      : result.compressedTranscript;

    return messages.map(msg => JSON.stringify(msg)).join('\n');
  }

  /**
   * Get compression statistics summary
   */
  getStatsSummary(stats: CompressionStats): string {
    return `
Compression Statistics:
- Total messages: ${stats.totalMessages}
- Preserved: ${stats.preservedCount} (${Math.round(stats.preservedCount / stats.totalMessages * 100)}%)
- Compressed: ${stats.compressedCount} (${Math.round(stats.compressedCount / stats.totalMessages * 100)}%)
- Dropped: ${stats.droppedCount} (${Math.round(stats.droppedCount / stats.totalMessages * 100)}%)
- Original tokens: ${stats.originalTokens.toLocaleString()}
- Compressed tokens: ${stats.compressedTokens.toLocaleString()}
- Tokens saved: ${stats.tokensSaved.toLocaleString()}
- Compression ratio: ${Math.round((1 - stats.compressionRatio) * 100)}% reduction
- Duration: ${stats.duration}ms
    `.trim();
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Validate compression result
 */
export function validateCompressionResult(result: CompressionResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check if decisions match messages
  if (result.decisions.length !== result.uncompressedTranscript.length) {
    errors.push(`Decisions count (${result.decisions.length}) doesn't match messages count (${result.uncompressedTranscript.length})`);
  }

  // Check if compressed transcript has content
  if (result.compressedTranscript.length === 0) {
    errors.push('Compressed transcript is empty');
  }

  // Check if stats make sense
  if (result.stats.compressedTokens > result.stats.originalTokens) {
    errors.push('Compressed tokens cannot exceed original tokens');
  }

  if (result.stats.preservedCount + result.stats.compressedCount + result.stats.droppedCount !== result.stats.totalMessages) {
    errors.push('Action counts do not sum to total messages');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Compare two compression results
 */
export function compareCompressionResults(
  result1: CompressionResult,
  result2: CompressionResult
): {
  betterResult: CompressionResult;
  reason: string;
} {
  // Compare based on compression ratio and message preservation
  const score1 = result1.stats.compressionRatio + (result1.stats.preservedCount / result1.stats.totalMessages);
  const score2 = result2.stats.compressionRatio + (result2.stats.preservedCount / result2.stats.totalMessages);

  if (score1 < score2) {
    return {
      betterResult: result1,
      reason: `Better compression ratio (${Math.round((1 - result1.stats.compressionRatio) * 100)}% vs ${Math.round((1 - result2.stats.compressionRatio) * 100)}%)`
    };
  } else {
    return {
      betterResult: result2,
      reason: `Better balance of compression and preservation`
    };
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let defaultCompressor: SmartCompressor | null = null;

export function getSmartCompressor(config?: Partial<CompressionConfig>): SmartCompressor {
  if (!defaultCompressor) {
    defaultCompressor = new SmartCompressor(config);
  } else if (config) {
    defaultCompressor.updateConfig(config);
  }
  return defaultCompressor;
}
