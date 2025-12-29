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
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'multi_turn' | 'boundary' | 'fault_injection';
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedToolAny?: string[];
  expectedNoTool?: boolean;
  isMultiTurn?: boolean;
  turns?: Array<{ role: string; content: string }>;
  chainLength?: number;
  faultType?: 'file_not_found' | 'permission_denied' | 'no_results' | 'timeout' | 'malformed';
  evaluate: (response: any, toolCalls: any[], conversationHistory?: any[]) => ProbeEvaluation;
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
    multi_turn: number;
    boundary: number;
    fault_injection: number;
  };
  tests: Array<{
    id: string;
    name: string;
    category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'multi_turn' | 'boundary' | 'fault_injection';
    description: string;
    prompt: string;
    expectedTool?: string;
    expectedToolAny?: string[];
    expectedNoTool?: boolean;
    isMultiTurn?: boolean;
    turns?: Array<{ role: string; content: string }>;
    chainLength?: number;
    faultType?: string;
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
    multi_turn: number;
    boundary: number;
    fault_injection: number;
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
        categoryWeights: { tool: 0.3, rag: 0.25, reasoning: 0.2, intent: 0.15, browser: 0.1, multi_turn: 0.0, boundary: 0.0, fault_injection: 0.0 },
        tests: []
      }
    };
  }
}

