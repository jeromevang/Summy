import { ContextLatencyResult } from '../probes/probe-types.js';

export interface ParamCondition {
    equals?: any;
    contains?: string;
    oneOf?: any[];
    exists?: boolean;
}

export interface TestDefinition {
    id: string;
    tool: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    prompt: string;
    setupFiles?: Record<string, string>;
    expected: {
        tool: string;
        params: Record<string, ParamCondition>;
    };
    tags?: string[];
    weight?: number;
}

export interface TestResult {
    testId: string;
    tool: string;
    category?: string; // Added for test categorization
    passed: boolean;
    score: number;
    latency: number;
    checks: CheckResult[];
    response?: any;
    error?: string;
    calledTool?: string;
    calledArgs?: Record<string, any>;
    details?: string; // Added for additional test details
}

export interface CheckResult {
    name: string;
    passed: boolean;
    expected?: any;
    actual?: any;
}

export interface OptimizationResults {
    contextLatency?: ContextLatencyResult;
    toolCountSweep?: {
        essential: { count: number; score: number; latency: number };
        standard: { count: number; score: number; latency: number };
        full: { count: number; score: number; latency: number };
        optimal: 'essential' | 'standard' | 'full';
    };
    ragTuning?: {
        chunkSizes: Record<number, number>;
        resultCounts: Record<number, number>;
        optimalChunkSize: number;
        optimalResultCount: number;
    };
    optimalContextLength?: number;
    optimalToolCount?: number;
    configGenerated?: boolean;
    configPath?: string;
}

export interface AliasRefinement {
    nativeToolName: string;
    originalMapping: string;
    refinedMapping: string;
    confidence: number;
    reason: string;
}

export interface TestRunResult {
    modelId: string;
    startedAt: string;
    completedAt: string;
    totalTests: number;
    passed: number;
    failed: number;
    overallScore: number;
    results: TestResult[];
    scoreBreakdown?: {
        toolScore?: number;
        reasoningScore?: number;
        ragScore?: number;
        intentScore?: number;
        bugDetectionScore?: number;
    };
    aborted?: boolean;
    abortReason?: 'MODEL_TOO_SLOW' | 'USER_CANCELLED' | 'ERROR';
    preflightLatency?: number;
    preflightMessage?: string;
    contextLatency?: ContextLatencyResult;
    optimization?: OptimizationResults;
}

export type TestMode = 'quick' | 'standard' | 'deep' | 'optimization' | 'keep_on_success' | 'manual';

export interface TestOptions {
    mode?: TestMode;
    unloadOthersBefore?: boolean;
    unloadAfterTest?: boolean;
    unloadOnlyOnFail?: boolean;
    contextLength?: number;
    skipPreflight?: boolean;
    categories?: string[];
    signal?: AbortSignal;
    isBaseline?: boolean;
}

// ============================================================
// COMBO TESTING TYPES (DUAL-MODEL)
// ============================================================

export type TestCategory = 
  | 'suppress'       // Simple: Don't call tools when not needed
  | 'single_tool'    // Simple: One obvious tool choice
  | 'tool_select'    // Medium: Choose correct tool from options
  | 'param_extract'  // Medium: Extract correct parameters
  | 'clarify'        // Medium: Recognize missing info
  | 'multi_tool'     // Complex: Sequential tool calls
  | 'reasoning'      // Complex: Requires thinking first
  | 'refusal';       // Complex: Refuse dangerous requests

export type DifficultyTier = 'simple' | 'medium' | 'complex';

export interface ComboTestCase {
  id: string;
  name: string;
  category: TestCategory;
  difficulty: DifficultyTier;
  prompt: string;
  expectedAction: 'call_tool' | 'respond' | 'ask_clarification' | 'multi_step';
  expectedTool?: string;
  expectedTools?: string[];  // For multi-tool tests
  expectedParams?: Record<string, any>;
  verifyParam?: string;      // Key param to verify (e.g., filepath)
  verifyContains?: string;   // Expected value should contain this
}

export interface ComboTestResult {
  testId: string;
  testName: string;
  category: TestCategory;
  difficulty: DifficultyTier;
  passed: boolean;
  mainOutputValid: boolean;
  mainAction: string | null;
  mainTool: string | null;
  executorCalled: boolean;
  executorToolCalls: string[];
  latencyMs: number;
  mainLatencyMs?: number;      // Main model latency
  executorLatencyMs?: number;  // Executor model latency
  error?: string;
  timedOut?: boolean;
  mainTimedOut?: boolean;      // Main model specifically was too slow
  executorTimedOut?: boolean;  // Executor model specifically was too slow
  skipped?: boolean;
  response?: string;           // Final text response
  timestamp?: string;          // ISO timestamp
}

export interface CategoryScore {
  category: TestCategory;
  difficulty: DifficultyTier;
  score: number;      // 0 or 100 (one test per category)
  passed: boolean;
  latencyMs: number;
}

export interface TierScore {
  tier: DifficultyTier;
  score: number;      // Average of category scores in this tier
  categories: CategoryScore[];
}

export interface ComboScore {
  id?: string; // Optional unique identifier
  mainModelId: string;
  executorModelId: string;
  totalTests: number;
  passedTests: number;
  passedCount: number; // Computed from passedTests
  failedCount: number; // Computed from totalTests - passedTests
  
  // Category-level scores
  categoryScores: CategoryScore[];
  tierScores: TierScore[];
  
  // Split scores for Main vs Executor
  mainScore: number;           // % of tests where Main correctly identified action
  executorScore: number;       // % of tests where Executor succeeded (given Main was correct)
  mainCorrectCount: number;    // Raw count for Main
  executorSuccessCount: number; // Raw count for Executor
  
  // Legacy compatibility
  intentAccuracy: number;
  executionSuccess: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  overallScore: number;        // Weighted: Simple 20%, Medium 30%, Complex 50%
  
  testResults: ComboTestResult[];
  testedAt: string;
  skippedTests?: number;
  timedOutTests?: number;
  mainExcluded?: boolean;   // True if Main model was excluded due to timeout
  mainTimedOut?: boolean;   // True if Main model specifically was too slow
  executorTimedOut?: boolean; // True if Executor model specifically was too slow

  // Qualifying gate results
  qualifyingGatePassed?: boolean; // True if passed qualifying gate
  disqualifiedAt?: string | null; // Where combo was disqualified
  qualifyingResults?: ComboTestResult[]; // Results from qualifying gate tests
}

export interface ComboTestConfig {
  mainModels: string[];
  executorModels: string[];
  lmstudioUrl: string;
  timeout?: number;
  taskTimeout?: number; // Per-task timeout (default 10000ms)
  contextSize?: number; // Context window size for testing
}

export interface ComboTestProgress {
  currentMain: string;
  currentExecutor: string;
  currentTest: string;
  comboIndex: number;
  totalCombos: number;
  testIndex: number;
  totalTests: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
}

export interface BroadcastFn {
  (event: string, data: any): void;
}
