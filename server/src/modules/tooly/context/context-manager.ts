/**
 * Intelligent Context Manager
 * Manages token budgets and optimizes context for each model
 * 
 * Enhanced with Phase 4: Small model integration for context intelligence
 */

import type { 
  ContextBudget,
  RAGSettings
} from '../types.js';
import { contextAnalyzer, type EnhancedQueryAnalysis, type SmallModelConfig } from './context-analyzer.js';
import { summarizer } from './summarizer.js';

// ============================================================
// TYPES
// ============================================================

export interface QueryAnalysis {
  queryType: 'code_question' | 'file_operation' | 'git_operation' | 'explanation' | 'generation' | 'debug';
  complexity: 'simple' | 'medium' | 'complex';
  requiresRag: boolean;
  requiresHistory: boolean;
  estimatedResponseTokens: number;
}

export { EnhancedQueryAnalysis, SmallModelConfig };

export interface Turn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  timestamp?: number;
}

export interface OptimizedContext {
  systemPrompt: string;
  toolSchemas: any[];
  memories: string[];
  ragResults: string[];
  history: Turn[];
  currentQuery: string;
  totalTokens: number;
  breakdown: {
    system: number;
    tools: number;
    memory: number;
    rag: number;
    history: number;
    query: number;
    reserve: number;
  };
  warnings: string[];
}

// ============================================================
// TOKEN ESTIMATION
// ============================================================

/**
 * Estimate token count for a string
 * Rough approximation: ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for tool schemas
 */
export function estimateToolSchemaTokens(schemas: any[]): number {
  const json = JSON.stringify(schemas);
  return estimateTokens(json);
}

// ============================================================
// QUERY ANALYSIS
// ============================================================

/**
 * Analyze a query to determine its requirements
 */
export function analyzeQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  
  // Determine query type
  let queryType: QueryAnalysis['queryType'] = 'explanation';
  
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
  let complexity: QueryAnalysis['complexity'] = 'simple';
  
  if (wordCount > 50 || query.includes('\n') || 
      lowerQuery.includes('complex') || lowerQuery.includes('multiple')) {
    complexity = 'complex';
  } else if (wordCount > 20) {
    complexity = 'medium';
  }
  
  // Determine if RAG is needed
  const requiresRag = queryType === 'code_question' || 
                      queryType === 'debug' ||
                      (queryType === 'generation' && complexity !== 'simple');
  
  // Determine if history is needed
  const requiresHistory = lowerQuery.includes('we') ||
                          lowerQuery.includes('earlier') ||
                          lowerQuery.includes('before') ||
                          lowerQuery.includes('previous') ||
                          lowerQuery.includes('you said');
  
  // Estimate response tokens
  let estimatedResponseTokens = 500;
  if (queryType === 'generation') estimatedResponseTokens = 1500;
  if (queryType === 'debug') estimatedResponseTokens = 1000;
  if (complexity === 'complex') estimatedResponseTokens *= 1.5;
  
  return {
    queryType,
    complexity,
    requiresRag,
    requiresHistory,
    estimatedResponseTokens: Math.round(estimatedResponseTokens)
  };
}

// ============================================================
// CONTEXT MANAGER CLASS
// ============================================================

export class ContextManager {
  private defaultBudget: ContextBudget;
  private useSmallModel: boolean = true;
  
  constructor(defaultBudget?: Partial<ContextBudget>) {
    this.defaultBudget = {
      total: 32000,
      systemPrompt: 2000,
      toolSchemas: 4000,
      memory: 1000,
      ragResults: 8000,
      history: 12000,
      reserve: 5000,
      ...defaultBudget
    };
  }

  /**
   * Configure the small model for context intelligence
   */
  configureSmallModel(config: Partial<SmallModelConfig>): void {
    contextAnalyzer.updateConfig(config);
    summarizer.updateConfig(config);
  }

  /**
   * Enable/disable small model usage
   */
  setSmallModelEnabled(enabled: boolean): void {
    this.useSmallModel = enabled;
    contextAnalyzer.updateConfig({ enabled });
    summarizer.updateConfig({ enabled });
  }

