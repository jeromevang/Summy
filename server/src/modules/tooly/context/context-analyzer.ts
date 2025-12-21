/**
 * Context Analyzer - Small Model Integration
 * Uses a small, fast model for intelligent query classification and analysis
 * 
 * Part of Phase 4: Intelligent Context Management
 */

import axios from 'axios';
import type { QueryAnalysis } from './context-manager.js';

// ============================================================
// TYPES
// ============================================================

export interface SmallModelConfig {
  enabled: boolean;
  modelId: string;
  lmstudioUrl: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  cacheEnabled: boolean;
  cacheTTL: number;
}

export interface EnhancedQueryAnalysis extends QueryAnalysis {
  // Additional AI-derived insights
  intent: string;
  entities: string[];
  suggestedTools: string[];
  contextNeeds: {
    needsFileContent: boolean;
    needsProjectStructure: boolean;
    needsGitHistory: boolean;
    needsExternalDocs: boolean;
  };
  confidence: number;
  aiAnalyzed: boolean;
}

export interface RelevanceRanking {
  items: Array<{
    content: string;
    score: number;
    reason: string;
  }>;
  queryRelevance: number;
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_SMALL_MODEL_CONFIG: SmallModelConfig = {
  enabled: true,
  modelId: 'qwen2.5-coder-0.5b-instruct',  // Small, fast model
  lmstudioUrl: 'http://localhost:1234',
  maxTokens: 150,
  temperature: 0,
  timeout: 5000,  // Fast timeout for small model
  cacheEnabled: true,
  cacheTTL: 300000  // 5 minutes
};

// Simple in-memory cache for analysis results
const analysisCache = new Map<string, { result: EnhancedQueryAnalysis; timestamp: number }>();

// ============================================================
// CONTEXT ANALYZER CLASS
// ============================================================

export class ContextAnalyzer {
  private config: SmallModelConfig;
  private fallbackAnalysis: boolean = true;

