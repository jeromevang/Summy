/**
 * Query Router Service
 * 
 * Routes queries to the appropriate search strategy based on intent.
 * Implements HyDE, query expansion, and multi-vector search orchestration.
 */

import { RAGConfig, EnrichedChunk, FileSummary } from '../config.js';
import { generateHypotheticalCode, expandQuery } from './summarizer.js';
import { findRelatedFiles, getDependencyChain } from './graph-builder.js';
import { getRAGDatabase, CodeSymbol, FileDependency } from './database.js';

export type SearchStrategy = 'code' | 'summary' | 'file' | 'graph' | 'hybrid';

export interface QueryPlan {
  strategy: SearchStrategy;
  originalQuery: string;
  processedQueries: string[];     // After expansion
  hydeCode: string | null;        // Generated hypothetical code
  searchLayers: ('code' | 'summary' | 'file')[];
  expandContext: boolean;         // Whether to include related files
  limit: number;
}

export interface SearchResult {
  chunks: EnrichedChunk[];
  fileSummaries?: FileSummary[];
  relatedFiles?: string[];
  strategy: SearchStrategy;
  queryPlan: QueryPlan;
  timings: {
    planning: number;
    hyde: number;
    expansion: number;
    search: number;
    total: number;
  };
}

/**
 * Classify query intent and determine search strategy
 */
export function classifyQueryIntent(query: string): SearchStrategy {
  const lower = query.toLowerCase();
  
  // Overview/explanation queries → file summaries
  if (
    lower.includes('how does') ||
    lower.includes('what is') ||
    lower.includes('explain') ||
    lower.includes('overview') ||
    lower.includes('architecture') ||
    lower.includes('describe')
  ) {
    return 'summary';
  }
  
  // Relationship queries → graph traversal
  if (
    lower.includes('what uses') ||
    lower.includes('what calls') ||
    lower.includes('depends on') ||
    lower.includes('imports') ||
    lower.includes('exports') ||
    lower.includes('related to')
  ) {
    return 'graph';
  }
  
  // Implementation queries → code search
  if (
    lower.includes('implement') ||
    lower.includes('code for') ||
    lower.includes('function') ||
    lower.includes('method') ||
    lower.includes('class')
  ) {
    return 'code';
  }
  
  // File-level queries
  if (
    lower.includes('file') ||
    lower.includes('module') ||
    lower.includes('where is')
  ) {
    return 'file';
  }
  
  // Default: hybrid search (both code and summaries)
  return 'hybrid';
}

/**
 * Create a query plan based on configuration and intent
 */
export async function createQueryPlan(
  query: string,
  config: RAGConfig,
  limit: number = 5
): Promise<QueryPlan> {
  const startTime = Date.now();
  
  // Determine strategy
  let strategy: SearchStrategy;
  if (config.queryRouting.enabled) {
    strategy = config.queryRouting.defaultStrategy === 'auto'
      ? classifyQueryIntent(query)
      : config.queryRouting.defaultStrategy as SearchStrategy;
  } else {
    strategy = 'code';  // Default to code search
  }
  
  // Query expansion
  let processedQueries: string[] = [query];
  if (config.queryEnhancement.enableQueryExpansion) {
    processedQueries = await expandQuery(query);
  }
  
  // HyDE: generate hypothetical code
  let hydeCode: string | null = null;
  if (config.queryEnhancement.enableHyde && strategy !== 'graph') {
    hydeCode = await generateHypotheticalCode(query);
  }
  
  // Determine which layers to search
  const searchLayers: ('code' | 'summary' | 'file')[] = [];
  switch (strategy) {
    case 'code':
      searchLayers.push('code');
      break;
    case 'summary':
      searchLayers.push('summary', 'file');
      break;
    case 'file':
      searchLayers.push('file');
      break;
    case 'graph':
      searchLayers.push('code');  // Graph queries still need to find entry points
      break;
    case 'hybrid':
    default:
      if (config.queryEnhancement.enableMultiVector) {
        searchLayers.push('code', 'summary');
      } else {
        searchLayers.push('code');
      }
  }
  
  return {
    strategy,
    originalQuery: query,
    processedQueries,
    hydeCode,
    searchLayers,
    expandContext: strategy === 'graph' || strategy === 'summary',
    limit
  };
}

/**
 * Get context expansion files from dependency graph
 */
export function getContextExpansion(
  initialFiles: string[],
  strategy: SearchStrategy,
  limit: number = 3
): string[] {
  const expanded = new Set<string>();
  
  for (const file of initialFiles) {
    // Get files that import this file (who uses it?)
    const importers = getDependencyChain(file, 'up', 2);
    importers.slice(0, limit).forEach(f => expanded.add(f));
    
    // Get related files
    const related = findRelatedFiles(file, limit);
    related.forEach(f => expanded.add(f));
  }
  
  // Remove initial files from expansion
  initialFiles.forEach(f => expanded.delete(f));
  
  return Array.from(expanded).slice(0, limit * 2);
}