  /**
   * Get enhanced query analysis using small model (if available)
   */
  async analyzeQueryEnhanced(query: string): Promise<EnhancedQueryAnalysis> {
    if (this.useSmallModel) {
      return contextAnalyzer.analyzeQuery(query);
    }
    // Fallback to basic analysis wrapped as enhanced
    const basic = analyzeQuery(query);
    return {
      ...basic,
      intent: '',
      entities: [],
      suggestedTools: [],
      contextNeeds: {
        needsFileContent: false,
        needsProjectStructure: false,
        needsGitHistory: false,
        needsExternalDocs: false
      },
      confidence: 0.5,
      aiAnalyzed: false
    };
  }

  /**
   * Summarize content using small model
   */
  async summarizeContent(content: string, targetTokens: number = 200): Promise<string> {
    if (this.useSmallModel) {
      const result = await summarizer.summarizeContent(content, targetTokens);
      return result.summary;
    }
    return this.truncateToTokens(content, targetTokens);
  }

  /**
   * Summarize conversation history
   */
  async summarizeHistory(turns: Turn[], targetTokens: number = 500): Promise<Turn[]> {
    if (!this.useSmallModel || turns.length < 6) {
      return turns;
    }

    // Summarize older turns, keep recent ones intact
    const keepRecent = 4;
    const olderTurns = turns.slice(0, -keepRecent);
    const recentTurns = turns.slice(-keepRecent);

    if (olderTurns.length === 0) {
      return recentTurns;
    }

    // Summarize older turns
    const summary = await summarizer.summarizeConversation(
      olderTurns.map(t => ({ role: t.role, content: t.content })),
      targetTokens
    );

    // Create a summary turn to inject
    const summaryTurn: Turn = {
      role: 'system',
      content: `[Previous conversation summary: ${summary.summary}${
        summary.keyTopics.length > 0 ? ` Topics: ${summary.keyTopics.join(', ')}` : ''
      }${
        summary.pendingItems.length > 0 ? ` Pending: ${summary.pendingItems.join(', ')}` : ''
      }]`
    };

    return [summaryTurn, ...recentTurns];
  }

  /**
   * Rank RAG results by relevance
   */
  async rankRagResults(
    query: string,
    results: string[],
    maxResults: number = 5
  ): Promise<string[]> {
    if (!this.useSmallModel) {
      return results.slice(0, maxResults);
    }

    const ranked = await contextAnalyzer.rankByRelevance(query, results, maxResults);
    return ranked.items.map(item => item.content);
  }
  
