/**
 * Failure Detector
 * Classifies failure modes and generates failure profiles
 */

import { TestResult, TestRunResult } from './test-types.js';

// ============================================================
// TYPES
// ============================================================

export type FailureType =
  | 'silent'           // Model fails without indicating failure
  | 'partial'          // Model partially completes task
  | 'protocol_drift'   // Model drifts from expected format
  | 'recovery_failure' // Model fails to recover from error
  | 'hallucination'    // Model makes up information
  | 'over_tooling'     // Model uses too many tools
  | 'under_tooling'    // Model should use tools but doesn't
  | 'wrong_tool'       // Model uses incorrect tool
  | 'none';            // No failure

export type HallucinationType =
  | 'tool'       // Made up tool name
  | 'code'       // Made up code/syntax
  | 'intent'     // Misunderstood intent
  | 'fact'       // Made up facts
  | 'none';

export interface FailureProfile {
  failureType: FailureType;
  hallucinationType: HallucinationType;
  confidenceWhenWrong: number;  // 0-1: How confident model was when wrong
  recoverable: boolean;
  recoveryStepsNeeded: number;
  failureConditions: string[];
  patterns: FailurePattern[];
}

export interface FailurePattern {
  id: string;
  description: string;
  frequency: number;  // How often this pattern occurs
  severity: 'low' | 'medium' | 'high' | 'critical';
  examples: string[];
}

export interface AntiPattern {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: boolean;
  occurrences: number;
  examples: string[];
}

// ============================================================
// ANTI-PATTERN DEFINITIONS
// ============================================================

export const ANTI_PATTERNS: Record<string, Omit<AntiPattern, 'detected' | 'occurrences' | 'examples'>> = {
  over_tooling: {
    id: 'over_tooling',
    name: 'Over-Tooling',
    description: 'Using 5+ tools when 1-2 would suffice',
    severity: 'medium'
  },
  read_without_search: {
    id: 'read_without_search',
    name: 'Read Without Search',
    description: 'Reading files without first searching for them',
    severity: 'low'
  },
  repeated_failure: {
    id: 'repeated_failure',
    name: 'Repeated Failure',
    description: 'Repeating the same failed action without adjusting',
    severity: 'high'
  },
  tool_hallucination: {
    id: 'tool_hallucination',
    name: 'Tool Hallucination',
    description: 'Calling non-existent tools',
    severity: 'critical'
  },
  ignoring_context: {
    id: 'ignoring_context',
    name: 'Ignoring Context',
    description: 'Ignoring provided context and asking for it again',
    severity: 'medium'
  },
  format_drift: {
    id: 'format_drift',
    name: 'Format Drift',
    description: 'Gradually drifting from expected tool call format',
    severity: 'high'
  },
  premature_conclusion: {
    id: 'premature_conclusion',
    name: 'Premature Conclusion',
    description: 'Concluding task is complete when it is not',
    severity: 'medium'
  },
  over_explanation: {
    id: 'over_explanation',
    name: 'Over-Explanation',
    description: 'Excessive explanation when action is needed',
    severity: 'low'
  }
};

// ============================================================
// FAILURE DETECTION
// ============================================================

/**
 * Classify the type of failure from a test result
 */
export function classifyFailure(result: TestResult): FailureType {
  if (result.passed) return 'none';

  // Check for hallucination
  if (result.calledTool && !isKnownTool(result.calledTool)) {
    return 'hallucination';
  }

  // Check for wrong tool
  if (result.calledTool && result.calledTool !== result.tool) {
    return 'wrong_tool';
  }

  // Check for silent failure (no tool called when expected)
  if (!result.calledTool && result.tool !== 'none') {
    return 'under_tooling';
  }

  // Check for partial completion
  const passedChecks = result.checks.filter(c => c.passed).length;
  const totalChecks = result.checks.length;
  if (passedChecks > 0 && passedChecks < totalChecks) {
    return 'partial';
  }

  // Default to protocol drift if we can't classify
  return 'protocol_drift';
}

/**
 * Check if a tool name is known (not hallucinated)
 */
function isKnownTool(toolName: string): boolean {
  const knownTools = [
    'read_file', 'write_file', 'edit_file', 'delete_file',
    'list_directory', 'search_files', 'create_directory',
    'get_file_info', 'copy_file', 'move_file',
    'git_status', 'git_diff', 'git_log', 'git_commit', 'git_add',
    'rag_query', 'rag_status', 'rag_index',
    'shell_exec', 'run_python', 'run_node',
    'memory_store', 'memory_retrieve', 'memory_list',
    'http_request', 'web_search',
    'browser_navigate', 'browser_click', 'browser_type',
    'none' // Special case for no tool
  ];

  return knownTools.includes(toolName.toLowerCase());
}

/**
 * Detect hallucination type from a test result
 */
export function detectHallucination(result: TestResult): HallucinationType {
  if (result.passed) return 'none';

  // Tool hallucination
  if (result.calledTool && !isKnownTool(result.calledTool)) {
    return 'tool';
  }

  // Intent hallucination (misunderstood what was asked)
  if (result.calledTool && result.tool === 'none') {
    return 'intent';
  }

  // Could add more sophisticated detection here
  return 'none';
}

// ============================================================
// ANTI-PATTERN DETECTION
// ============================================================

/**
 * Detect anti-patterns in test results
 */