/**
 * Merge and re-rank results from multiple searches
 */
export function mergeAndRankResults(
  codeResults: Array<{ chunk: EnrichedChunk; score: number }>,
  summaryResults: Array<{ chunk: EnrichedChunk; score: number }>,
  weights: { code: number; summary: number } = { code: 0.6, summary: 0.4 }
): Array<{ chunk: EnrichedChunk; score: number }> {
  const scoreMap = new Map<string, { chunk: EnrichedChunk; codeScore: number; summaryScore: number }>();
  
  // Collect code scores
  for (const { chunk, score } of codeResults) {
    scoreMap.set(chunk.id, { chunk, codeScore: score, summaryScore: 0 });
  }
  
  // Collect summary scores
  for (const { chunk, score } of summaryResults) {
    const existing = scoreMap.get(chunk.id);
    if (existing) {
      existing.summaryScore = score;
    } else {
      scoreMap.set(chunk.id, { chunk, codeScore: 0, summaryScore: score });
    }
  }
  
  // Compute final scores and sort
  const results = Array.from(scoreMap.values())
    .map(({ chunk, codeScore, summaryScore }) => ({
      chunk,
      score: codeScore * weights.code + summaryScore * weights.summary
    }))
    .sort((a, b) => b.score - a.score);
  
  return results;
}

/**
 * Format search results for response
 */
export function formatSearchResults(
  chunks: EnrichedChunk[],
  includeCode: boolean = true,
  includeSummary: boolean = true
): Array<{
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  summary?: string;
  score?: number;
}> {
  return chunks.map(chunk => ({
    filePath: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    snippet: includeCode ? chunk.content : (chunk.summary || chunk.content.slice(0, 200)),
    symbolName: chunk.name || null,
    symbolType: chunk.type || null,
    language: chunk.language,
    summary: includeSummary ? chunk.summary : undefined
  }));
}

/**
 * Build query text for embedding (includes HyDE code if available)
 */
export function buildQueryText(plan: QueryPlan): string {
  const parts: string[] = [];
  
  // Add original query
  parts.push(plan.originalQuery);
  
  // Add hypothetical code if available (for HyDE)
  if (plan.hydeCode) {
    parts.push('\n\nExample code:\n' + plan.hydeCode);
  }
  
  // Add expanded terms
  if (plan.processedQueries.length > 1) {
    parts.push('\n\nRelated: ' + plan.processedQueries.slice(1).join(', '));
  }
  
  return parts.join('');
}

// ============================================================
// CODE-AWARE CONTEXT ENRICHMENT
// ============================================================

export interface EnrichedContext {
  /** Related symbols (callers, callees, etc.) */
  relatedSymbols: CodeSymbol[];
  /** Files that depend on found files */
  dependentFiles: string[];
  /** Files that found files depend on */
  dependencyFiles: string[];
  /** Exported interface of found files */
  exports: { file: string; symbols: CodeSymbol[] }[];
  /** Formatted context string for model */
  contextString: string;
}

/**
 * Enrich search results with code-aware context
 * This automatically adds related symbols, dependencies, and interfaces
 */
export function enrichWithCodeContext(
  foundChunks: EnrichedChunk[],
  options: {
    includeCallers?: boolean;
    includeCallees?: boolean;
    includeDependencies?: boolean;
    includeDependents?: boolean;
    includeExports?: boolean;
    maxRelated?: number;
  } = {}
): EnrichedContext {
  const {
    includeCallers = true,
    includeCallees = true,
    includeDependencies = true,
    includeDependents = true,
    includeExports = true,
    maxRelated = 5
  } = options;

  const ragDb = getRAGDatabase();
  const relatedSymbols: CodeSymbol[] = [];
  const dependentFiles = new Set<string>();
  const dependencyFiles = new Set<string>();
  const exports: { file: string; symbols: CodeSymbol[] }[] = [];
  const seenSymbols = new Set<string>();
  const foundFiles = new Set<string>();

  // Collect unique files from chunks
  for (const chunk of foundChunks) {
    foundFiles.add(chunk.filePath);
  }

  // For each found chunk, gather related context
  for (const chunk of foundChunks) {
    // Get symbol for this chunk if it has a name
    if (chunk.name && chunk.type) {
      const symbolId = `${chunk.filePath}:${chunk.name}:${chunk.startLine}`;
      
      if (includeCallers || includeCallees) {
        const callGraph = ragDb.getCallGraph(symbolId);
        
        if (includeCallers) {
          for (const caller of callGraph.callers.slice(0, maxRelated)) {
            if (!seenSymbols.has(caller.id)) {
              seenSymbols.add(caller.id);
              relatedSymbols.push(caller);
            }
          }
        }
        
        if (includeCallees) {
          for (const callee of callGraph.callees.slice(0, maxRelated)) {
            if (!seenSymbols.has(callee.id)) {
              seenSymbols.add(callee.id);
              relatedSymbols.push(callee);
            }
          }
        }
      }
    }
  }

  // Get file-level dependencies
  for (const filePath of foundFiles) {
    if (includeDependencies) {
      const deps = ragDb.getFileDependencies(filePath);
      for (const dep of deps.slice(0, maxRelated)) {
        if (!dep.isExternal && !foundFiles.has(dep.toFile)) {
          dependencyFiles.add(dep.toFile);
        }
      }
    }

    if (includeDependents) {
      const dependents = ragDb.getFileDependents(filePath);
      for (const dep of dependents.slice(0, maxRelated)) {
        if (!foundFiles.has(dep.fromFile)) {
          dependentFiles.add(dep.fromFile);
        }
      }
    }

    if (includeExports) {
      const exportedSymbols = ragDb.getExportedSymbols(filePath);
      if (exportedSymbols.length > 0) {
        exports.push({ file: filePath, symbols: exportedSymbols });
      }
    }
  }

  // Build context string for model
  const contextString = formatCodeContext({
    relatedSymbols: relatedSymbols.slice(0, maxRelated * 2),
    dependentFiles: Array.from(dependentFiles).slice(0, maxRelated),
    dependencyFiles: Array.from(dependencyFiles).slice(0, maxRelated),
    exports
  });

  return {
    relatedSymbols: relatedSymbols.slice(0, maxRelated * 2),
    dependentFiles: Array.from(dependentFiles).slice(0, maxRelated),
    dependencyFiles: Array.from(dependencyFiles).slice(0, maxRelated),
    exports,
    contextString
  };
}