// Map of evaluation function names to actual functions
const evaluationFunctions: Record<string, (response: any, toolCalls: any[], conversationHistory?: any[]) => ProbeEvaluation> = {
  // Qualifying Gate (MUST PASS)
  'evaluateToolFormatValid': evaluateToolFormatValid,
  'evaluateInstructionFollowing': evaluateInstructionFollowing,
  'evaluateContextCoherence': evaluateContextCoherence,
  'evaluateBasicReasoning': evaluateBasicReasoning,
  'evaluateStateTransition': evaluateStateTransition,
  // Capability Discovery
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
  // Error Recovery
  'evaluateFileNotFoundRecovery': evaluateFileNotFoundRecovery,
  'evaluateToolFailureRecovery': evaluateToolFailureRecovery,
  'evaluateGracefulDegradation': evaluateGracefulDegradation,
  // Multi-Turn Conversation
  'evaluateContextRetention': evaluateContextRetention,
  'evaluateReferenceResolution': evaluateReferenceResolution,
  'evaluateToolResultMemory': evaluateToolResultMemory,
  // Behavioral Boundary
  'evaluateToolChain': evaluateToolChain,
  'evaluateDecisionNesting': evaluateDecisionNesting,
  // Fault Injection
  'evaluateFaultRecovery': evaluateFaultRecovery,
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

// ============================================================
// QUALIFYING GATE EVALUATION FUNCTIONS (MUST ALL PASS)
// ============================================================

/**
 * QG-1: Model MUST output valid tool call format
 * Checks: JSON structure with function name and arguments
 */
function evaluateToolFormatValid(response: any, toolCalls: any[]): ProbeEvaluation {
  // Must have at least one tool call
  if (!toolCalls || toolCalls.length === 0) {
    return { passed: false, score: 0, details: 'DISQUALIFIED: No tool call emitted when required' };
  }

  const tc = toolCalls[0];
  
  // Check for valid structure
  const hasName = !!(tc.function?.name || tc.name);
  const hasArgs = !!(tc.function?.arguments || tc.arguments);
  
  // Try to parse arguments as JSON
  let argsValid = false;
  try {
    const argsStr = tc.function?.arguments || tc.arguments;
    if (typeof argsStr === 'string') {
      JSON.parse(argsStr);
      argsValid = true;
    } else if (typeof argsStr === 'object') {
      argsValid = true;
    }
  } catch (e) {
    argsValid = false;
  }

  if (hasName && hasArgs && argsValid) {
    const name = tc.function?.name || tc.name;
    if (name === 'read_file') {
      return { passed: true, score: 1.0, details: 'Valid tool call format with correct tool' };
    }
    return { passed: true, score: 0.8, details: 'Valid tool call format but unexpected tool' };
  }
  
  return { passed: false, score: 0, details: 'DISQUALIFIED: Invalid tool call format (malformed JSON or missing fields)' };
}

/**
 * QG-2: Model MUST follow system prompt and use provided tools
 */
function evaluateInstructionFollowing(response: any, toolCalls: any[]): ProbeEvaluation {
  const called = hasToolCall(toolCalls, 'list_directory');
  
  if (called) {
    const path = getToolCallArg(toolCalls, 'list_directory', 'path') ||
                 getToolCallArg(toolCalls, 'list_directory', 'directory');
    if (path?.includes('node-api/src') || path?.includes('node-api\\src')) {
      return { passed: true, score: 1.0, details: 'Correctly followed instruction to list directory' };
    }
    return { passed: true, score: 0.7, details: 'Used list_directory but path may be imprecise' };
  }
  
  // Check if it used an alternative like search_files
  if (hasAnyToolCall(toolCalls, ['search_files', 'read_file'])) {
    return { passed: false, score: 0.3, details: 'DISQUALIFIED: Did not follow instruction to use list_directory' };
  }
  
  return { passed: false, score: 0, details: 'DISQUALIFIED: Did not follow system prompt instructions' };
}

/**
 * QG-3: Model MUST NOT hallucinate files or context
 */
function evaluateContextCoherence(response: any, toolCalls: any[]): ProbeEvaluation {
  // Must use a tool to verify, not just answer from "memory"
  if (!toolCalls || toolCalls.length === 0) {
    // Check if response claims to know files without checking
    const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
    const hallucinations = ['node_modules', 'dist/', '.git/', 'build/'];
    const hasHallucination = hallucinations.some(h => text.toLowerCase().includes(h));
    
    if (hasHallucination) {
      return { passed: false, score: 0, details: 'DISQUALIFIED: Hallucinated file structure without verification' };
    }
    return { passed: false, score: 0.2, details: 'DISQUALIFIED: Should verify with tools, not answer from memory' };
  }

  // Good: Used a tool to verify
  const usedVerification = hasAnyToolCall(toolCalls, ['list_directory', 'rag_query', 'search_files']);
  if (usedVerification) {
    return { passed: true, score: 1.0, details: 'Correctly verified context before answering' };
  }
  
  return { passed: true, score: 0.7, details: 'Used tools but not ideal verification approach' };
}

/**
 * QG-4: Model MUST break down multi-step tasks
 */
function evaluateBasicReasoning(response: any, toolCalls: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Should mention logical steps or use exploration tools
  const hasStepReasoning = text.match(/step|first|then|next|finally|1\.|2\.|3\./i);
  const usedExploration = hasAnyToolCall(toolCalls, ['rag_query', 'list_directory', 'search_files']);
  
  if (usedExploration && hasStepReasoning) {
    return { passed: true, score: 1.0, details: 'Demonstrated step-by-step reasoning with exploration' };
  } else if (usedExploration) {
    return { passed: true, score: 0.8, details: 'Used exploration tools to understand task' };
  } else if (hasStepReasoning) {
    return { passed: true, score: 0.6, details: 'Showed reasoning but should explore codebase first' };
  }
  
  return { passed: false, score: 0, details: 'DISQUALIFIED: No evidence of multi-step reasoning' };
}

/**
 * QG-5: Model MUST use tool results correctly (not ignore or contradict)
 */
function evaluateStateTransition(response: any, toolCalls: any[]): ProbeEvaluation {
  // Must call read_file
  if (!hasToolCall(toolCalls, 'read_file')) {
    return { passed: false, score: 0, details: 'DISQUALIFIED: Did not read the file as instructed' };
  }
  
  const path = getToolCallArg(toolCalls, 'read_file', 'path') ||
               getToolCallArg(toolCalls, 'read_file', 'file_path');
  
  if (!path?.includes('package.json')) {
    return { passed: false, score: 0.3, details: 'DISQUALIFIED: Read wrong file' };
  }
  
  // The real test is whether the model uses the result
  // Since we can't see the follow-up in this evaluation, we pass if tool was called correctly
  // The full state transition test happens in the agentic loop
  return { passed: true, score: 1.0, details: 'Correctly read file to extract information' };
}

// ============================================================
// CAPABILITY DISCOVERY EVALUATION FUNCTIONS
// ============================================================

// Individual evaluation functions
function evaluateBasicToolEmit(response: any, toolCalls: any[]): ProbeEvaluation {
  const called = hasToolCall(toolCalls, 'read_file');
  const path = called ? (getToolCallArg(toolCalls, 'read_file', 'path') || 
                         getToolCallArg(toolCalls, 'read_file', 'file_path') || '') : '';
  const hasPath = path.includes('App.tsx') || path.includes('index.ts');

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

  const pathCorrect = (path?.includes('shared-utils') || path?.includes('output')) && path?.includes('hello.txt');
  const contentCorrect = content?.toLowerCase().includes('hello world');

  if (pathCorrect && contentCorrect) {
    return { passed: true, score: 1.0, details: 'Correct path and content arguments' };
  } else if (called && contentCorrect) {
    return { passed: true, score: 0.7, details: 'Correct content, path may be imprecise' };
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
// ERROR RECOVERY EVALUATION FUNCTIONS
// ============================================================

/**
 * ER-1: Model should handle file not found gracefully
 */
function evaluateFileNotFoundRecovery(response: any, toolCalls: any[]): ProbeEvaluation {
  const attemptedRead = hasToolCall(toolCalls, 'read_file');
  const usedSearch = hasAnyToolCall(toolCalls, ['search_files', 'list_directory', 'rag_query']);
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Good: Tried to read, then searched when not found
  if (attemptedRead && usedSearch) {
    return { passed: true, score: 1.0, details: 'Attempted read, then searched for alternatives' };
  }
  
  // Partial: Just searched without trying read first
  if (usedSearch && !attemptedRead) {
    return { passed: true, score: 0.7, details: 'Searched but did not attempt read first' };
  }
  
  // Check if response acknowledges the file doesn't exist
  const acknowledgesError = text.match(/not found|doesn't exist|cannot find|no such file/i);
  if (acknowledgesError) {
    return { passed: true, score: 0.5, details: 'Acknowledged error but no recovery attempt' };
  }
  
  return { passed: false, score: 0, details: 'Did not handle file not found scenario' };
}

/**
 * ER-2: Model should handle tool failures gracefully
 */
function evaluateToolFailureRecovery(response: any, toolCalls: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Good: Explains what went wrong and suggests alternatives
  const explainsIssue = text.match(/fail|error|not available|cannot|alternative|instead/i);
  const suggestsAlternative = text.match(/alternative|instead|you could|try|another way|workaround/i);
  
  if (explainsIssue && suggestsAlternative) {
    return { passed: true, score: 1.0, details: 'Explained failure and suggested alternatives' };
  } else if (explainsIssue) {
    return { passed: true, score: 0.6, details: 'Explained failure but no alternatives' };
  } else if (suggestsAlternative) {
    return { passed: true, score: 0.5, details: 'Suggested alternatives without explaining failure' };
  }
  
  // Check if any tool was called at all (attempted something)
  if (toolCalls && toolCalls.length > 0) {
    return { passed: true, score: 0.3, details: 'Attempted tool calls but unclear recovery' };
  }
  
  return { passed: false, score: 0, details: 'No recovery behavior demonstrated' };
}

/**
 * ER-3: Model should provide partial results gracefully
 */
function evaluateGracefulDegradation(response: any, toolCalls: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Good: Acknowledges scale issue and samples/limits
  const acknowledgesScale = text.match(/too many|sample|subset|representative|limit|first \d+|top \d+/i);
  const usedExploration = hasAnyToolCall(toolCalls, ['list_directory', 'search_files', 'rag_query']);
  
  if (acknowledgesScale && usedExploration) {
    return { passed: true, score: 1.0, details: 'Acknowledged scale and sampled intelligently' };
  } else if (usedExploration) {
    return { passed: true, score: 0.7, details: 'Explored codebase but may not handle scale' };
  } else if (acknowledgesScale) {
    return { passed: true, score: 0.5, details: 'Acknowledged scale without exploration' };
  }
  
  return { passed: false, score: 0, details: 'No graceful degradation demonstrated' };
}

// ============================================================
// MULTI-TURN CONVERSATION EVALUATION FUNCTIONS
// ============================================================

/**
 * MT-1: Model remembers context from previous turns
 */
function evaluateContextRetention(response: any, toolCalls: any[], conversationHistory?: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Check if model references port from file content (not hallucinated)
  const mentionsPort = text.match(/port|3000|8080|1234|listen/i);
  const usedReadFile = hasToolCall(toolCalls, 'read_file');
  
  // If model remembers context, it shouldn't need to re-read the file
  // But it should reference information from previous turn
  if (mentionsPort && !usedReadFile) {
    // Model remembered context from previous turn
    return { passed: true, score: 1.0, details: 'Remembered port from previous file read' };
  } else if (mentionsPort && usedReadFile) {
    // Model re-read file which is acceptable but not ideal for context retention test
    return { passed: true, score: 0.7, details: 'Re-read file to answer (memory not retained)' };
  }
  
  return { passed: false, score: 0, details: 'Did not demonstrate context retention across turns' };
}

/**
 * MT-2: Model resolves references like "that file" from previous turn
 */
function evaluateReferenceResolution(response: any, toolCalls: any[], conversationHistory?: any[]): ProbeEvaluation {
  const usedReadFile = hasToolCall(toolCalls, 'read_file');
  const usedSearch = hasAnyToolCall(toolCalls, ['rag_query', 'search_files']);
  
  // For "read that file", model should resolve reference and actually read something
  if (usedReadFile) {
    const path = getToolCallArg(toolCalls, 'read_file', 'path') ||
                 getToolCallArg(toolCalls, 'read_file', 'file_path') || '';
    
    // Check if the path relates to auth (referenced from previous turn)
    const pathRelatestoAuth = path.match(/auth|middleware|login|session/i);
    if (pathRelatestoAuth) {
      return { passed: true, score: 1.0, details: 'Correctly resolved "that file" to auth file' };
    }
    return { passed: true, score: 0.7, details: 'Attempted to read file but may not be correct reference' };
  } else if (usedSearch) {
    return { passed: true, score: 0.5, details: 'Searched instead of using previous context' };
  }
  
  return { passed: false, score: 0, details: 'Did not resolve reference from previous turn' };
}

/**
 * MT-3: Model remembers tool results and uses them
 */
function evaluateToolResultMemory(response: any, toolCalls: any[], conversationHistory?: any[]): ProbeEvaluation {
  const usedReadFile = hasToolCall(toolCalls, 'read_file');
  const usedListDir = hasToolCall(toolCalls, 'list_directory');
  
  if (usedReadFile && !usedListDir) {
    // Model remembered list results and tried to read first file
    const path = getToolCallArg(toolCalls, 'read_file', 'path') ||
                 getToolCallArg(toolCalls, 'read_file', 'file_path') || '';
    
    // Check if path is in node-api/src
    if (path.includes('node-api/src') || path.includes('node-api\\src')) {
      return { passed: true, score: 1.0, details: 'Correctly read first file from remembered list' };
    }
    return { passed: true, score: 0.7, details: 'Read a file but may not be from previous list' };
  } else if (usedListDir && usedReadFile) {
    return { passed: true, score: 0.5, details: 'Re-listed directory instead of using memory' };
  } else if (usedListDir) {
    return { passed: true, score: 0.3, details: 'Only listed directory, did not read file' };
  }
  
  return { passed: false, score: 0, details: 'Did not demonstrate tool result memory' };
}

// ============================================================
// BEHAVIORAL BOUNDARY EVALUATION FUNCTIONS
// ============================================================

/**
 * BB-1/BB-2: Model can handle N-tool chains
 */
function evaluateToolChain(response: any, toolCalls: any[], conversationHistory?: any[]): ProbeEvaluation {
  const chainLength = 2; // Default expected chain length
  const actualLength = toolCalls?.length || 0;
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Check if model actually used multiple tools in sequence
  if (actualLength >= chainLength) {
    // Check for coherent explanation
    const hasExplanation = text.length > 50;
    if (hasExplanation) {
      return { passed: true, score: 1.0, details: `Successfully executed ${actualLength}-tool chain with coherent response` };
    }
    return { passed: true, score: 0.8, details: `Executed ${actualLength}-tool chain but response unclear` };
  } else if (actualLength > 0) {
    const score = actualLength / chainLength;
    return { passed: score >= 0.5, score, details: `Executed ${actualLength}/${chainLength} tools in chain` };
  }
  
  return { passed: false, score: 0, details: `Expected ${chainLength}-tool chain, got ${actualLength}` };
}

/**
 * BB-3: Model handles nested conditional logic
 */
function evaluateDecisionNesting(response: any, toolCalls: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  
  // Should check tsconfig, then branch based on result
  const readTsconfig = toolCalls?.some(tc => {
    const args = tc.function?.arguments || tc.arguments || '{}';
    return JSON.stringify(args).toLowerCase().includes('tsconfig');
  });
  
  const usedSearch = hasAnyToolCall(toolCalls, ['search_files', 'grep', 'codebase_search']);
  const usedListDir = hasToolCall(toolCalls, 'list_directory');
  
  // Check for branching behavior
  const mentionsCondition = text.match(/if|strict|mode|enabled|because|therefore/i);
  const mentionsResult = text.match(/strict mode|any type|typescript files|found|count/i);
  
  if (readTsconfig && (usedSearch || usedListDir) && mentionsCondition && mentionsResult) {
    return { passed: true, score: 1.0, details: 'Correctly handled nested conditional logic' };
  } else if (readTsconfig && (usedSearch || usedListDir)) {
    return { passed: true, score: 0.7, details: 'Made conditional decision but response incomplete' };
  } else if (readTsconfig) {
    return { passed: true, score: 0.5, details: 'Checked config but did not follow through with branches' };
  }
  
  return { passed: false, score: 0.2, details: 'Did not demonstrate nested decision handling' };
}

/**
 * FI-1 to FI-3: Model handles errors and edge cases gracefully
 */
function evaluateFaultRecovery(response: any, toolCalls: any[], conversationHistory?: any[]): ProbeEvaluation {
  const text = typeof response === 'string' ? response : response?.choices?.[0]?.message?.content || '';
  const textLower = text.toLowerCase();
  
  // Common patterns for graceful error handling
  const acknowledgesError = textLower.match(/error|not found|doesn't exist|does not exist|cannot|unable|failed|permission denied|no access/);
  const explainsGracefully = textLower.match(/unfortunately|appears|seems|could not|couldn't find|i apologize|sorry|however/);
  const suggestsAlternative = textLower.match(/alternative|instead|try|suggest|perhaps|maybe|check|verify|consider/);
  const noHallucination = !textLower.match(/here is the content|the file contains|i found the following|the function does/);
  
  // Generic fault recovery evaluation (works for any fault type)
  if (acknowledgesError && noHallucination) {
    if (suggestsAlternative) {
      return { passed: true, score: 1.0, details: 'Correctly handled error and suggested alternatives' };
    }
    return { passed: true, score: 0.8, details: 'Correctly acknowledged error' };
  }
  if (!noHallucination) {
    return { passed: false, score: 0, details: 'Hallucinated response to error condition' };
  }
  return { passed: false, score: 0.2, details: 'Did not properly acknowledge error' };
}

// Legacy switch statement (commented out)
  /*
  switch (faultType) {
    case 'file_not_found':
      // Model should acknowledge file doesn't exist, not hallucinate content
      if (acknowledgesError && noHallucination) {
        if (suggestsAlternative) {
          return { passed: true, score: 1.0, details: 'Correctly reported file not found and suggested alternatives' };
        }
        return { passed: true, score: 0.8, details: 'Correctly reported file not found' };
      }
      if (!noHallucination) {
        return { passed: false, score: 0, details: 'Hallucinated content for non-existent file' };
      }
      break;
      
    case 'permission_denied':
      // Model should acknowledge permission issue
      if (acknowledgesError && textLower.match(/permission|access|denied|cannot write|not allowed|security/)) {
        if (suggestsAlternative || textLower.match(/why|because|reason/)) {
          return { passed: true, score: 1.0, details: 'Correctly explained permission denial and why' };
        }
        return { passed: true, score: 0.7, details: 'Acknowledged permission issue' };
      }
      break;
      
    case 'no_results':
      // Model should acknowledge no results found, not make up results
      if ((acknowledgesError || textLower.match(/no results|nothing found|not found|couldn't find|could not find/)) && noHallucination) {
        if (suggestsAlternative) {
          return { passed: true, score: 1.0, details: 'Correctly reported no results and suggested alternatives' };
        }
        return { passed: true, score: 0.8, details: 'Correctly reported no results' };
      }
      if (!noHallucination) {
        return { passed: false, score: 0, details: 'Hallucinated results that do not exist' };
      }
      break;
      
    default:
      // General error handling
      if (explainsGracefully || acknowledgesError) {
        return { passed: true, score: 0.7, details: 'Handled error gracefully' };
      }
  }

  // If tool was called and we have some response, partial credit
  if (toolCalls && toolCalls.length > 0) {
    return { passed: false, score: 0.3, details: 'Attempted operation but did not handle error gracefully' };
  }
  
  return { passed: false, score: 0, details: 'Did not demonstrate graceful error handling' };
}

// ============================================================
// SCORING FUNCTIONS
// ============================================================

export function calculateCategoryScore(
  results: Array<{ category: string; score: number }>,
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'multi_turn' | 'boundary' | 'fault_injection'
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
  multi_turn?: number;
  boundary?: number;
  fault_injection?: number;
}): number {
  const config = getReadinessConfig();
  const weights = config.categoryWeights;

  const weightedScore =
    categoryScores.tool * weights.tool +
    categoryScores.rag * weights.rag +
    categoryScores.reasoning * weights.reasoning +
    categoryScores.intent * weights.intent +
    categoryScores.browser * weights.browser +
    (categoryScores.multi_turn || 0) * (weights.multi_turn || 0) +
    (categoryScores.boundary || 0) * (weights.boundary || 0) +
    (categoryScores.fault_injection || 0) * (weights.fault_injection || 0);

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

