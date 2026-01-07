/**
 * Context Management Module
 * Exports context manager, analyzer, and summarizer for intelligent context handling
 */

// Imports from Context Manager related files
export {
  ContextManager,
  contextManager,
  type QueryAnalysis,
  type OptimizedContext
} from './context-manager.js';

// Imports from Query Analyzer
export { analyzeQuery } from './context-management/QueryAnalyzer.js';

// Imports from Context Budget
export { ContextBudgetManager } from './context-budget.js';

// Imports from Context Analyzer
export {
  ContextAnalyzer,
  contextAnalyzer,
  type RelevanceRanking,
  type SmallModelConfig,
  type EnhancedQueryAnalysis
} from './context-analyzer.js';

// Imports from Summarizer
export {
  Summarizer,
  summarizer,
  type SummaryResult,
  type ConversationSummary
} from './summarizer.js';

// Import from Analytics Service for token estimation
import { analytics } from '../../../services/analytics.js';
export const estimateTokens = analytics.estimateTokens.bind(analytics);
export const estimateMessagesTokens = analytics.estimateMessagesTokens.bind(analytics);

// Export types that might be needed globally but are defined elsewhere
// export type { Turn } from '@summy/shared'; // Assuming Turn is from shared
export interface Turn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
}

// Imports from Smart Compression System
export {
  MessageAnalyzer,
  getMessageAnalyzer,
  type MessageScore,
  type MessageType,
  type AnalysisConfig,
  type BatchAnalysisResult
} from './message-analyzer.js';

export {
  SmartCompressor,
  getSmartCompressor,
  validateCompressionResult,
  compareCompressionResults,
  type CompressionAction,
  type CompressionMode,
  type CompressionDecision,
  type CompressionStats,
  type CompressedMessage,
  type CompressionResult,
  type CompressionConfig
} from './smart-compressor.js';

export {
  RAGCompressor,
  getRAGCompressor,
  mergeScores,
  calculateSemanticDiversity,
  generateSemanticReport,
  type RAGConfig,
  type SimilarityMatch,
  type RAGEnhancedScore,
  type SemanticCluster
} from './rag-compressor.js';