/**
 * Format code context into a string for model consumption
 */
function formatCodeContext(context: {
  relatedSymbols: CodeSymbol[];
  dependentFiles: string[];
  dependencyFiles: string[];
  exports: { file: string; symbols: CodeSymbol[] }[];
}): string {
  const parts: string[] = [];

  // Related symbols
  if (context.relatedSymbols.length > 0) {
    parts.push('## Related Functions/Classes');
    for (const sym of context.relatedSymbols) {
      const sig = sym.signature || `${sym.type} ${sym.name}`;
      parts.push(`- \`${sym.filePath}\`: ${sig}`);
    }
    parts.push('');
  }

  // Dependencies
  if (context.dependencyFiles.length > 0) {
    parts.push('## Imports from');
    for (const file of context.dependencyFiles) {
      parts.push(`- ${file}`);
    }
    parts.push('');
  }

  // Dependents
  if (context.dependentFiles.length > 0) {
    parts.push('## Used by');
    for (const file of context.dependentFiles) {
      parts.push(`- ${file}`);
    }
    parts.push('');
  }

  // Exports
  if (context.exports.length > 0) {
    parts.push('## Exported Interface');
    for (const { file, symbols } of context.exports) {
      parts.push(`### ${file}`);
      for (const sym of symbols.slice(0, 5)) {
        const sig = sym.signature || `${sym.type} ${sym.name}`;
        parts.push(`- ${sig}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Search for symbols by name (for explicit symbol queries)
 */
export function searchSymbols(
  query: string,
  options?: {
    type?: 'function' | 'class' | 'interface' | 'method';
    exported?: boolean;
    limit?: number;
  }
): CodeSymbol[] {
  const ragDb = getRAGDatabase();
  return ragDb.searchSymbols(query, {
    type: options?.type,
    exported: options?.exported,
    limit: options?.limit || 10
  });
}

/**
 * Get the full interface of a file (exports + imports)
 */
export function getFileInterface(filePath: string): {
  exports: CodeSymbol[];
  imports: { from: string; symbols: string[] }[];
  dependents: string[];
} {
  const ragDb = getRAGDatabase();
  const fileInterface = ragDb.getFileInterface(filePath);
  const dependents = ragDb.getFileDependents(filePath).map((d: FileDependency) => d.fromFile);
  
  return {
    ...fileInterface,
    dependents
  };
}

/**
 * Get call graph for a function/method
 */
export function getCallGraph(symbolName: string, filePath?: string): {
  symbol: CodeSymbol | null;
  callers: CodeSymbol[];
  callees: CodeSymbol[];
} {
  const ragDb = getRAGDatabase();
  
  // Find the symbol
  const symbols = ragDb.searchSymbols(symbolName, { limit: 10 });
  let targetSymbol = symbols[0] || null;
  
  // If filePath provided, filter to that file
  if (filePath && symbols.length > 0) {
    const filtered = symbols.find((s: CodeSymbol) => s.filePath === filePath || s.filePath.includes(filePath));
    if (filtered) targetSymbol = filtered;
  }
  
  if (!targetSymbol) {
    return { symbol: null, callers: [], callees: [] };
  }
  
  const { callers, callees } = ragDb.getCallGraph(targetSymbol.id);
  
  return { symbol: targetSymbol, callers, callees };
}

