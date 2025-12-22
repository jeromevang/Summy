/**
 * Context Summarizer - Small Model Integration
 * Uses a small, fast model for intelligent context summarization
 * 
 * Part of Phase 4: Intelligent Context Management
 */

import axios from 'axios';
import type { SmallModelConfig } from './context-analyzer.js';

// ============================================================
// TYPES
// ============================================================

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  tokensSaved: number;
  compressionRatio: number;
  aiGenerated: boolean;
}

export interface ConversationSummary {
  turns: number;
  summary: string;
  keyTopics: string[];
  pendingItems: string[];
  importantFacts: string[];
  aiGenerated: boolean;
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_SUMMARIZER_CONFIG: SmallModelConfig = {
  enabled: true,
  modelId: 'qwen2.5-coder-0.5b-instruct',
  lmstudioUrl: 'http://localhost:1234',
  maxTokens: 300,
  temperature: 0.1,
  timeout: 8000,
  cacheEnabled: true,
  cacheTTL: 600000  // 10 minutes for summaries
};

// Cache for summaries
const summaryCache = new Map<string, { result: string; timestamp: number }>();

// ============================================================
// SUMMARIZER CLASS
// ============================================================

export class Summarizer {
  private config: SmallModelConfig;

  constructor(config?: Partial<SmallModelConfig>) {
    this.config = { ...DEFAULT_SUMMARIZER_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmallModelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Summarize a code block or text content
   */
  async summarizeContent(
    content: string,
    targetTokens: number = 200
  ): Promise<SummaryResult> {
    const originalTokens = this.estimateTokens(content);

    // If already short enough, no summarization needed
    if (originalTokens <= targetTokens) {
      return {
        summary: content,
        keyPoints: [],
        tokensSaved: 0,
        compressionRatio: 1.0,
        aiGenerated: false
      };
    }

    // Check cache
    const cacheKey = this.hashContent(content, targetTokens);
    if (this.config.cacheEnabled) {
      const cached = summaryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return {
          summary: cached.result,
          keyPoints: [],
          tokensSaved: originalTokens - this.estimateTokens(cached.result),
          compressionRatio: this.estimateTokens(cached.result) / originalTokens,
          aiGenerated: true
        };
      }
    }

    // Try AI summarization
    if (this.config.enabled) {
      try {
        const aiSummary = await this.summarizeWithSmallModel(content, targetTokens);
        if (aiSummary) {
          if (this.config.cacheEnabled) {
            summaryCache.set(cacheKey, { result: aiSummary, timestamp: Date.now() });
          }
          return {
            summary: aiSummary,
            keyPoints: this.extractKeyPoints(aiSummary),
            tokensSaved: originalTokens - this.estimateTokens(aiSummary),
            compressionRatio: this.estimateTokens(aiSummary) / originalTokens,
            aiGenerated: true
          };
        }
      } catch (error) {
        console.log('[Summarizer] Small model unavailable, using extraction:', (error as Error).message);
      }
    }

    // Fallback: extractive summarization
    const extracted = this.extractiveSummarize(content, targetTokens);
    return {
      summary: extracted,
      keyPoints: [],
      tokensSaved: originalTokens - this.estimateTokens(extracted),
      compressionRatio: this.estimateTokens(extracted) / originalTokens,
      aiGenerated: false
    };
  }

  /**
   * Summarize conversation history
   */
  async summarizeConversation(
    turns: Array<{ role: string; content: string }>,
    targetTokens: number = 500
  ): Promise<ConversationSummary> {
    if (turns.length === 0) {
      return {
        turns: 0,
        summary: '',
        keyTopics: [],
        pendingItems: [],
        importantFacts: [],
        aiGenerated: false
      };
    }

    const conversationText = turns
      .map(t => `${t.role}: ${t.content}`)
      .join('\n\n');

    if (this.config.enabled) {
      try {
        return await this.summarizeConversationWithModel(turns, targetTokens);
      } catch (error) {
        console.log('[Summarizer] Conversation summary fallback:', (error as Error).message);
      }
    }

    // Fallback: extract key sentences
    const summary = this.extractiveSummarize(conversationText, targetTokens);
    return {
      turns: turns.length,
      summary,
      keyTopics: this.extractTopics(conversationText),
      pendingItems: [],
      importantFacts: [],
      aiGenerated: false
    };
  }

  /**
   * Summarize RAG results for injection into context
   */
  async summarizeRagResults(
    results: Array<{ content: string; source: string; score: number }>,
    query: string,
    targetTokens: number = 1000
  ): Promise<string> {
    if (results.length === 0) return '';

    const combinedContent = results
      .map(r => `[${r.source}]\n${r.content}`)
      .join('\n\n---\n\n');

    const currentTokens = this.estimateTokens(combinedContent);

    // If fits, return as-is
    if (currentTokens <= targetTokens) {
      return combinedContent;
    }

    // Try AI summarization
    if (this.config.enabled) {
      try {
        const systemPrompt = `Summarize these code search results to help answer the query. Keep the most relevant code and file references. Be concise but preserve important details.`;

        const response = await axios.post(
          `${this.config.lmstudioUrl}/v1/chat/completions`,
          {
            model: this.config.modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Query: "${query}"\n\nResults:\n${combinedContent.substring(0, 4000)}` }
            ],
            temperature: 0,
            max_tokens: Math.min(targetTokens, 500)
          },
          { timeout: this.config.timeout }
        );

        const summary = response.data.choices?.[0]?.message?.content;
        if (summary) return summary;
      } catch (error) {
        console.log('[Summarizer] RAG summary fallback');
      }
    }

    // Fallback: truncate with priority to higher-scored results
    return this.truncateRagResults(results, targetTokens);
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  /**
   * Call small model for summarization
   */
  private async summarizeWithSmallModel(content: string, targetTokens: number): Promise<string | null> {
    const systemPrompt = `Summarize the following content concisely. Keep key information, function names, and important details. Target approximately ${targetTokens} tokens.`;

    try {
      const response = await axios.post(
        `${this.config.lmstudioUrl}/v1/chat/completions`,
        {
          model: this.config.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content.substring(0, 8000) }  // Limit input
          ],
          temperature: this.config.temperature,
          max_tokens: Math.min(targetTokens + 50, this.config.maxTokens)
        },
        { timeout: this.config.timeout }
      );

      return response.data.choices?.[0]?.message?.content || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Summarize conversation using small model
   */
  private async summarizeConversationWithModel(
    turns: Array<{ role: string; content: string }>,
    targetTokens: number
  ): Promise<ConversationSummary> {
    const systemPrompt = `Analyze this conversation and provide a JSON summary:
{
  "summary": "brief summary of conversation",
  "keyTopics": ["topic1", "topic2"],
  "pendingItems": ["any unfinished tasks mentioned"],
  "importantFacts": ["key facts established"]
}`;

    const conversationText = turns
      .slice(-10)  // Last 10 turns for context
      .map(t => `${t.role}: ${t.content.substring(0, 500)}`)
      .join('\n');

    try {
      const response = await axios.post(
        `${this.config.lmstudioUrl}/v1/chat/completions`,
        {
          model: this.config.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: conversationText }
          ],
          temperature: 0,
          max_tokens: 300
        },
        { timeout: this.config.timeout }
      );

      const content = response.data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          turns: turns.length,
          summary: parsed.summary || '',
          keyTopics: parsed.keyTopics || [],
          pendingItems: parsed.pendingItems || [],
          importantFacts: parsed.importantFacts || [],
          aiGenerated: true
        };
      }
    } catch (error) {
      // Fall through to fallback
    }

    // Fallback
    const conversationFull = turns.map(t => t.content).join(' ');
    return {
      turns: turns.length,
      summary: this.extractiveSummarize(conversationFull, targetTokens),
      keyTopics: this.extractTopics(conversationFull),
      pendingItems: [],
      importantFacts: [],
      aiGenerated: false
    };
  }

  /**
   * Extractive summarization (fallback)
   * Takes first and last parts, plus key sentences
   */
  private extractiveSummarize(content: string, targetTokens: number): string {
    const targetChars = targetTokens * 4;

    if (content.length <= targetChars) {
      return content;
    }

    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (sentences.length <= 3) {
      return content.substring(0, targetChars) + '...';
    }

    // Take first sentence, key middle sentences, and last sentence
    const result: string[] = [];
    let charCount = 0;

    // First sentence
    result.push(sentences[0].trim());
    charCount += sentences[0].length;

    // Key sentences from middle (those with important keywords)
    const keywords = ['function', 'class', 'return', 'import', 'export', 'const', 'let', 'def', 'if', 'for'];
    const middleSentences = sentences.slice(1, -1);

    for (const sentence of middleSentences) {
      if (charCount >= targetChars * 0.7) break;

      const hasKeyword = keywords.some(kw => sentence.toLowerCase().includes(kw));
      if (hasKeyword) {
        result.push(sentence.trim());
        charCount += sentence.length;
      }
    }

    // Last sentence
    if (charCount < targetChars) {
      result.push(sentences[sentences.length - 1].trim());
    }

    return result.join('. ') + '.';
  }

  /**
   * Extract topics from text
   */
  private extractTopics(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();

    // Count meaningful words (length > 4, not common words)
    const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should']);

    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (cleaned.length > 4 && !stopWords.has(cleaned)) {
        wordCounts.set(cleaned, (wordCounts.get(cleaned) || 0) + 1);
      }
    }

    // Get top 5 words as topics
    return [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Extract key points from summary
   */
  private extractKeyPoints(summary: string): string[] {
    const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 3).map(s => s.trim());
  }

  /**
   * Truncate RAG results by score
   */
  private truncateRagResults(
    results: Array<{ content: string; source: string; score: number }>,
    targetTokens: number
  ): string {
    const sorted = [...results].sort((a, b) => b.score - a.score);
    const output: string[] = [];
    let tokenCount = 0;

    for (const result of sorted) {
      const entry = `[${result.source}]\n${result.content}`;
      const entryTokens = this.estimateTokens(entry);

      if (tokenCount + entryTokens > targetTokens) {
        // Truncate this entry if we have room for part of it
        const remainingTokens = targetTokens - tokenCount;
        if (remainingTokens > 50) {
          output.push(entry.substring(0, remainingTokens * 4) + '...');
        }
        break;
      }

      output.push(entry);
      tokenCount += entryTokens;
    }

    return output.join('\n\n---\n\n');
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Create content hash for caching
   */
  private hashContent(content: string, targetTokens: number): string {
    let hash = targetTokens;
    for (let i = 0; i < Math.min(content.length, 500); i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// Export singleton
export const summarizer = new Summarizer();

export default summarizer;