  /**
   * Build optimized context within budget
   * Note: Use buildContextAsync for enhanced analysis with small model
   */
  buildContext(params: {
    query: string;
    history: Turn[];
    systemPrompt: string;
    toolSchemas: any[];
    memories?: string[];
    ragResults?: string[];
    budget?: ContextBudget;
  }): OptimizedContext {
    const budget = params.budget || this.defaultBudget;
    const warnings: string[] = [];
    
    // Analyze query (synchronous fallback)
    const queryAnalysis = analyzeQuery(params.query);
    
    // Track token usage
    const breakdown = {
      system: 0,
      tools: 0,
      memory: 0,
      rag: 0,
      history: 0,
      query: 0,
      reserve: budget.reserve
    };
    
    // 1. System prompt (always included, may be truncated)
    let systemPrompt = params.systemPrompt;
    breakdown.system = estimateTokens(systemPrompt);
    
    if (breakdown.system > budget.systemPrompt) {
      systemPrompt = this.truncateToTokens(systemPrompt, budget.systemPrompt);
      breakdown.system = budget.systemPrompt;
      warnings.push('System prompt truncated to fit budget');
    }
    
    // 2. Query (always included)
    breakdown.query = estimateTokens(params.query);
    
    // 3. Tool schemas (filter based on query type if needed)
    let toolSchemas = params.toolSchemas;
    breakdown.tools = estimateToolSchemaTokens(toolSchemas);
    
    if (breakdown.tools > budget.toolSchemas) {
      toolSchemas = this.prioritizeTools(toolSchemas, budget.toolSchemas, queryAnalysis.queryType);
      breakdown.tools = estimateToolSchemaTokens(toolSchemas);
      warnings.push(`Tool schemas reduced from ${params.toolSchemas.length} to ${toolSchemas.length}`);
    }
    
    // 4. Memories (optional, based on relevance)
    let memories: string[] = [];
    if (params.memories && queryAnalysis.requiresHistory) {
      memories = this.selectRelevantMemories(
        params.memories, 
        params.query, 
        budget.memory
      );
      breakdown.memory = memories.reduce((sum, m) => sum + estimateTokens(m), 0);
    }
    
    // 5. RAG results (if needed)
    let ragResults: string[] = [];
    if (params.ragResults && queryAnalysis.requiresRag) {
      ragResults = this.fitToTokens(params.ragResults, budget.ragResults);
      breakdown.rag = ragResults.reduce((sum, r) => sum + estimateTokens(r), 0);
    }
    
    // 6. History (trimmed to fit)
    const usedTokens = breakdown.system + breakdown.tools + breakdown.memory + 
                       breakdown.rag + breakdown.query + breakdown.reserve;
    const historyBudget = Math.min(budget.history, budget.total - usedTokens);
    
    let history: Turn[] = [];
    if (queryAnalysis.requiresHistory && historyBudget > 0) {
      history = this.trimHistory(params.history, historyBudget);
      breakdown.history = history.reduce((sum, t) => sum + estimateTokens(t.content), 0);
    } else if (!queryAnalysis.requiresHistory) {
      // Still include some recent context
      history = params.history.slice(-2);
      breakdown.history = history.reduce((sum, t) => sum + estimateTokens(t.content), 0);
    }
    
    // Calculate total
    const totalTokens = breakdown.system + breakdown.tools + breakdown.memory + 
                        breakdown.rag + breakdown.history + breakdown.query;
    
    if (totalTokens > budget.total - budget.reserve) {
      warnings.push(`Context may exceed budget: ${totalTokens} tokens used, ${budget.total} available`);
    }
    
    return {
      systemPrompt,
      toolSchemas,
      memories,
      ragResults,
      history,
      currentQuery: params.query,
      totalTokens,
      breakdown,
      warnings
    };
  }