  constructor(config?: Partial<SmallModelConfig>) {
    this.config = { ...DEFAULT_SMALL_MODEL_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmallModelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SmallModelConfig {
    return { ...this.config };
  }

  /**
   * Analyze a query using the small model
   * Falls back to rule-based analysis if small model fails
   */
  async analyzeQuery(query: string): Promise<EnhancedQueryAnalysis> {
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedAnalysis(query);
      if (cached) return cached;
    }

    // Try AI analysis if enabled
    if (this.config.enabled) {
      try {
        const aiAnalysis = await this.analyzeWithSmallModel(query);
        if (aiAnalysis) {
          if (this.config.cacheEnabled) {
            this.cacheAnalysis(query, aiAnalysis);
          }
          return aiAnalysis;
        }
      } catch (error) {
        console.log('[ContextAnalyzer] Small model unavailable, using fallback:', (error as Error).message);
      }
    }

    // Fallback to rule-based analysis
    return this.ruleBasedAnalysis(query);
  }

  /**
   * Rank items by relevance to query using small model
   */
  async rankByRelevance(
    query: string,
    items: string[],
    maxItems: number = 10
  ): Promise<RelevanceRanking> {
    if (!this.config.enabled || items.length === 0) {
      // Fallback: return items as-is with basic keyword scoring
      return this.keywordBasedRanking(query, items, maxItems);
    }

    try {
      return await this.rankWithSmallModel(query, items, maxItems);
    } catch (error) {
      console.log('[ContextAnalyzer] Relevance ranking fallback:', (error as Error).message);
      return this.keywordBasedRanking(query, items, maxItems);
    }
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  /**
   * Call small model for query analysis
   */
  private async analyzeWithSmallModel(query: string): Promise<EnhancedQueryAnalysis | null> {
    const systemPrompt = `You are a query analyzer. Analyze the user's query and respond with ONLY a JSON object (no markdown, no explanation):
{
  "type": "code_question|file_operation|git_operation|explanation|generation|debug",
  "complexity": "simple|medium|complex",
  "intent": "brief description of what user wants",
  "entities": ["file names", "function names", "concepts mentioned"],
  "suggestedTools": ["most relevant tool names"],
  "needsRag": true/false,
  "needsHistory": true/false,
  "needsFileContent": true/false,
  "needsProjectStructure": true/false,
  "needsGitHistory": true/false
}`;

    try {
      const response = await axios.post(
        `${this.config.lmstudioUrl}/v1/chat/completions`,
        {
          model: this.config.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stop: ['\n\n', '```']
        },
        { timeout: this.config.timeout }
      );

      const content = response.data.choices?.[0]?.message?.content || '';
      
      // Try to parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        queryType: this.mapQueryType(parsed.type),
        complexity: parsed.complexity || 'medium',
        requiresRag: parsed.needsRag ?? true,
        requiresHistory: parsed.needsHistory ?? false,
        estimatedResponseTokens: this.estimateResponseTokens(parsed.complexity, parsed.type),
        intent: parsed.intent || '',
        entities: parsed.entities || [],
        suggestedTools: parsed.suggestedTools || [],
        contextNeeds: {
          needsFileContent: parsed.needsFileContent ?? false,
          needsProjectStructure: parsed.needsProjectStructure ?? false,
          needsGitHistory: parsed.needsGitHistory ?? false,
          needsExternalDocs: false
        },
        confidence: 0.85,
        aiAnalyzed: true
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Rank items with small model
   */
  private async rankWithSmallModel(
    query: string,
    items: string[],
    maxItems: number
  ): Promise<RelevanceRanking> {
    // For efficiency, batch items into chunks
    const truncatedItems = items.slice(0, Math.min(20, items.length));
    
    const systemPrompt = `Given a query and list of items, rank them by relevance (0-100). Respond with ONLY a JSON array:
[{"index": 0, "score": 85, "reason": "brief reason"}, ...]`;

    const userContent = `Query: "${query}"

Items:
${truncatedItems.map((item, i) => `${i}. ${item.substring(0, 200)}`).join('\n')}`;

    try {
      const response = await axios.post(
        `${this.config.lmstudioUrl}/v1/chat/completions`,
        {
          model: this.config.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0,
          max_tokens: 300,
          stop: ['```']
        },
        { timeout: this.config.timeout * 2 }
      );

      const content = response.data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        return this.keywordBasedRanking(query, items, maxItems);
      }

      const rankings = JSON.parse(jsonMatch[0]);
      
      // Map back to original items
      const rankedItems = rankings
        .filter((r: any) => r.index < truncatedItems.length)
        .map((r: any) => ({
          content: truncatedItems[r.index],
          score: r.score / 100,
          reason: r.reason || ''
        }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, maxItems);

      return {
        items: rankedItems,
        queryRelevance: rankedItems.length > 0 ? rankedItems[0].score : 0
      };
    } catch (error) {
      return this.keywordBasedRanking(query, items, maxItems);
    }
  }

  /**
   * Rule-based fallback analysis
   */
  private ruleBasedAnalysis(query: string): EnhancedQueryAnalysis {
    const lowerQuery = query.toLowerCase();

    // Determine query type
    let queryType: EnhancedQueryAnalysis['queryType'] = 'explanation';

    if (lowerQuery.includes('read') || lowerQuery.includes('write') ||
        lowerQuery.includes('create file') || lowerQuery.includes('delete file') ||
        lowerQuery.includes('edit') || lowerQuery.includes('modify')) {
      queryType = 'file_operation';
    } else if (lowerQuery.includes('git') || lowerQuery.includes('commit') ||
               lowerQuery.includes('branch') || lowerQuery.includes('push') ||
               lowerQuery.includes('pull')) {
      queryType = 'git_operation';
    } else if (lowerQuery.includes('how does') || lowerQuery.includes('where is') ||
               lowerQuery.includes('find') || lowerQuery.includes('explain') ||
               lowerQuery.includes('understand')) {
      queryType = 'code_question';
    } else if (lowerQuery.includes('bug') || lowerQuery.includes('error') ||
               lowerQuery.includes('fix') || lowerQuery.includes('debug') ||
               lowerQuery.includes('issue')) {
      queryType = 'debug';
    } else if (lowerQuery.includes('create') || lowerQuery.includes('generate') ||
               lowerQuery.includes('implement') || lowerQuery.includes('build') ||
               lowerQuery.includes('add')) {
      queryType = 'generation';
    }

    // Determine complexity
    const wordCount = query.split(/\s+/).length;
    let complexity: EnhancedQueryAnalysis['complexity'] = 'simple';

    if (wordCount > 50 || query.includes('\n') ||
        lowerQuery.includes('complex') || lowerQuery.includes('multiple')) {
      complexity = 'complex';
    } else if (wordCount > 20) {
      complexity = 'medium';
    }

    // Suggest tools based on type
    const suggestedTools: string[] = [];
    if (queryType === 'code_question') suggestedTools.push('rag_query', 'read_file');
    if (queryType === 'file_operation') suggestedTools.push('read_file', 'write_file', 'edit_file');
    if (queryType === 'git_operation') suggestedTools.push('git_status', 'git_diff', 'git_commit');
    if (queryType === 'debug') suggestedTools.push('rag_query', 'read_file', 'search_files');
    if (queryType === 'generation') suggestedTools.push('write_file', 'rag_query');

    // Extract entities (basic)
    const entities: string[] = [];
    const fileMatch = query.match(/[\w-]+\.(ts|tsx|js|jsx|py|java|json|md|css|html)/gi);
    if (fileMatch) entities.push(...fileMatch);
    const funcMatch = query.match(/\b([a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*)\s*\(/g);
    if (funcMatch) entities.push(...funcMatch.map(f => f.replace('(', '')));

    return {
      queryType,
      complexity,
      requiresRag: queryType === 'code_question' || queryType === 'debug',
      requiresHistory: lowerQuery.includes('we') || lowerQuery.includes('earlier') ||
                       lowerQuery.includes('before') || lowerQuery.includes('previous'),
      estimatedResponseTokens: this.estimateResponseTokens(complexity, queryType),
      intent: this.extractIntent(query, queryType),
      entities: [...new Set(entities)],
      suggestedTools,
      contextNeeds: {
        needsFileContent: queryType === 'debug' || queryType === 'code_question',
        needsProjectStructure: queryType === 'generation' || lowerQuery.includes('architecture'),
        needsGitHistory: queryType === 'git_operation' || lowerQuery.includes('change'),
        needsExternalDocs: lowerQuery.includes('documentation') || lowerQuery.includes('docs')
      },
      confidence: 0.6,
      aiAnalyzed: false
    };
  }

  /**
   * Keyword-based relevance ranking fallback
   */
  private keywordBasedRanking(
    query: string,
    items: string[],
    maxItems: number
  ): RelevanceRanking {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const scored = items.map(item => {
      const itemLower = item.toLowerCase();
      const matchCount = queryWords.filter(w => itemLower.includes(w)).length;
      const score = matchCount / Math.max(queryWords.length, 1);

      return {
        content: item,
        score,
        reason: matchCount > 0 ? `${matchCount} keyword matches` : 'No direct matches'
      };
    });

    const sorted = scored.sort((a, b) => b.score - a.score).slice(0, maxItems);

    return {
      items: sorted,
      queryRelevance: sorted.length > 0 ? sorted[0].score : 0
    };
  }

  /**
   * Cache management
   */
  private getCachedAnalysis(query: string): EnhancedQueryAnalysis | null {
    const key = this.hashQuery(query);
    const cached = analysisCache.get(key);

    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.result;
    }

    return null;
  }

  private cacheAnalysis(query: string, result: EnhancedQueryAnalysis): void {
    const key = this.hashQuery(query);
    analysisCache.set(key, { result, timestamp: Date.now() });

    // Clean old entries periodically
    if (analysisCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of analysisCache.entries()) {
        if (now - v.timestamp > this.config.cacheTTL) {
          analysisCache.delete(k);
        }
      }
    }
  }

  private hashQuery(query: string): string {
    // Simple hash for caching
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Helper methods
   */
  private mapQueryType(type: string): EnhancedQueryAnalysis['queryType'] {
    const typeMap: Record<string, EnhancedQueryAnalysis['queryType']> = {
      'code_question': 'code_question',
      'file_operation': 'file_operation',
      'git_operation': 'git_operation',
      'explanation': 'explanation',
      'generation': 'generation',
      'debug': 'debug'
    };
    return typeMap[type] || 'explanation';
  }

  private estimateResponseTokens(complexity: string, type: string): number {
    let base = 500;
    if (type === 'generation') base = 1500;
    if (type === 'debug') base = 1000;
    if (complexity === 'complex') base *= 1.5;
    if (complexity === 'simple') base *= 0.7;
    return Math.round(base);
  }

  private extractIntent(query: string, type: string): string {
    const actions: Record<string, string> = {
      'code_question': 'understand or find code',
      'file_operation': 'modify files',
      'git_operation': 'manage version control',
      'explanation': 'get explanation',
      'generation': 'create new code',
      'debug': 'fix issue'
    };
    return actions[type] || 'process request';
  }
}

// Export singleton
export const contextAnalyzer = new ContextAnalyzer();

export default contextAnalyzer;

