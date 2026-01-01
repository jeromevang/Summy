/**
 * Learning System
 * Extracts patterns from interactions and builds long-term memory
 */

import type { 
  LearnedPattern,
  LongTermMemory
} from '../types.js';

// ============================================================
// TYPES
// ============================================================

export interface Interaction {
  userRequest: string;
  modelResponse: string;
  toolCalls?: any[];
  userFeedback?: 'positive' | 'negative' | 'correction';
  correction?: string;
  timestamp: number;
}

export interface ExtractedPattern {
  patternType: LearnedPattern['patternType'];
  trigger: string;
  action: string;
  confidence: number;
  source: LearnedPattern['source'];
}

// ============================================================
// PATTERN EXTRACTION
// ============================================================

/**
 * Extract a learnable pattern from a correction
 */
export function extractPatternFromCorrection(
  correction: string,
  context: string
): ExtractedPattern | null {
  const correctionLower = correction.toLowerCase();
  
  // Look for explicit preference patterns
  const preferencePatterns = [
    { regex: /prefer\s+(\w+)\s+over\s+(\w+)/i, type: 'preference' },
    { regex: /always\s+use\s+(\w+)/i, type: 'rule' },
    { regex: /never\s+use\s+(\w+)/i, type: 'rule' },
    { regex: /instead\s+of\s+(\w+),?\s+use\s+(\w+)/i, type: 'correction' },
  ];
  
  for (const pattern of preferencePatterns) {
    const match = correction.match(pattern.regex);
    if (match) {
      return {
        patternType: pattern.type as LearnedPattern['patternType'],
        trigger: match[1]!,
        action: match[2] || match[1]!,
        confidence: 80,
        source: 'user_correction'
      };
    }
  }
  
  // Look for tool usage corrections
  if (correctionLower.includes('should have used') || 
      correctionLower.includes('should use')) {
    const toolMatch = correction.match(/should\s+(?:have\s+)?use[d]?\s+(\w+)/i);
    if (toolMatch) {
      return {
        patternType: 'correction',
        trigger: context,
        action: `Use ${toolMatch[1]}`,
        confidence: 70,
        source: 'user_correction'
      };
    }
  }
  
  // Look for format corrections
  if (correctionLower.includes('format') || 
      correctionLower.includes('style')) {
    return {
      patternType: 'preference',
      trigger: 'formatting',
      action: correction,
      confidence: 60,
      source: 'user_correction'
    };
  }
  
  return null;
}

/**
 * Extract pattern from positive feedback
 */
export function extractPatternFromPositive(
  request: string,
  toolCalls: any[]
): ExtractedPattern | null {
  // If user liked a response with specific tool usage, note it
  if (toolCalls && toolCalls.length > 0) {
    const toolNames = toolCalls.map(tc => tc.function?.name).filter(Boolean);
    
    if (toolNames.includes('rag_query')) {
      return {
        patternType: 'behavior',
        trigger: request.substring(0, 50),
        action: 'Use RAG-first approach',
        confidence: 50,
        source: 'observed_behavior'
      };
    }
  }
  
  return null;
}

// ============================================================
// MEMORY MANAGEMENT
// ============================================================

/**
 * Initialize empty long-term memory
 */
export function initializeMemory(): LongTermMemory {
  return {
    global: {
      codingStyle: {
        preferredLanguage: '',
        formatting: '',
        testFramework: ''
      },
      communicationStyle: {
        verbosity: 'normal',
        explanationLevel: 'intermediate',
        codeComments: 'minimal'
      },
      safetyPreferences: {
        confirmDestructive: true,
        autoBackup: false,
        dryRunFirst: false
      }
    },
    project: {},
    session: {
      currentTask: '',
      recentDecisions: [],
      pendingItems: [],
      importantFacts: []
    },
    learned: []
  };
}

/**
 * Add a learned pattern to memory
 */
export function addPatternToMemory(
  memory: LongTermMemory,
  pattern: ExtractedPattern
): LongTermMemory {
  const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const learnedPattern: LearnedPattern = {
    id,
    patternType: pattern.patternType,
    trigger: pattern.trigger,
    action: pattern.action,
    confidence: pattern.confidence,
    successRate: 1.0,
    occurrenceCount: 1,
    uses: 1,
    lastUsed: new Date().toISOString(),
    source: pattern.source
  };
  
  // Check for duplicate/similar patterns
  const existingIndex = memory.learned.findIndex(p => 
    p.trigger === pattern.trigger && p.action === pattern.action
  );
  
  if (existingIndex >= 0) {
    // Update existing pattern
    memory.learned[existingIndex]!.occurrenceCount++;
    memory.learned[existingIndex]!.confidence = Math.min(100, 
      memory.learned[existingIndex]!.confidence + 5
    );
    memory.learned[existingIndex]!.lastUsed = new Date().toISOString();
  } else {
    memory.learned.push(learnedPattern);
  }
  
  return memory;
}

