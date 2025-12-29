/**
 * Failure Log Service
 * JSON-based failure persistence for the self-improving agentic system.
 * 
 * Storage: server/data/failure-log.json
 * 
 * This service persists production failures so the controller can analyze
 * patterns and generate prosthetics to fix them.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export type FailureCategory = 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'unknown' | 'combo_pairing';

export interface FailureEntry {
  id: string;
  timestamp: string;
  modelId: string;
  executorModelId?: string;        // If dual-model mode
  category: FailureCategory;
  tool?: string;                   // Which tool failed
  error: string;                   // Error message
  errorType: string;               // Classified error type
  context: {
    query: string;                 // User's original query
    queryHash: string;             // For grouping similar queries
    expectedBehavior?: string;     // What should have happened
    actualBehavior?: string;       // What actually happened
    toolCallAttempted?: string;    // Raw tool call if any
    conversationLength: number;    // How many turns in
  };
  pattern?: string;                // Detected failure pattern ID
  resolved: boolean;               // Whether this was fixed
  resolvedBy?: string;             // Prosthetic ID that fixed it
  resolvedAt?: string;
}

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  category: FailureCategory;
  count: number;
  firstSeen: string;
  lastSeen: string;
  examples: string[];              // Failure IDs
  suggestedFix?: string;           // Prosthetic suggestion
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface FailureLogData {
  version: number;
  entries: FailureEntry[];
  patterns: Record<string, FailurePattern>;
  stats: {
    totalFailures: number;
    resolvedFailures: number;
    lastUpdated: string;
    failuresByCategory: Record<FailureCategory, number>;
    failuresByModel: Record<string, number>;
  };
}

// ============================================================
// FAILURE LOG CLASS
// ============================================================

class FailureLogService {
  private storagePath: string;
  private data: FailureLogData;

  constructor() {
    this.storagePath = path.join(__dirname, '../../data/failure-log.json');
    this.data = this.load();
  }

  /**
   * Load failure log from disk
   */
  private load(): FailureLogData {
    try {
      if (fs.existsSync(this.storagePath)) {
        return fs.readJsonSync(this.storagePath);
      }
    } catch (error) {
      console.error('[FailureLog] Error loading:', error);
    }

    // Return default empty log
    return {
      version: 1,
      entries: [],
      patterns: {},
      stats: {
        totalFailures: 0,
        resolvedFailures: 0,
        lastUpdated: new Date().toISOString(),
        failuresByCategory: {
          tool: 0,
          rag: 0,
          reasoning: 0,
          intent: 0,
          browser: 0,
          unknown: 0,
          combo_pairing: 0
        },
        failuresByModel: {}
      }
    };
  }

  /**
   * Save failure log to disk
   */
  private save(): void {
    try {
      fs.ensureDirSync(path.dirname(this.storagePath));
      this.data.stats.lastUpdated = new Date().toISOString();
      fs.writeJsonSync(this.storagePath, this.data, { spaces: 2 });
    } catch (error) {
      console.error('[FailureLog] Error saving:', error);
    }
  }

  /**
   * Generate a hash for grouping similar queries
   */
  private hashQuery(query: string): string {
    // Normalize: lowercase, remove extra whitespace, remove specific file paths/numbers
    const normalized = query
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[0-9]+/g, 'N')
      .replace(/["'].*?["']/g, '"..."')
      .trim();
    
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
  }

  /**
   * Classify the error type from error message
   */
  private classifyError(error: string): string {
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('timeout')) return 'timeout';
    if (errorLower.includes('tool') && errorLower.includes('not')) return 'tool_not_called';
    if (errorLower.includes('wrong tool')) return 'wrong_tool';
    if (errorLower.includes('hallucin')) return 'hallucination';
    if (errorLower.includes('parse') || errorLower.includes('json')) return 'parse_error';
    if (errorLower.includes('rag') && errorLower.includes('not')) return 'rag_not_used';
    if (errorLower.includes('param') || errorLower.includes('argument')) return 'bad_params';
    if (errorLower.includes('format')) return 'format_error';
    if (errorLower.includes('intent')) return 'intent_misread';
    
    // Combo-specific error classification
    if (errorLower.includes('main') && errorLower.includes('timeout')) return 'main_timeout';
    if (errorLower.includes('coordination') || errorLower.includes('communication')) return 'poor_coordination';
    if (errorLower.includes('score') && errorLower.includes('low')) return 'score_too_low';
    if (errorLower.includes('combo') && errorLower.includes('excluded')) return 'combo_excluded';
    if (errorLower.includes('qualifying') || errorLower.includes('gate')) return 'qualifying_gate_failure';
    if (errorLower.includes('format') && errorLower.includes('compatibility')) return 'format_compatibility';
    
    return 'unknown';
  }

  /**
   * Detect which failure pattern this matches
   */
  private detectPattern(entry: FailureEntry): string | undefined {
    const errorType = entry.errorType;
    const category = entry.category;

    // Common patterns
    if (category === 'rag' && errorType === 'rag_not_used') {
      return 'RAG_NOT_USED_BEFORE_READ';
    }
    if (category === 'tool' && errorType === 'tool_not_called') {
      return 'TOOL_SUPPRESSION';
    }
    if (category === 'tool' && errorType === 'wrong_tool') {
      return 'WRONG_TOOL_SELECTION';
    }
    if (category === 'tool' && errorType === 'bad_params') {
      return 'PARAM_EXTRACTION_FAILURE';
    }
    if (category === 'intent' && errorType === 'intent_misread') {
      return 'INTENT_MISUNDERSTANDING';
    }
    if (category === 'reasoning') {
      return 'REASONING_FAILURE';
    }
    if (category === 'combo_pairing') {
      // Combo-specific patterns
      if (errorType === 'main_timeout') {
        return 'COMBO_MAIN_TIMEOUT';
      }
      if (errorType === 'poor_coordination') {
        return 'COMBO_COORDINATION_FAILURE';
      }
      if (errorType === 'score_too_low') {
        return 'COMBO_PERFORMANCE_TOO_LOW';
      }
      if (errorType === 'combo_excluded') {
        return 'COMBO_EXCLUDED';
      }
      if (errorType === 'qualifying_gate_failure') {
        return 'COMBO_QUALIFYING_GATE_FAILURE';
      }
      if (errorType === 'format_compatibility') {
        return 'COMBO_FORMAT_COMPATIBILITY';
      }
      return 'COMBO_PAIRING_FAILURE';
    }
    if (errorType === 'hallucination') {
      return 'TOOL_HALLUCINATION';
    }

    return undefined;
  }

  /**
   * Log a new failure
   */
  logFailure(params: {
    modelId: string;
    executorModelId?: string;
    category: FailureCategory;
    tool?: string;
    error: string;
    query: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    toolCallAttempted?: string;
    conversationLength?: number;
  }): FailureEntry {
    const id = `fail_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const errorType = this.classifyError(params.error);
    
    const entry: FailureEntry = {
      id,
      timestamp: new Date().toISOString(),
      modelId: params.modelId,
      executorModelId: params.executorModelId,
      category: params.category,
      tool: params.tool,
      error: params.error,
      errorType,
      context: {
        query: params.query,
        queryHash: this.hashQuery(params.query),
        expectedBehavior: params.expectedBehavior,
        actualBehavior: params.actualBehavior,
        toolCallAttempted: params.toolCallAttempted,
        conversationLength: params.conversationLength || 1
      },
      resolved: false
    };

    // Detect pattern
    entry.pattern = this.detectPattern(entry);

    // Update pattern if detected
    if (entry.pattern) {
      this.updatePattern(entry);
    }

    // Add to entries
    this.data.entries.push(entry);

    // Update stats
    this.data.stats.totalFailures++;
    this.data.stats.failuresByCategory[params.category]++;
    this.data.stats.failuresByModel[params.modelId] = 
      (this.data.stats.failuresByModel[params.modelId] || 0) + 1;

    this.save();
    console.log(`[FailureLog] Logged failure ${id} for ${params.modelId}: ${errorType}`);

    return entry;
  }

  /**
   * Update or create a failure pattern
   */
  private updatePattern(entry: FailureEntry): void {
    const patternId = entry.pattern!;
    
    if (!this.data.patterns[patternId]) {
      // Create new pattern
      this.data.patterns[patternId] = {
        id: patternId,
        name: this.patternIdToName(patternId),
        description: this.patternIdToDescription(patternId),
        category: entry.category,
        count: 0,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
        examples: [],
        severity: this.patternIdToSeverity(patternId)
      };
    }

    const pattern = this.data.patterns[patternId];
    pattern.count++;
    pattern.lastSeen = entry.timestamp;
    if (pattern.examples.length < 10) {
      pattern.examples.push(entry.id);
    }
  }

  private patternIdToName(id: string): string {
    const names: Record<string, string> = {
      'RAG_NOT_USED_BEFORE_READ': 'RAG Not Used Before File Read',
      'TOOL_SUPPRESSION': 'Tool Not Called When Needed',
      'WRONG_TOOL_SELECTION': 'Wrong Tool Selected',
      'PARAM_EXTRACTION_FAILURE': 'Parameter Extraction Failed',
      'INTENT_MISUNDERSTANDING': 'Intent Misunderstood',
      'REASONING_FAILURE': 'Reasoning Failure',
      'TOOL_HALLUCINATION': 'Tool Hallucination'
    };
    return names[id] || id;
  }

  private patternIdToDescription(id: string): string {
    const descriptions: Record<string, string> = {
      'RAG_NOT_USED_BEFORE_READ': 'Model reads files without first using RAG to understand the codebase',
      'TOOL_SUPPRESSION': 'Model should call a tool but responds with text instead',
      'WRONG_TOOL_SELECTION': 'Model selects incorrect tool for the task',
      'PARAM_EXTRACTION_FAILURE': 'Model fails to extract correct parameters for tool calls',
      'INTENT_MISUNDERSTANDING': 'Model misinterprets what the user is asking for',
      'REASONING_FAILURE': 'Model fails at multi-step reasoning or planning',
      'TOOL_HALLUCINATION': 'Model calls non-existent tools'
    };
    return descriptions[id] || 'Unknown failure pattern';
  }

  private patternIdToSeverity(id: string): 'low' | 'medium' | 'high' | 'critical' {
    const severities: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'RAG_NOT_USED_BEFORE_READ': 'medium',
      'TOOL_SUPPRESSION': 'high',
      'WRONG_TOOL_SELECTION': 'medium',
      'PARAM_EXTRACTION_FAILURE': 'medium',
      'INTENT_MISUNDERSTANDING': 'medium',
      'REASONING_FAILURE': 'high',
      'TOOL_HALLUCINATION': 'critical'
    };
    return severities[id] || 'medium';
  }

  /**
   * Get all failures
   */
  getFailures(options?: {
    modelId?: string;
    category?: FailureCategory;
    pattern?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
    since?: string;
  }): FailureEntry[] {
    let entries = [...this.data.entries];

    if (options?.modelId) {
      entries = entries.filter(e => e.modelId === options.modelId);
    }
    if (options?.category) {
      entries = entries.filter(e => e.category === options.category);
    }
    if (options?.pattern) {
      entries = entries.filter(e => e.pattern === options.pattern);
    }
    if (options?.resolved !== undefined) {
      entries = entries.filter(e => e.resolved === options.resolved);
    }
    if (options?.since) {
      const sinceTime = options.since;
      entries = entries.filter(e => e.timestamp >= sinceTime);
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (options?.offset) {
      entries = entries.slice(options.offset);
    }
    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get failures grouped by pattern
   */
  getFailuresByPattern(): Record<string, FailureEntry[]> {
    const grouped: Record<string, FailureEntry[]> = {};
    
    for (const entry of this.data.entries) {
      if (entry.pattern) {
        if (!grouped[entry.pattern]) {
          grouped[entry.pattern] = [];
        }
        grouped[entry.pattern].push(entry);
      }
    }

    return grouped;
  }

  /**
   * Get all patterns
   */
  getPatterns(): FailurePattern[] {
    return Object.values(this.data.patterns)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId: string): FailurePattern | null {
    return this.data.patterns[patternId] || null;
  }

  /**
   * Get patterns above threshold (for controller alerts)
   */
  getPatternsAboveThreshold(threshold: number = 5): FailurePattern[] {
    return Object.values(this.data.patterns)
      .filter(p => p.count >= threshold)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Mark failures as resolved by a prosthetic
   */
  markResolved(failureIds: string[], prostheticId: string): number {
    let resolved = 0;

    for (const id of failureIds) {
      const entry = this.data.entries.find(e => e.id === id);
      if (entry && !entry.resolved) {
        entry.resolved = true;
        entry.resolvedBy = prostheticId;
        entry.resolvedAt = new Date().toISOString();
        resolved++;
        this.data.stats.resolvedFailures++;
      }
    }

    if (resolved > 0) {
      this.save();
      console.log(`[FailureLog] Marked ${resolved} failures as resolved by ${prostheticId}`);
    }

    return resolved;
  }

  /**
   * Get failure statistics
   */
  getStats(): FailureLogData['stats'] & {
    unresolvedCount: number;
    patternCount: number;
    criticalPatterns: number;
  } {
    const criticalPatterns = Object.values(this.data.patterns)
      .filter(p => p.severity === 'critical' && p.count >= 3).length;

    return {
      ...this.data.stats,
      unresolvedCount: this.data.stats.totalFailures - this.data.stats.resolvedFailures,
      patternCount: Object.keys(this.data.patterns).length,
      criticalPatterns
    };
  }

  /**
   * Clear old failures (older than N days)
   */
  clearOld(daysOld: number = 30): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const cutoffStr = cutoff.toISOString();

    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => 
      e.timestamp >= cutoffStr || !e.resolved
    );
    const removed = before - this.data.entries.length;

    if (removed > 0) {
      // Recalculate stats
      this.recalculateStats();
      this.save();
      console.log(`[FailureLog] Cleared ${removed} old failures`);
    }

    return removed;
  }

  /**
   * Clear all failures for a model
   */
  clearForModel(modelId: string): number {
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => e.modelId !== modelId);
    const removed = before - this.data.entries.length;

    if (removed > 0) {
      this.recalculateStats();
      this.save();
      console.log(`[FailureLog] Cleared ${removed} failures for ${modelId}`);
    }

    return removed;
  }

  /**
   * Recalculate stats from entries
   */
  private recalculateStats(): void {
    this.data.stats = {
      totalFailures: this.data.entries.length,
      resolvedFailures: this.data.entries.filter(e => e.resolved).length,
      lastUpdated: new Date().toISOString(),
      failuresByCategory: {
        tool: 0,
        rag: 0,
        reasoning: 0,
        intent: 0,
        browser: 0,
        unknown: 0,
        combo_pairing: 0
      },
      failuresByModel: {}
    };

    for (const entry of this.data.entries) {
      this.data.stats.failuresByCategory[entry.category]++;
      this.data.stats.failuresByModel[entry.modelId] = 
        (this.data.stats.failuresByModel[entry.modelId] || 0) + 1;
    }
  }

  /**
   * Export data (for backup)
   */
  export(): FailureLogData {
    return { ...this.data };
  }

  /**
   * Import data (from backup)
   */
  import(data: FailureLogData): void {
    this.data = data;
    this.save();
  }

  /**
   * Get a summary for the controller to analyze
   */
  getAnalysisSummary(): {
    unresolvedPatterns: FailurePattern[];
    recentFailures: FailureEntry[];
    modelSummary: Array<{ modelId: string; failureCount: number; topPatterns: string[] }>;
  } {
    const unresolvedPatterns = this.getPatternsAboveThreshold(3);
    const recentFailures = this.getFailures({ resolved: false, limit: 20 });

    // Build model summary
    const modelFailures = new Map<string, { count: number; patterns: Map<string, number> }>();
    
    for (const entry of this.data.entries.filter(e => !e.resolved)) {
      if (!modelFailures.has(entry.modelId)) {
        modelFailures.set(entry.modelId, { count: 0, patterns: new Map() });
      }
      const mf = modelFailures.get(entry.modelId)!;
      mf.count++;
      if (entry.pattern) {
        mf.patterns.set(entry.pattern, (mf.patterns.get(entry.pattern) || 0) + 1);
      }
    }

    const modelSummary = Array.from(modelFailures.entries())
      .map(([modelId, data]) => ({
        modelId,
        failureCount: data.count,
        topPatterns: Array.from(data.patterns.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([pattern]) => pattern)
      }))
      .sort((a, b) => b.failureCount - a.failureCount);

    return {
      unresolvedPatterns,
      recentFailures,
      modelSummary
    };
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const failureLog = new FailureLogService();

export default failureLog;

