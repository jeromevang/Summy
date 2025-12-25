/**
 * Agentic Readiness Test Suite
 *
 * A configurable set of tests for assessing agentic coding capabilities.
 * Tests are loaded from JSON configuration to allow easy modification.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProbeEvaluation } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration file path
const SUITE_CONFIG_PATH = path.join(__dirname, '../../../../data/agentic-readiness-suite.json');

// ============================================================
// TYPES
// ============================================================

export interface AgenticReadinessTest {
  id: string;
  name: string;
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser';
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedToolAny?: string[];
  expectedNoTool?: boolean;
  evaluate: (response: any, toolCalls: any[]) => ProbeEvaluation;
}

interface TestSuiteConfig {
  version: string;
  description: string;
  threshold: number;
  categoryWeights: {
    tool: number;
    rag: number;
    reasoning: number;
    intent: number;
    browser: number;
  };
  tests: Array<{
    id: string;
    name: string;
    category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser';
    description: string;
    prompt: string;
    expectedTool?: string;
    expectedToolAny?: string[];
    expectedNoTool?: boolean;
    evaluationLogic: string; // JavaScript code as string
  }>;
}

export interface ReadinessResult {
  modelId: string;
  assessedAt: string;
  overallScore: number;
  passed: boolean;
  categoryScores: {
    tool: number;
    rag: number;
    reasoning: number;
    intent: number;
    browser: number;
  };
  testResults: Array<{
    testId: string;
    testName: string;
    category: string;
    passed: boolean;
    score: number;
    details: string;
    latency: number;
  }>;
  failedTests: string[];
  duration: number;
  trainabilityScores?: {
    systemPromptCompliance: number;
    instructionPersistence: number;
    correctionAcceptance: number;
    overallTrainability: number;
  };
}

export interface BatchReadinessResult {
  startedAt: string;
  completedAt: string;
  results: ReadinessResult[];
  leaderboard: Array<{
    rank: number;
    modelId: string;
    score: number;
    certified: boolean;
  }>;
  bestModel: string | null;
}

// ============================================================
// CONFIGURATION LOADING
// ============================================================

let cachedSuite: AgenticReadinessTest[] | null = null;
let cachedConfig: TestSuiteConfig | null = null;

function loadTestSuite(): { suite: AgenticReadinessTest[], config: TestSuiteConfig } {
  if (cachedSuite && cachedConfig) {
    return { suite: cachedSuite, config: cachedConfig };
  }

  try {
    const config: TestSuiteConfig = fs.readJsonSync(SUITE_CONFIG_PATH);
    cachedConfig = config;

    const suite: AgenticReadinessTest[] = config.tests.map(test => ({
      id: test.id,
      name: test.name,
      category: test.category,
      description: test.description,
      prompt: test.prompt,
      expectedTool: test.expectedTool,
      expectedToolAny: test.expectedToolAny,
      expectedNoTool: test.expectedNoTool,
      evaluate: createEvaluationFunction(test.evaluationLogic, test.id)
    }));

    cachedSuite = suite;
    return { suite, config };
  } catch (error) {
    console.error('[AgenticReadinessSuite] Failed to load test suite:', error);
    // Fallback to empty suite
    return {
      suite: [],
      config: {
        version: "1.0.0",
        description: "Empty fallback suite",
        threshold: 70,
        categoryWeights: { tool: 0.3, rag: 0.25, reasoning: 0.2, intent: 0.15, browser: 0.1 },
        tests: []
      }
    };
  }
}

// Map of evaluation function names to actual functions
const evaluationFunctions: Record<string, (response: any, toolCalls: any[]) => ProbeEvaluation> = {
  'evaluateBasicToolEmit': evaluateBasicToolEmit,
  'evaluateMultiToolSelection': evaluateMultiToolSelection,
  'evaluateToolSuppression': evaluateToolSuppression,
  'evaluateArgumentValidation': evaluateArgumentValidation,
  'evaluateNearIdenticalToolChoice': evaluateNearIdenticalToolChoice,
  'evaluateRAGFirstBehavior': evaluateRAGFirstBehavior,
  'evaluateRAGBeforeFileRead': evaluateRAGBeforeFileRead,
  'evaluateRAGResultSynthesis': evaluateRAGResultSynthesis,
  'evaluateRAGChaining': evaluateRAGChaining,
  'evaluateMultiStepPlanning': evaluateMultiStepPlanning,
  'evaluateConditionalLogic': evaluateConditionalLogic,
  'evaluateContextContinuity': evaluateContextContinuity,
  'evaluateEdgeCaseAwareness': evaluateEdgeCaseAwareness,
  'evaluateQuestionVsAction': evaluateQuestionVsAction,
  'evaluateImplicitFileRead': evaluateImplicitFileRead,
  'evaluateSearchIntentDetection': evaluateSearchIntentDetection,
  'evaluateWebSearch': evaluateWebSearch,
  'evaluatePageNavigation': evaluatePageNavigation,
  'evaluateContentExtraction': evaluateContentExtraction,
  'evaluateBrowserInteraction': evaluateBrowserInteraction,
};

function createEvaluationFunction(logic: string, testId: string): (response: any, toolCalls: any[]) => ProbeEvaluation {
  // Extract function name from the logic string (format: "return evaluateFunctionName(response, toolCalls);")
  const match = logic.match(/return\s+(\w+)\s*\(/);
  const functionName = match ? match[1] : null;

  if (functionName && evaluationFunctions[functionName]) {
    return evaluationFunctions[functionName];
  }

  // Fallback for unknown functions
  console.warn(`[AgenticReadinessSuite] Unknown evaluation function: ${functionName} for test ${testId}`);
  return (response: any, toolCalls: any[]) => ({
    passed: false,
    score: 0,
    details: `Test ${testId}: Evaluation function not found`
  });
}

// ============================================================
// EVALUATION FUNCTIONS
// ============================================================

function hasToolCall(toolCalls: any[], toolName: string): boolean {
  if (!toolCalls || !Array.isArray(toolCalls)) return false;
  return toolCalls.some(tc => {
    const name = tc.function?.name || tc.name || tc.tool;
    return name === toolName;
  });
}

function hasAnyToolCall(toolCalls: any[], toolNames: string[]): boolean {
  if (!toolCalls || !Array.isArray(toolCalls)) return false;
  return toolCalls.some(tc => {
    const name = tc.function?.name || tc.name || tc.tool;
    return toolNames.includes(name);
  });
}

function getToolCallArg(toolCalls: any[], toolName: string, argName: string): any {
  if (!toolCalls || !Array.isArray(toolCalls)) return undefined;
  const tc = toolCalls.find((t: any) => {
    const name: string = t.function?.name || t.name || t.tool;
    return name === toolName;
  });
  if (!tc) return undefined;
  const args = tc.function?.arguments || tc.arguments || tc.args || {};
  const parsed = typeof args === 'string' ? JSON.parse(args) : args;
  return parsed[argName];
}

function responseContains(response: any, keywords: string[]): boolean {
  const text = typeof response === 'string' ? response : JSON.stringify(response);
  return keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
}

// Individual evaluation functions
function evaluateBasicToolEmit(response: any, toolCalls: any[]): ProbeEvaluation {
  const called = hasToolCall(toolCalls, 'read_file');
  const hasPath = called && getToolCallArg(toolCalls, 'read_file', 'path')?.includes('index.ts');

  if (called && hasPath) {
    return { passed: true, score: 1.0, details: 'Correctly called read_file with correct path' };
  } else if (called) {
    return { passed: true, score: 0.7, details: 'Called read_file but path might be imprecise' };
  }
  return { passed: false, score: 0, details: 'Did not call read_file tool' };
}

function evaluateMultiToolSelection(response: any, toolCalls: any[]): ProbeEvaluation {
  const calledSearch = hasToolCall(toolCalls, 'search_files');
  const calledGrep = hasAnyToolCall(toolCalls, ['grep', 'codebase_search', 'search']);

  if (calledSearch) {
    const pattern = getToolCallArg(toolCalls, 'search_files', 'pattern') ||
                   getToolCallArg(toolCalls, 'search_files', 'query');
    if (pattern?.toLowerCase().includes('authentication')) {
      return { passed: true, score: 1.0, details: 'Used search_files with correct query' };
    }
    return { passed: true, score: 0.8, details: 'Used search_files' };
  } else if (calledGrep) {
    return { passed: true, score: 0.6, details: 'Used alternative search tool' };
  }
  return { passed: false, score: 0, details: 'Did not use a search tool' };
}

function evaluateToolSuppression(response: any, toolCalls: any[]): ProbeEvaluation {
  const hasTools = toolCalls && toolCalls.length > 0;

  if (!hasTools) {
    const hasExplanation = responseContains(response, ['typescript', 'javascript', 'type', 'language']);
    if (hasExplanation) {
      return { passed: true, score: 1.0, details: 'Answered without unnecessary tool calls' };
    }
    return { passed: true, score: 0.8, details: 'No tool calls, but answer may be incomplete' };
  }
  return { passed: false, score: 0, details: 'Unnecessarily called tools for a simple question' };
}

function evaluateArgumentValidation(response: any, toolCalls: any[]): ProbeEvaluation {
  const called = hasToolCall(toolCalls, 'write_file');
  if (!called) {
    return { passed: false, score: 0, details: 'Did not call write_file' };
  }

  const path = getToolCallArg(toolCalls, 'write_file', 'path') ||
               getToolCallArg(toolCalls, 'write_file', 'file_path');
  const content = getToolCallArg(toolCalls, 'write_file', 'content') ||
                  getToolCallArg(toolCalls, 'write_file', 'contents');

  const pathCorrect = path?.includes('output') && path?.includes('hello.txt');
  const contentCorrect = content?.toLowerCase().includes('hello world');

  if (pathCorrect && contentCorrect) {
    return { passed: true, score: 1.0, details: 'Correct path and content arguments' };
  } else if (called) {
    return { passed: true, score: 0.5, details: 'Called write_file but arguments incomplete' };
  }
  return { passed: false, score: 0, details: 'Missing required arguments' };
}

function evaluateNearIdenticalToolChoice(response: any, toolCalls: any[]): ProbeEvaluation {
  const calledSingle = hasToolCall(toolCalls, 'read_file');
  const calledMultiple = hasToolCall(toolCalls, 'read_multiple_files');

  if (calledSingle && !calledMultiple) {
    return { passed: true, score: 1.0, details: 'Correctly chose read_file for single file' };
  } else if (calledMultiple) {
    return { passed: true, score: 0.5, details: 'Used read_multiple_files for single file (inefficient)' };
  }
  return { passed: false, score: 0, details: 'Did not attempt to read the file' };
}

function evaluateRAGFirstBehavior(response: any, toolCalls: any[]): ProbeEvaluation {
  if (!toolCalls || toolCalls.length === 0) {
    return { passed: false, score: 0, details: 'No tool calls - should use RAG for code understanding' };
  }

  const firstTool = toolCalls[0]?.function?.name || toolCalls[0]?.name;
  const usedRag = hasToolCall(toolCalls, 'rag_query');

  if (firstTool === 'rag_query') {
    return { passed: true, score: 1.0, details: 'Correctly used rag_query FIRST' };
  } else if (usedRag) {
    return { passed: true, score: 0.6, details: 'Used rag_query but not as first tool' };
  }
  return { passed: false, score: 0, details: 'Did not use rag_query for code understanding' };
}

function evaluateRAGBeforeFileRead(response: any, toolCalls: any[]): ProbeEvaluation {
  if (!toolCalls || toolCalls.length === 0) {
    return { passed: false, score: 0, details: 'No tool calls made' };
  }

  const ragIndex = toolCalls.findIndex(tc =>
    (tc.function?.name || tc.name) === 'rag_query'
  );
  const readIndex = toolCalls.findIndex(tc =>
    ['read_file', 'read_multiple_files'].includes(tc.function?.name || tc.name)
  );

  if (ragIndex >= 0 && (readIndex < 0 || ragIndex < readIndex)) {
    return { passed: true, score: 1.0, details: 'Used RAG before reading files' };
  } else if (ragIndex >= 0) {
    return { passed: true, score: 0.5, details: 'Used RAG but after file reads' };
  }
  return { passed: false, score: 0, details: 'Read files without RAG context' };
}

function evaluateRAGResultSynthesis(response: any, toolCalls: any[]): ProbeEvaluation {
  const usedRag = hasToolCall(toolCalls, 'rag_query');
  const hasStructuredAnswer = responseContains(response,
    ['component', 'module', 'service', 'main']
  );

  if (usedRag && hasStructuredAnswer) {
    return { passed: true, score: 1.0, details: 'Used RAG and synthesized coherent answer' };
  } else if (usedRag) {
    return { passed: true, score: 0.7, details: 'Used RAG but synthesis unclear' };
  }
  return { passed: false, score: 0, details: 'Did not use RAG for exploration' };
}

function evaluateRAGChaining(response: any, toolCalls: any[]): ProbeEvaluation {
  const usedRag = hasToolCall(toolCalls, 'rag_query');
  const usedRead = hasAnyToolCall(toolCalls, ['read_file', 'read_multiple_files']);

  if (usedRag && usedRead) {
    return { passed: true, score: 1.0, details: 'Correctly chained RAG query with file read' };
  } else if (usedRag || usedRead) {
    return { passed: true, score: 0.5, details: 'Partial approach - used one but not both' };
  }
  return { passed: false, score: 0, details: 'Did not use appropriate tools' };
}

function evaluateMultiStepPlanning(response: any, toolCalls: any[]): ProbeEvaluation {
  // Should have multiple tool calls in logical order
  if (!toolCalls || toolCalls.length < 2) {
    return { passed: false, score: 0, details: 'Should use multiple tools for multi-step task' };
  }

  const hasSearch = hasAnyToolCall(toolCalls, ['rag_query', 'search_files', 'codebase_search']);
  const hasRead = hasAnyToolCall(toolCalls, ['read_file', 'read_multiple_files']);

  if (hasSearch && hasRead && toolCalls.length >= 2) {
    return { passed: true, score: 1.0, details: 'Demonstrated multi-step planning' };
  } else if (toolCalls.length >= 2) {
    return { passed: true, score: 0.6, details: 'Multiple steps but not optimal order' };
  }
  return { passed: false, score: 0.3, details: 'Limited planning shown' };
}

function evaluateConditionalLogic(response: any, toolCalls: any[]): ProbeEvaluation {
  // Should first check for TypeScript (look for tsconfig.json or .ts files)
  const checksProject = hasAnyToolCall(toolCalls, ['read_file', 'list_directory', 'search_files']);
  const mentionsCondition = responseContains(response,
    ['typescript', 'tsconfig', 'if', 'check', 'first']
  );

  if (checksProject && mentionsCondition) {
    return { passed: true, score: 1.0, details: 'Correctly handled conditional logic' };
  } else if (checksProject) {
    return { passed: true, score: 0.6, details: 'Checked project but condition handling unclear' };
  }
  return { passed: false, score: 0, details: 'Did not check conditions before acting' };
}

function evaluateContextContinuity(response: any, toolCalls: any[]): ProbeEvaluation {
  const gatheredInfo = toolCalls && toolCalls.length > 0;
  const providesSpecificSuggestion = responseContains(response,
    ['try', 'catch', 'error', 'exception', 'handle', 'file', 'function', 'method']
  );

  if (gatheredInfo && providesSpecificSuggestion) {
    return { passed: true, score: 1.0, details: 'Used context to provide specific suggestions' };
  } else if (gatheredInfo) {
    return { passed: true, score: 0.5, details: 'Gathered context but suggestions generic' };
  }
  return { passed: false, score: 0, details: 'Did not gather context for reasoning' };
}

function evaluateEdgeCaseAwareness(response: any, toolCalls: any[]): ProbeEvaluation {
  const investigated = toolCalls && toolCalls.length > 0;
  const mentionsEdgeCases = responseContains(response,
    ['null', 'undefined', 'empty', 'boundary', 'edge', 'invalid', 'missing', 'special']
  );

  if (investigated && mentionsEdgeCases) {
    return { passed: true, score: 1.0, details: 'Investigated code and identified edge cases' };
  } else if (investigated) {
    return { passed: true, score: 0.5, details: 'Investigated but edge case analysis limited' };
  }
  return { passed: false, score: 0, details: 'Did not investigate for edge cases' };
}

function evaluateQuestionVsAction(response: any, toolCalls: any[]): ProbeEvaluation {
  const hasTools = toolCalls && toolCalls.length > 0;
  const hasExplanation = responseContains(response,
    ['dependency', 'injection', 'decouple', 'test', 'modular', 'pattern']
  );

  if (!hasTools && hasExplanation) {
    return { passed: true, score: 1.0, details: 'Correctly answered without tools' };
  } else if (!hasTools) {
    return { passed: true, score: 0.7, details: 'No tools but explanation incomplete' };
  }
  return { passed: false, score: 0, details: 'Called tools for knowledge question' };
}

function evaluateImplicitFileRead(response: any, toolCalls: any[]): ProbeEvaluation {
  const readsFile = hasAnyToolCall(toolCalls, ['read_file', 'read_multiple_files']);
  const targetsReadme = toolCalls?.some(tc => {
    const args = tc.function?.arguments || tc.arguments || '{}';
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return JSON.stringify(parsed).toLowerCase().includes('readme');
  });

  if (readsFile && targetsReadme) {
    return { passed: true, score: 1.0, details: 'Correctly read README file' };
  } else if (readsFile) {
    return { passed: true, score: 0.6, details: 'Read a file but not specifically README' };
  }
  return { passed: false, score: 0, details: 'Did not attempt to read the file first' };
}

function evaluateSearchIntentDetection(response: any, toolCalls: any[]): ProbeEvaluation {
  const usesSearch = hasAnyToolCall(toolCalls, ['search_files', 'grep', 'codebase_search', 'search']);

  if (usesSearch) {
    const hasTodoQuery = toolCalls?.some(tc => {
      const args = tc.function?.arguments || tc.arguments || '{}';
      return args.toLowerCase().includes('todo');
    });
    if (hasTodoQuery) {
      return { passed: true, score: 1.0, details: 'Correctly searched for TODO comments' };
    }
    return { passed: true, score: 0.7, details: 'Used search but query may be imprecise' };
  }
  return { passed: false, score: 0, details: 'Did not use search tools' };
}

function evaluateWebSearch(response: any, toolCalls: any[]): ProbeEvaluation {
  const usesWebSearch = hasToolCall(toolCalls, 'web_search');
  const usesBrowser = hasAnyToolCall(toolCalls, ['browser_navigate', 'browser_fetch_content']);

  if (usesWebSearch) {
    return { passed: true, score: 1.0, details: 'Correctly used web_search for current info' };
  } else if (usesBrowser) {
    return { passed: true, score: 0.7, details: 'Used browser instead of web_search' };
  }
  return { passed: false, score: 0, details: 'Did not search web for current information' };
}

function evaluatePageNavigation(response: any, toolCalls: any[]): ProbeEvaluation {
  const navigates = hasAnyToolCall(toolCalls, ['browser_navigate', 'browser_fetch_content', 'url_fetch_content']);

  if (navigates) {
    const hasPythonUrl = toolCalls?.some(tc => {
      const args = tc.function?.arguments || tc.arguments || '{}';
      return args.includes('python.org') || args.includes('docs.python');
    });
    if (hasPythonUrl) {
      return { passed: true, score: 1.0, details: 'Correctly navigated to Python docs' };
    }
    return { passed: true, score: 0.6, details: 'Navigated but URL unclear' };
  }
  return { passed: false, score: 0, details: 'Did not navigate to URL' };
}

function evaluateContentExtraction(response: any, toolCalls: any[]): ProbeEvaluation {
  const fetchesContent = hasAnyToolCall(toolCalls,
    ['browser_fetch_content', 'browser_navigate', 'url_fetch_content', 'browser_snapshot']
  );

  if (fetchesContent) {
    return { passed: true, score: 1.0, details: 'Fetched web content for extraction' };
  } else if (hasToolCall(toolCalls, 'web_search')) {
    return { passed: true, score: 0.5, details: 'Used web_search instead of direct fetch' };
  }
  return { passed: false, score: 0, details: 'Did not fetch web content' };
}

function evaluateBrowserInteraction(response: any, toolCalls: any[]): ProbeEvaluation {
  const navigates = hasToolCall(toolCalls, 'browser_navigate');
  const clicks = hasToolCall(toolCalls, 'browser_click');

  if (navigates && clicks) {
    return { passed: true, score: 1.0, details: 'Correctly navigated and clicked' };
  } else if (navigates) {
    return { passed: true, score: 0.6, details: 'Navigated but did not click' };
  } else if (clicks) {
    return { passed: true, score: 0.4, details: 'Clicked without explicit navigation' };
  }
  return { passed: false, score: 0, details: 'Did not perform browser interaction' };
}


// ============================================================
// SCORING FUNCTIONS
// ============================================================

export function calculateCategoryScore(
  results: Array<{ category: string; score: number }>,
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser'
): number {
  const categoryResults = results.filter(r => r.category === category);
  if (categoryResults.length === 0) return 0;
  
  const totalScore = categoryResults.reduce((sum, r) => sum + r.score, 0);
  return Math.round((totalScore / categoryResults.length) * 100);
}

export function calculateOverallScore(categoryScores: {
  tool: number;
  rag: number;
  reasoning: number;
  intent: number;
  browser: number;
}): number {
  const config = getReadinessConfig();
  const weights = config.categoryWeights;

  const weightedScore =
    categoryScores.tool * weights.tool +
    categoryScores.rag * weights.rag +
    categoryScores.reasoning * weights.reasoning +
    categoryScores.intent * weights.intent +
    categoryScores.browser * weights.browser;

  return Math.round(weightedScore);
}

export function isPassing(overallScore: number): boolean {
  const config = getReadinessConfig();
  return overallScore >= config.threshold;
}

// ============================================================
// CONFIGURABLE EXPORTS (NO HARDCODING)
// ============================================================

/**
 * Get the current agentic readiness test suite from JSON config
 */
export function getAgenticReadinessSuite(): AgenticReadinessTest[] {
  const { suite } = loadTestSuite();
  return suite;
}

/**
 * Get the configuration for the agentic readiness suite
 */
export function getReadinessConfig(): TestSuiteConfig {
  const { config } = loadTestSuite();
  return config;
}

/**
 * Reload the test suite from disk (useful for development)
 */
export function reloadTestSuite(): void {
  cachedSuite = null;
  cachedConfig = null;
  console.log('[AgenticReadinessSuite] Reloaded test suite from disk');
}

/**
 * Export the current suite for backward compatibility
 * This will load from JSON config instead of hardcoded array
 */
export const AGENTIC_READINESS_SUITE = getAgenticReadinessSuite();

