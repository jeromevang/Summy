/**
 * Pattern Extractor
 * Extracts learnable patterns from corrections and interactions
 */

// ============================================================
// TYPES
// ============================================================

export interface LearnedPattern {
  id: string;
  patternType: 'preference' | 'rule' | 'correction' | 'workflow' | 'anti-pattern';
  trigger: string;
  action: string;
  confidence: number;
  successRate: number;
  occurrenceCount: number;
  lastUsed: string;
  source: 'user_correction' | 'observed_success' | 'explicit_rule' | 'inferred';
  projectPath?: string;
  modelId?: string;
  metadata?: Record<string, any>;
}

export interface Interaction {
  id: string;
  userRequest: string;
  modelResponse: string;
  toolCalls?: ToolCallRecord[];
  userFeedback?: 'positive' | 'negative' | 'correction' | 'none';
  correction?: string;
  timestamp: string;
  modelId: string;
  projectPath?: string;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, any>;
  result?: any;
  success: boolean;
}

export interface ExtractionResult {
  pattern: LearnedPattern | null;
  confidence: number;
  reason: string;
}

// ============================================================
// PATTERN DETECTION RULES
// ============================================================

interface PatternRule {
  id: string;
  regex: RegExp;
  type: LearnedPattern['patternType'];
  extractAction: (match: RegExpMatchArray, context: string) => string;
  baseConfidence: number;
}

const PATTERN_RULES: PatternRule[] = [
  // Preference patterns
  {
    id: 'prefer_over',
    regex: /prefer\s+(\w+)\s+over\s+(\w+)/i,
    type: 'preference',
    extractAction: (match) => `Prefer ${match[1]} over ${match[2]}`,
    baseConfidence: 85
  },
  {
    id: 'use_instead',
    regex: /(?:use|try)\s+(\w+)\s+instead\s+(?:of\s+)?(\w+)?/i,
    type: 'preference',
    extractAction: (match) => match[2] 
      ? `Use ${match[1]} instead of ${match[2]}`
      : `Use ${match[1]}`,
    baseConfidence: 80
  },
  
  // Rule patterns
  {
    id: 'always_use',
    regex: /always\s+(?:use|call|invoke)\s+(\w+)/i,
    type: 'rule',
    extractAction: (match) => `Always use ${match[1]}`,
    baseConfidence: 90
  },
  {
    id: 'never_use',
    regex: /never\s+(?:use|call|invoke)\s+(\w+)/i,
    type: 'rule',
    extractAction: (match) => `Never use ${match[1]}`,
    baseConfidence: 90
  },
  {
    id: 'before_doing',
    regex: /before\s+(\w+ing),?\s+(?:always\s+)?(\w+)/i,
    type: 'rule',
    extractAction: (match) => `Before ${match[1]}, ${match[2]}`,
    baseConfidence: 75
  },
  
  // Correction patterns
  {
    id: 'should_have_used',
    regex: /should\s+(?:have\s+)?use[d]?\s+(\w+)/i,
    type: 'correction',
    extractAction: (match, context) => `For "${context.slice(0, 50)}...": Use ${match[1]}`,
    baseConfidence: 70
  },
  {
    id: 'wrong_tool',
    regex: /(?:wrong|incorrect)\s+tool[,.]?\s+(?:use|try)\s+(\w+)/i,
    type: 'correction',
    extractAction: (match) => `Use ${match[1]} instead`,
    baseConfidence: 75
  },
  
  // Workflow patterns
  {
    id: 'first_then',
    regex: /first\s+(\w+),?\s+then\s+(\w+)/i,
    type: 'workflow',
    extractAction: (match) => `Workflow: ${match[1]} → ${match[2]}`,
    baseConfidence: 70
  },
  {
    id: 'after_step',
    regex: /after\s+(\w+ing),?\s+(?:you\s+should\s+)?(\w+)/i,
    type: 'workflow',
    extractAction: (match) => `After ${match[1]}: ${match[2]}`,
    baseConfidence: 65
  }
];

// ============================================================
// PATTERN EXTRACTOR CLASS
// ============================================================

export class PatternExtractor {
  private patterns: Map<string, LearnedPattern> = new Map();
  