  /**
   * Build optimized context with enhanced AI analysis
   * Uses small model for query classification and summarization
   */
  async buildContextAsync(params: {
    query: string;
    history: Turn[];
    systemPrompt: string;
    toolSchemas: any[];
    memories?: string[];
    ragResults?: string[];
    budget?: ContextBudget;
  }): Promise<OptimizedContext & { enhancedAnalysis?: EnhancedQueryAnalysis }> {
    const budget = params.budget || this.defaultBudget;
    const warnings: string[] = [];

    // Enhanced AI-powered query analysis
    const enhancedAnalysis = await this.analyzeQueryEnhanced(params.query);
    
    if (enhancedAnalysis.aiAnalyzed) {
      warnings.push('Query analyzed with AI assistance');
    }

    // Track token usage
    const breakdown = {
      system: 0,
      tools: 0,
      memory: 0,
      rag: 0,
      history: 0,
      query: 0,
      reserve: budget.reserve
    };

    // 1. System prompt
    let systemPrompt = params.systemPrompt;
    breakdown.system = estimateTokens(systemPrompt);

    if (breakdown.system > budget.systemPrompt) {
      systemPrompt = await this.summarizeContent(systemPrompt, budget.systemPrompt);
      breakdown.system = estimateTokens(systemPrompt);
      warnings.push('System prompt summarized to fit budget');
    }

    // 2. Query
    breakdown.query = estimateTokens(params.query);

    // 3. Tool schemas - prioritize based on AI-suggested tools
    let toolSchemas = params.toolSchemas;
    breakdown.tools = estimateToolSchemaTokens(toolSchemas);

    if (breakdown.tools > budget.toolSchemas) {
      // Use AI-suggested tools for prioritization
      const priorityTools = enhancedAnalysis.suggestedTools.length > 0
        ? enhancedAnalysis.suggestedTools
        : this.getDefaultPriorityTools(enhancedAnalysis.queryType);

      toolSchemas = this.prioritizeToolsEnhanced(toolSchemas, budget.toolSchemas, priorityTools);
      breakdown.tools = estimateToolSchemaTokens(toolSchemas);
      warnings.push(`Tool schemas reduced to ${toolSchemas.length} based on query analysis`);
    }

    // 4. Memories - use AI for relevance ranking
    let memories: string[] = [];
    if (params.memories && params.memories.length > 0) {
      memories = await this.rankRagResults(params.query, params.memories, 5);
      memories = this.fitToTokens(memories, budget.memory);
      breakdown.memory = memories.reduce((sum, m) => sum + estimateTokens(m), 0);
    }

    // 5. RAG results - use AI for ranking if available
    let ragResults: string[] = [];
    if (params.ragResults && enhancedAnalysis.contextNeeds.needsFileContent) {
      ragResults = await this.rankRagResults(params.query, params.ragResults, 10);
      ragResults = this.fitToTokens(ragResults, budget.ragResults);
      breakdown.rag = ragResults.reduce((sum, r) => sum + estimateTokens(r), 0);
    } else if (params.ragResults && enhancedAnalysis.requiresRag) {
      ragResults = this.fitToTokens(params.ragResults, budget.ragResults);
      breakdown.rag = ragResults.reduce((sum, r) => sum + estimateTokens(r), 0);
    }

    // 6. History - summarize older turns if needed
    const usedTokens = breakdown.system + breakdown.tools + breakdown.memory +
                       breakdown.rag + breakdown.query + breakdown.reserve;
    const historyBudget = Math.min(budget.history, budget.total - usedTokens);

    let history: Turn[] = [];
    if (params.history.length > 0 && historyBudget > 0) {
      history = await this.summarizeHistory(params.history, historyBudget);
      breakdown.history = history.reduce((sum, t) => sum + estimateTokens(t.content), 0);
    }

    const totalTokens = breakdown.system + breakdown.tools + breakdown.memory +
                        breakdown.rag + breakdown.history + breakdown.query;

    if (totalTokens > budget.total - budget.reserve) {
      warnings.push(`Context may exceed budget: ${totalTokens} tokens used, ${budget.total} available`);
    }

    return {
      systemPrompt,
      toolSchemas,
      memories,
      ragResults,
      history,
      currentQuery: params.query,
      totalTokens,
      breakdown,
      warnings,
      enhancedAnalysis
    };
  }

  /**
   * Get default priority tools for a query type
   */
  private getDefaultPriorityTools(queryType: string): string[] {
    const priorities: Record<string, string[]> = {
      'code_question': ['rag_query', 'read_file', 'search_files', 'list_directory'],
      'file_operation': ['read_file', 'write_file', 'edit_file', 'list_directory', 'delete_file'],
      'git_operation': ['git_status', 'git_diff', 'git_commit', 'git_add', 'git_log'],
      'debug': ['rag_query', 'read_file', 'search_files', 'shell_exec'],
      'generation': ['write_file', 'edit_file', 'read_file', 'rag_query'],
      'explanation': ['rag_query', 'read_file', 'search_files']
    };
    return priorities[queryType] || priorities['explanation'];
  }

  /**
   * Prioritize tools with AI-suggested priority list
   */
  private prioritizeToolsEnhanced(
    schemas: any[],
    maxTokens: number,
    priorityTools: string[]
  ): any[] {
    const sorted = [...schemas].sort((a, b) => {
      const nameA = a.function?.name || a.name || '';
      const nameB = b.function?.name || b.name || '';
      const indexA = priorityTools.indexOf(nameA);
      const indexB = priorityTools.indexOf(nameB);

      if (indexA >= 0 && indexB >= 0) return indexA - indexB;
      if (indexA >= 0) return -1;
      if (indexB >= 0) return 1;
      return 0;
    });

    const result: any[] = [];
    let tokens = 0;

    for (const schema of sorted) {
      const schemaTokens = estimateTokens(JSON.stringify(schema));
      if (tokens + schemaTokens > maxTokens) break;
      result.push(schema);
      tokens += schemaTokens;
    }

    return result;
  }
  
  /**
   * Truncate text to fit token budget
   */
  private truncateToTokens(text: string, maxTokens: number): string {
    const estimatedChars = maxTokens * 4;
    if (text.length <= estimatedChars) return text;
    
    // Try to break at sentence boundary
    const truncated = text.substring(0, estimatedChars);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > estimatedChars * 0.7) {
      return truncated.substring(0, lastPeriod + 1);
    }
    