export function detectAntiPatterns(results: TestResult[]): AntiPattern[] {
  const detected: AntiPattern[] = [];

  // Over-tooling detection
  // This would need conversation history to detect properly
  // Currently, overToolingCount is not used and filter always returns false.
  // This section is commented out for now as it's not fully implemented.
  // const overToolingCount = results.filter(r => {
  //   return false; // Placeholder
  // }).length;

  // Tool hallucination detection
  const hallucinatedTools = results.filter(r =>
    r.calledTool && !isKnownTool(r.calledTool)
  );
  if (hallucinatedTools.length > 0) {
    const pattern = ANTI_PATTERNS.tool_hallucination;
    if (pattern) {
      detected.push({
        ...pattern,
        id: pattern.id,
        name: pattern.name || 'Tool Hallucination',
        description: pattern.description || 'Calling non-existent tools',
        severity: pattern.severity || 'critical',
        detected: true,
        occurrences: hallucinatedTools.length,
        examples: hallucinatedTools.map(r => r.calledTool || 'unknown')
      } as AntiPattern);
    }
  }

  // Repeated failure detection
  const failedTests = results.filter(r => !r.passed);
  const toolFailures = new Map<string, number>();
  failedTests.forEach(r => {
    const key = r.tool;
    toolFailures.set(key, (toolFailures.get(key) || 0) + 1);
  });

  const repeatedFailures = Array.from(toolFailures.entries())
    .filter(([_, count]) => count >= 3);
  if (repeatedFailures.length > 0) {
    const pattern = ANTI_PATTERNS.repeated_failure;
    if (pattern) {
      detected.push({
        ...pattern,
        id: pattern.id,
        name: pattern.name || 'Repeated Failure',
        description: pattern.description || 'Repeating the same failed action',
        severity: pattern.severity || 'high',
        detected: true,
        occurrences: repeatedFailures.length,
        examples: repeatedFailures.map(([tool, count]) => `${tool}: ${count} failures`)
      } as AntiPattern);
    }
  }

  return detected;
}

// ============================================================
// FAILURE PROFILE GENERATION
// ============================================================

/**
 * Generate a comprehensive failure profile from test results
 */
export function generateFailureProfile(runResult: TestRunResult): FailureProfile {
  const failedResults = runResult.results.filter(r => !r.passed);

  if (failedResults.length === 0) {
    return {
      failureType: 'none',
      hallucinationType: 'none',
      confidenceWhenWrong: 0,
      recoverable: true,
      recoveryStepsNeeded: 0,
      failureConditions: [],
      patterns: []
    };
  }

  // Classify failures
  const failureTypes = failedResults.map(classifyFailure);
  const hallucinationTypes = failedResults.map(detectHallucination);

  // Find most common failure type
  const failureTypeCounts = failureTypes.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<FailureType, number>);

  const primaryFailureType = Object.entries(failureTypeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as FailureType || 'none';

  // Find most common hallucination type
  const hallucinationTypeCounts = hallucinationTypes.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<HallucinationType, number>);

  const primaryHallucinationType = Object.entries(hallucinationTypeCounts)
    .filter(([type]) => type !== 'none')
    .sort((a, b) => b[1] - a[1])[0]?.[0] as HallucinationType || 'none';

  // Generate patterns
  const patterns: FailurePattern[] = [];

  // Pattern: Wrong tool selection
  const wrongToolCount = failureTypes.filter(t => t === 'wrong_tool').length;
  if (wrongToolCount > 0) {
    patterns.push({
      id: 'wrong_tool_selection',
      description: 'Model selects incorrect tool for the task',
      frequency: wrongToolCount / failedResults.length,
      severity: wrongToolCount > 3 ? 'high' : 'medium',
      examples: failedResults
        .filter((_, i) => failureTypes[i] === 'wrong_tool')
        .slice(0, 3)
        .map(r => `Expected ${r.tool}, called ${r.calledTool}`)
    });
  }

  // Pattern: Silent failure
  const silentCount = failureTypes.filter(t => t === 'under_tooling').length;
  if (silentCount > 0) {
    patterns.push({
      id: 'silent_failure',
      description: 'Model fails to call tools when needed',
      frequency: silentCount / failedResults.length,
      severity: silentCount > 3 ? 'high' : 'medium',
      examples: failedResults
        .filter((_, i) => failureTypes[i] === 'under_tooling')
        .slice(0, 3)
        .map(r => `Expected ${r.tool}, no tool called`)
    });
  }

  // Identify failure conditions
  const failureConditions: string[] = [];
  if (wrongToolCount > silentCount) {
    failureConditions.push('Tends to choose wrong tools rather than skip tool calls');
  } else if (silentCount > wrongToolCount) {
    failureConditions.push('Tends to skip tool calls when uncertain');
  }

  const hardTests = failedResults.filter(r =>
    runResult.results.find(orig => orig.testId === r.testId)
  );
  if (hardTests.length > failedResults.length * 0.5) {
    failureConditions.push('Struggles with complex multi-step tasks');
  }

  return {
    failureType: primaryFailureType,
    hallucinationType: primaryHallucinationType,
    confidenceWhenWrong: 0.7, // Would need actual confidence scores
    recoverable: primaryFailureType !== 'hallucination',
    recoveryStepsNeeded: primaryFailureType === 'partial' ? 1 : 2,
    failureConditions,
    patterns
  };
}

export default {
  classifyFailure,
  detectHallucination,
  detectAntiPatterns,
  generateFailureProfile,
  ANTI_PATTERNS
};

