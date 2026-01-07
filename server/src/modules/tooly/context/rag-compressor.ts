/**
 * RAG Compressor - Semantic Deduplication Enhancement
 *
 * Uses RAG (Retrieval-Augmented Generation) to detect semantically similar messages
 * across the conversation for better compression. Optional enhancement to SmartCompressor.
 *
 * Part of Smart Context Compression System
 */

import axios from 'axios';
import type { Turn } from './index.js';
import type { MessageScore } from './message-analyzer.js';
import type { CompressionDecision } from './smart-compressor.js';

// ============================================================
// TYPES
// ============================================================

export interface RAGConfig {
  enabled: boolean;
  ragServerUrl: string;
  similarityThreshold: number;  // 0.0-1.0, higher = more similar required
  timeout: number;
  maxCandidates: number;  // Max similar messages to check
}

export interface SimilarityMatch {
  messageId: number;
  similarity: number;
  content: string;
}

export interface RAGEnhancedScore extends MessageScore {
  similarMessages: SimilarityMatch[];
  deduplicationScore: number;  // Adjustment to original score based on redundancy
  finalScore: number;  // Original score + deduplication adjustment
}

export interface SemanticCluster {
  representativeMessageId: number;
  messageIds: number[];
  topic: string;
  averageScore: number;
}

// ============================================================
// RAG COMPRESSOR CLASS
// ============================================================

export class RAGCompressor {
  private config: RAGConfig;

  constructor(config?: Partial<RAGConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      ragServerUrl: config?.ragServerUrl || 'http://localhost:3002',
      similarityThreshold: config?.similarityThreshold ?? 0.75,
      timeout: config?.timeout || 5000,
      maxCandidates: config?.maxCandidates || 5
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enhance message scores with semantic similarity analysis
   */
  async enhanceScores(
    messages: Turn[],
    scores: MessageScore[]
  ): Promise<RAGEnhancedScore[]> {
    if (!this.config.enabled) {
      console.log('[RAGCompressor] RAG disabled, skipping semantic analysis');
      return scores.map(score => ({
        ...score,
        similarMessages: [],
        deduplicationScore: 0,
        finalScore: score.score
      }));
    }

    try {
      const enhancedScores: RAGEnhancedScore[] = [];

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const score = scores[i];

        // Find similar messages
        const similarMessages = await this.findSimilarMessages(
          message.content,
          messages.slice(0, i),  // Only search in previous messages
          i
        );

        // Calculate deduplication score adjustment
        const deduplicationScore = this.calculateDeduplicationScore(similarMessages);

        // Adjust final score (reduce score if message is redundant)
        const finalScore = Math.max(0, score.score + deduplicationScore);

        enhancedScores.push({
          ...score,
          similarMessages,
          deduplicationScore,
          finalScore
        });
      }

      console.log(
        `[RAGCompressor] Enhanced ${messages.length} scores with semantic analysis. ` +
        `Found ${enhancedScores.filter(s => s.similarMessages.length > 0).length} messages with similar content.`
      );

      return enhancedScores;
    } catch (error) {
      console.error('[RAGCompressor] Semantic analysis failed:', error);
      // Fallback to original scores
      return scores.map(score => ({
        ...score,
        similarMessages: [],
        deduplicationScore: 0,
        finalScore: score.score
      }));
    }
  }