  /**
   * Extract pattern from a user correction
   */
  extractFromCorrection(
    original: string,
    correction: string,
    context: string
  ): ExtractionResult {
    // Try each pattern rule
    for (const rule of PATTERN_RULES) {
      const match = correction.match(rule.regex);
      if (match) {
        const pattern: LearnedPattern = {
          id: `${rule.id}_${Date.now()}`,
          patternType: rule.type,
          trigger: this.extractTrigger(original, context),
          action: rule.extractAction(match, context),
          confidence: rule.baseConfidence,
          successRate: 1.0,
          occurrenceCount: 1,
          lastUsed: new Date().toISOString(),
          source: 'user_correction'
        };
        
        return {
          pattern,
          confidence: rule.baseConfidence,
          reason: `Matched rule: ${rule.id}`
        };
      }
    }
    
    // Try semantic extraction if no rule matched
    return this.semanticExtraction(original, correction, context);
  }
  
  /**
   * Extract pattern from successful interaction
   */
  extractFromSuccess(interaction: Interaction): ExtractionResult {
    if (!interaction.toolCalls || interaction.toolCalls.length === 0) {
      return { pattern: null, confidence: 0, reason: 'No tool calls to learn from' };
    }
    
    // Look for successful tool sequences
    const successfulCalls = interaction.toolCalls.filter(tc => tc.success);
    if (successfulCalls.length >= 2) {
      const workflow = successfulCalls.map(tc => tc.toolName).join(' → ');
      const pattern: LearnedPattern = {
        id: `workflow_${Date.now()}`,
        patternType: 'workflow',
        trigger: this.extractTrigger(interaction.userRequest, ''),
        action: `Tool sequence: ${workflow}`,
        confidence: 60,
        successRate: 1.0,
        occurrenceCount: 1,
        lastUsed: new Date().toISOString(),
        source: 'observed_success',
        modelId: interaction.modelId
      };
      
      return {
        pattern,
        confidence: 60,
        reason: 'Extracted from successful tool sequence'
      };
    }
    
    return { pattern: null, confidence: 0, reason: 'No pattern found in success' };
  }
  
  /**
   * Extract trigger keywords from the original request
   */
  private extractTrigger(original: string, context: string): string {
    // Extract key action words
    const actionWords = original.match(/\b(read|write|edit|create|delete|find|search|list|get|set|update)\b/gi);
    if (actionWords && actionWords.length > 0) {
      return actionWords.join(', ').toLowerCase();
    }
    
    // Fall back to first few words
    return original.split(' ').slice(0, 5).join(' ');
  }
  
  /**
   * Try semantic extraction when no rules match
   */
  private semanticExtraction(
    original: string,
    correction: string,
    context: string
  ): ExtractionResult {
    // Look for negation patterns
    if (correction.toLowerCase().includes("don't") || 
        correction.toLowerCase().includes("do not")) {
      const pattern: LearnedPattern = {
        id: `anti_${Date.now()}`,
        patternType: 'anti-pattern',
        trigger: this.extractTrigger(original, context),
        action: correction.slice(0, 100),
        confidence: 50,
        successRate: 1.0,
        occurrenceCount: 1,
        lastUsed: new Date().toISOString(),
        source: 'user_correction'
      };
      
      return {
        pattern,
        confidence: 50,
        reason: 'Extracted anti-pattern from negation'
      };
    }
    
    return { pattern: null, confidence: 0, reason: 'No pattern found' };
  }
  
  /**
   * Track pattern success/failure
   */
  trackSuccess(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.occurrenceCount++;
      pattern.lastUsed = new Date().toISOString();
      // Increase confidence slightly
      pattern.confidence = Math.min(100, pattern.confidence + 2);
      this.patterns.set(patternId, pattern);
    }
  }
  
  /**
   * Track pattern failure
   */
  trackFailure(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      // Decrease success rate
      pattern.successRate = (pattern.successRate * pattern.occurrenceCount) / 
                            (pattern.occurrenceCount + 1);
      pattern.occurrenceCount++;
      pattern.lastUsed = new Date().toISOString();
      this.patterns.set(patternId, pattern);
    }
  }
  
  /**
   * Decay unused patterns
   */
  decayUnused(maxAgeDays: number = 30): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    
    let removed = 0;
    for (const [id, pattern] of this.patterns) {
      const lastUsed = new Date(pattern.lastUsed);
      if (lastUsed < cutoff && pattern.confidence < 70) {
        this.patterns.delete(id);
        removed++;
      }
    }
    
    return removed;
  }
}

export const patternExtractor = new PatternExtractor();
export default patternExtractor;