    return truncated + '...';
  }
  
  /**
   * Prioritize tools based on query type
   */
  private prioritizeTools(schemas: any[], maxTokens: number, queryType: string): any[] {
    // Tool priority by query type
    const priorities: Record<string, string[]> = {
      'code_question': ['rag_query', 'read_file', 'search_files', 'list_directory'],
      'file_operation': ['read_file', 'write_file', 'edit_file', 'list_directory', 'delete_file'],
      'git_operation': ['git_status', 'git_diff', 'git_commit', 'git_add', 'git_log'],
      'debug': ['rag_query', 'read_file', 'search_files', 'shell_exec'],
      'generation': ['write_file', 'edit_file', 'read_file', 'rag_query'],
      'explanation': ['rag_query', 'read_file', 'search_files']
    };
    
    const priority = priorities[queryType] || priorities['explanation'];
    
    // Sort schemas by priority
    const sorted = [...schemas].sort((a, b) => {
      const nameA = a.function?.name || a.name || '';
      const nameB = b.function?.name || b.name || '';
      const indexA = priority.indexOf(nameA);
      const indexB = priority.indexOf(nameB);
      
      // Priority tools first, then others
      if (indexA >= 0 && indexB >= 0) return indexA - indexB;
      if (indexA >= 0) return -1;
      if (indexB >= 0) return 1;
      return 0;
    });
    
    // Take tools until budget is reached
    const result: any[] = [];
    let tokens = 0;
    
    for (const schema of sorted) {
      const schemaTokens = estimateTokens(JSON.stringify(schema));
      if (tokens + schemaTokens > maxTokens) break;
      result.push(schema);
      tokens += schemaTokens;
    }
    
    return result;
  }
  
  /**
   * Select most relevant memories
   */
  private selectRelevantMemories(
    memories: string[], 
    query: string, 
    maxTokens: number
  ): string[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    
    // Score memories by relevance
    const scored = memories.map(memory => {
      const memoryWords = memory.toLowerCase().split(/\s+/);
      const overlap = queryWords.filter(w => memoryWords.includes(w)).length;
      return { memory, score: overlap };
    }).sort((a, b) => b.score - a.score);
    
    // Take top memories until budget
    const result: string[] = [];
    let tokens = 0;
    
    for (const { memory } of scored) {
      const memoryTokens = estimateTokens(memory);
      if (tokens + memoryTokens > maxTokens) break;
      result.push(memory);
      tokens += memoryTokens;
    }
    
    return result;
  }
  
  /**
   * Fit items to token budget
   */
  private fitToTokens(items: string[], maxTokens: number): string[] {
    const result: string[] = [];
    let tokens = 0;
    
    for (const item of items) {
      const itemTokens = estimateTokens(item);
      if (tokens + itemTokens > maxTokens) break;
      result.push(item);
      tokens += itemTokens;
    }
    
    return result;
  }
  
  /**
   * Trim history to fit budget, keeping most recent
   */
  private trimHistory(history: Turn[], maxTokens: number): Turn[] {
    const reversed = [...history].reverse();
    const result: Turn[] = [];
    let tokens = 0;
    
    for (const turn of reversed) {
      const turnTokens = estimateTokens(turn.content);
      if (tokens + turnTokens > maxTokens) break;
      result.unshift(turn);
      tokens += turnTokens;
    }
    
    return result;
  }
  
  /**
   * Calculate budget for a specific model based on its context limit
   */
  calculateBudgetForModel(modelContextLimit: number): ContextBudget {
    // Allocate percentages based on total
    return {
      total: modelContextLimit,
      systemPrompt: Math.round(modelContextLimit * 0.06),
      toolSchemas: Math.round(modelContextLimit * 0.12),
      memory: Math.round(modelContextLimit * 0.03),
      ragResults: Math.round(modelContextLimit * 0.25),
      history: Math.round(modelContextLimit * 0.38),
      reserve: Math.round(modelContextLimit * 0.16)
    };
  }
}

// Export singleton
export const contextManager = new ContextManager();

export default contextManager;