  /**
   * Find similar messages using RAG semantic search
   */
  private async findSimilarMessages(
    content: string,
    previousMessages: Turn[],
    currentIndex: number
  ): Promise<SimilarityMatch[]> {
    if (previousMessages.length === 0) {
      return [];
    }

    try {
      // Query RAG server for similar content
      const response = await axios.post(
        `${this.config.ragServerUrl}/api/rag/query`,
        {
          query: content,
          maxResults: this.config.maxCandidates,
          threshold: this.config.similarityThreshold
        },
        {
          timeout: this.config.timeout,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Map RAG results to similarity matches
      const matches: SimilarityMatch[] = [];

      if (response.data && response.data.results) {
        for (const result of response.data.results) {
          // Find which message this result corresponds to
          const messageId = previousMessages.findIndex(
            msg => this.contentMatches(msg.content, result.content)
          );

          if (messageId !== -1 && result.similarity >= this.config.similarityThreshold) {
            matches.push({
              messageId,
              similarity: result.similarity,
              content: result.content.substring(0, 200)  // Truncate for display
            });
          }
        }
      }

      return matches;
    } catch (error) {
      // RAG server might be unavailable, fall back to simple text matching
      console.warn('[RAGCompressor] RAG query failed, using fallback matching:', error);
      return this.fallbackSimilaritySearch(content, previousMessages);
    }
  }

  /**
   * Fallback similarity search using simple text matching
   */
  private fallbackSimilaritySearch(
    content: string,
    previousMessages: Turn[]
  ): SimilarityMatch[] {
    const matches: SimilarityMatch[] = [];
    const normalizedContent = this.normalizeContent(content);

    for (let i = 0; i < previousMessages.length; i++) {
      const prevContent = this.normalizeContent(previousMessages[i].content);

      // Calculate Jaccard similarity based on word overlap
      const similarity = this.calculateJaccardSimilarity(normalizedContent, prevContent);

      if (similarity >= this.config.similarityThreshold) {
        matches.push({
          messageId: i,
          similarity,
          content: previousMessages[i].content.substring(0, 200)
        });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, this.config.maxCandidates);
  }

  /**
   * Calculate deduplication score adjustment
   */
  private calculateDeduplicationScore(similarMessages: SimilarityMatch[]): number {
    if (similarMessages.length === 0) {
      return 0;  // No adjustment
    }

    // More similar messages = more redundant = lower score
    const avgSimilarity = similarMessages.reduce((sum, m) => sum + m.similarity, 0) / similarMessages.length;
    const redundancyPenalty = avgSimilarity * similarMessages.length;

    // Reduce score by up to 4 points for highly redundant messages
    return -Math.min(4, redundancyPenalty * 2);
  }

  /**
   * Identify semantic clusters in the conversation
   */
  async identifyClusters(
    messages: Turn[],
    enhancedScores: RAGEnhancedScore[]
  ): Promise<SemanticCluster[]> {
    const clusters: SemanticCluster[] = [];
    const processedMessages = new Set<number>();

    for (let i = 0; i < messages.length; i++) {
      if (processedMessages.has(i)) {
        continue;
      }

      const score = enhancedScores[i];

      if (score.similarMessages.length > 0) {
        // Create cluster with similar messages
        const clusterMessageIds = [i, ...score.similarMessages.map(m => m.messageId)];
        const clusterScores = clusterMessageIds.map(id => enhancedScores[id]?.finalScore || 0);

        clusters.push({
          representativeMessageId: i,  // Highest score or first message
          messageIds: clusterMessageIds,
          topic: this.extractTopic(messages[i].content),
          averageScore: clusterScores.reduce((sum, s) => sum + s, 0) / clusterScores.length
        });

        // Mark messages as processed
        clusterMessageIds.forEach(id => processedMessages.add(id));
      }
    }

    console.log(`[RAGCompressor] Identified ${clusters.length} semantic clusters`);
    return clusters;
  }

  /**
   * Optimize compression decisions using semantic clusters
   */
  optimizeDecisions(
    decisions: CompressionDecision[],
    clusters: SemanticCluster[]
  ): CompressionDecision[] {
    const optimizedDecisions = [...decisions];

    for (const cluster of clusters) {
      // For each cluster, keep the representative message and compress/drop the rest
      const representative = cluster.representativeMessageId;

      for (const messageId of cluster.messageIds) {
        if (messageId !== representative) {
          const decision = optimizedDecisions[messageId];

          // If not already preserved, consider dropping redundant messages
          if (decision && decision.action !== 'preserve') {
            optimizedDecisions[messageId] = {
              ...decision,
              action: 'drop',
              reason: `Redundant (similar to message ${representative})`
            };
          }
        }
      }
    }

    return optimizedDecisions;
  }

  /**
   * Check if RAG server is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.config.ragServerUrl}/health`,
        { timeout: 2000 }
      );
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Check if two content strings match (fuzzy)
   */
  private contentMatches(content1: string, content2: string): boolean {
    const normalized1 = this.normalizeContent(content1);
    const normalized2 = this.normalizeContent(content2);

    // Consider a match if 80%+ of words overlap
    const similarity = this.calculateJaccardSimilarity(normalized1, normalized2);
    return similarity >= 0.8;
  }

  /**
   * Normalize content for comparison
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();
  }

  /**
   * Calculate Jaccard similarity between two strings
   */
  private calculateJaccardSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  }

  /**
   * Extract topic from content (simple heuristic)
   */
  private extractTopic(content: string): string {
    // Extract first meaningful phrase (up to 50 chars)
    const normalized = content.trim().split('\n')[0];

    if (normalized.length <= 50) {
      return normalized;
    }

    // Try to break at word boundary
    const truncated = normalized.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 25) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Get configuration summary
   */
  getConfigSummary(): string {
    return `
RAG Compressor Configuration:
- Enabled: ${this.config.enabled}
- RAG Server: ${this.config.ragServerUrl}
- Similarity Threshold: ${this.config.similarityThreshold}
- Max Candidates: ${this.config.maxCandidates}
- Timeout: ${this.config.timeout}ms
    `.trim();
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Merge RAG-enhanced scores with original scores
 */
export function mergeScores(
  originalScores: MessageScore[],
  enhancedScores: RAGEnhancedScore[]
): RAGEnhancedScore[] {
  return enhancedScores.map((enhanced, index) => {
    const original = originalScores[index];

    return {
      ...original,
      similarMessages: enhanced.similarMessages,
      deduplicationScore: enhanced.deduplicationScore,
      finalScore: enhanced.finalScore
    };
  });
}

/**
 * Calculate semantic diversity score for conversation
 */
export function calculateSemanticDiversity(
  enhancedScores: RAGEnhancedScore[]
): number {
  const totalMessages = enhancedScores.length;
  const redundantMessages = enhancedScores.filter(s => s.similarMessages.length > 0).length;

  // Diversity = 1.0 (all unique) to 0.0 (all redundant)
  return 1 - (redundantMessages / totalMessages);
}

/**
 * Generate semantic analysis report
 */
export function generateSemanticReport(
  enhancedScores: RAGEnhancedScore[],
  clusters: SemanticCluster[]
): string {
  const diversity = calculateSemanticDiversity(enhancedScores);
  const avgAdjustment = enhancedScores.reduce((sum, s) => sum + s.deduplicationScore, 0) / enhancedScores.length;

  return `
Semantic Analysis Report:
- Total Messages: ${enhancedScores.length}
- Redundant Messages: ${enhancedScores.filter(s => s.similarMessages.length > 0).length}
- Semantic Diversity: ${(diversity * 100).toFixed(1)}%
- Average Score Adjustment: ${avgAdjustment.toFixed(2)}
- Semantic Clusters: ${clusters.length}
- Cluster Details:
${clusters.map((c, i) => `  ${i + 1}. ${c.topic} (${c.messageIds.length} messages, avg score: ${c.averageScore.toFixed(1)})`).join('\n')}
  `.trim();
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let defaultRAGCompressor: RAGCompressor | null = null;

export function getRAGCompressor(config?: Partial<RAGConfig>): RAGCompressor {
  if (!defaultRAGCompressor) {
    defaultRAGCompressor = new RAGCompressor(config);
  } else if (config) {
    defaultRAGCompressor.updateConfig(config);
  }
  return defaultRAGCompressor;
}