/**
 * Update pattern success rate
 */
export function updatePatternSuccess(
  memory: LongTermMemory,
  patternId: string,
  success: boolean
): LongTermMemory {
  const pattern = memory.learned.find(p => p.id === patternId);
  
  if (pattern) {
    const count = pattern.occurrenceCount;
    const currentSuccessTotal = pattern.successRate * count;
    const newCount = count + 1;
    const newSuccessTotal = currentSuccessTotal + (success ? 1 : 0);
    pattern.successRate = newSuccessTotal / newCount;
    pattern.occurrenceCount = newCount;
    pattern.lastUsed = new Date().toISOString();
    
    // Update confidence based on success rate
    if (pattern.successRate >= 0.9 && newCount >= 3) {
      pattern.confidence = Math.min(100, pattern.confidence + 2);
    } else if (pattern.successRate < 0.5 && newCount >= 3) {
      pattern.confidence = Math.max(0, pattern.confidence - 10);
    }
  }
  
  return memory;
}

/**
 * Decay unused patterns
 */
export function decayUnusedPatterns(
  memory: LongTermMemory,
  daysSinceNow: number = 30
): LongTermMemory {
  const threshold = Date.now() - (daysSinceNow * 24 * 60 * 60 * 1000);
  
  memory.learned = memory.learned.map(pattern => {
    const lastUsedTime = new Date(pattern.lastUsed).getTime();
    
    if (lastUsedTime < threshold) {
      // Decay confidence for unused patterns
      return {
        ...pattern,
        confidence: Math.max(0, pattern.confidence - 10)
      };
    }
    
    return pattern;
  }).filter(p => p.confidence > 0);
  
  return memory;
}

/**
 * Get patterns relevant to a query
 */
export function getRelevantPatterns(
  memory: LongTermMemory,
  query: string,
  minConfidence: number = 50
): LearnedPattern[] {
  const queryWords = query.toLowerCase().split(/\s+/);
  
  return memory.learned
    .filter(p => p.confidence >= minConfidence)
    .filter(p => {
      const triggerWords = p.trigger.toLowerCase().split(/\s+/);
      return queryWords.some(qw => triggerWords.includes(qw));
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Build prompt injection from relevant patterns
 */
export function buildPatternInjection(patterns: LearnedPattern[]): string {
  if (patterns.length === 0) return '';
  
  const lines = ['\n## Learned Preferences (apply these):'];
  
  for (const pattern of patterns.slice(0, 5)) { // Limit to top 5
    lines.push(`- ${pattern.action} (learned from: ${pattern.source})`);
  }
  
  return lines.join('\n');
}

// ============================================================
// PROJECT MEMORY
// ============================================================

/**
 * Add project-specific knowledge
 */
export function addProjectKnowledge(
  memory: LongTermMemory,
  projectPath: string,
  key: string,
  value: string
): LongTermMemory {
  if (!memory.project[projectPath]) {
    memory.project[projectPath] = {
      architecture: '',
      keyFiles: [],
      conventions: [],
      knownIssues: [],
      userNotes: []
    };
  }
  
  const project = memory.project[projectPath];
  
  switch (key) {
    case 'architecture':
      project.architecture = value;
      break;
    case 'keyFile':
      if (!project.keyFiles.includes(value)) {
        project.keyFiles.push(value);
      }
      break;
    case 'convention':
      if (!project.conventions.includes(value)) {
        project.conventions.push(value);
      }
      break;
    case 'issue':
      if (!project.knownIssues.includes(value)) {
        project.knownIssues.push(value);
      }
      break;
    case 'note':
      project.userNotes.push(value);
      break;
  }
  
  return memory;
}

/**
 * Build project context injection
 */
export function buildProjectInjection(
  memory: LongTermMemory,
  projectPath: string
): string {
  const project = memory.project[projectPath];
  if (!project) return '';
  
  const lines = [`\n## Project Knowledge (${projectPath}):`];
  
  if (project.architecture) {
    lines.push(`Architecture: ${project.architecture}`);
  }
  
  if (project.keyFiles.length > 0) {
    lines.push(`Key files: ${project.keyFiles.join(', ')}`);
  }
  
  if (project.conventions.length > 0) {
    lines.push(`Conventions: ${project.conventions.join('; ')}`);
  }
  
  return lines.join('\n');
}

export default {
  extractPatternFromCorrection,
  extractPatternFromPositive,
  initializeMemory,
  addPatternToMemory,
  updatePatternSuccess,
  decayUnusedPatterns,
  getRelevantPatterns,
  buildPatternInjection,
  addProjectKnowledge,
  buildProjectInjection
};

