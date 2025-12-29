/**
 * Shared Types for Tooly Module
 * Central type definitions used across all tooly submodules
 */

// ============================================================
// TEST DEFINITIONS
// ============================================================

export interface TestDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedFiles?: string[];
  expected: {
    tool?: string;
    toolAny?: string[];
    noTool?: boolean;
    argsContain?: Record<string, any>;
    argsMatch?: Record<string, any>;
    responseContains?: string[];
    responseNotContains?: string[];
  };
  difficulty: 'basic' | 'intermediate' | 'advanced';
  timeout?: number;
}

export interface TestResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  latency: number;
  details: string;
  calledTool?: string;
  calledArgs?: Record<string, any>;
  response?: string;
  error?: string;
}

export interface TestRunResult {
  modelId: string;
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  startedAt: string;
  completedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  score: number;
  results: TestResult[];
  toolDiscovery?: ToolDiscoveryResult;
}

// ============================================================
// TOOL DISCOVERY
// ============================================================

export interface ToolDiscoveryResult {
  discoveredTools: string[];
  aliases: Record<string, string[]>;
  unmappedTools: string[];
}

export interface AliasRefinement {
  nativeToolName: string;
  originalMapping: string;
  refinedMapping: string;
  confidence: number;
  reason: string;
}

// ============================================================
// PROBE DEFINITIONS
// ============================================================

export interface ProbeDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedFiles?: string[];
  expectedBehavior: string;
  evaluate: (response: any, toolCalls: any[]) => ProbeEvaluation;
  variants?: ProbeVariant[];
}

export interface ProbeVariant {
  id: string;
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface ProbeEvaluation {
  passed: boolean;
  score: number;
  details: string;
}

export interface ProbeResult {
  testName: string;
  testId: string; // Added for Prosthetic Builder mapping
  passed: boolean;
  score: number;
  latency: number;
  details: string;
  response?: any;
  error?: string;
  toolFormat?: ToolFormat;
}

export interface ProbeRunResult {
  modelId: string;
  timestamp: string;
  results: ProbeResult[];
  overallScore: number;
  passedCount: number;
  failedCount: number;
}

export interface ProbeTestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  score: number;
  latency: number;
  details: string;
  response?: any;
  expectedBehavior?: string;
  variants?: ProbeVariantResult[];
}

export interface ProbeVariantResult {
  id: string;
  prompt: string;
  passed: boolean;
  score: number;
  response?: string;
}

export type ToolFormat = 'openai' | 'xml' | 'none';

// ============================================================
// REASONING PROBES
// ============================================================

export interface ReasoningProbeResults {
  intentExtraction: ProbeResult;
  multiStepPlanning: ProbeResult;
  conditionalReasoning: ProbeResult;
  contextContinuity: ProbeResult;
  logicalConsistency: ProbeResult;
  explanation: ProbeResult;
  edgeCaseHandling: ProbeResult;
}

// ============================================================
// INTENT PROBES
// ============================================================

export interface IntentProbeResult {
  id: string;
  name: string;
  invoked: boolean;
  invokedCorrectly: boolean;
  actionCorrect: boolean;
  score: number;
  details: string;
  toolsInvoked: string[];
  expectedTools: string[];
  response?: string;
}

export interface IntentProbeDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  explicitness: 'implicit' | 'subtle' | 'neutral' | 'explicit';
  shouldInvoke: boolean;
  expectedTools?: string[];
  acceptableTools?: string[];
  forbiddenTools?: string[];
  evaluateIntent: (response: any, toolCalls: any[]) => IntentProbeResult;
}

export interface IntentScores {
  invokeCorrectness: number;
  toolSelectionAccuracy: number;
  actionCorrectness: number;
  overInvocationRate: number;
  underInvocationRate: number;
  overallIntentScore: number;
}

// ============================================================
// CONTEXT LATENCY
// ============================================================

export interface ContextLatencyResult {
  testedContextSizes: number[];
  latencies: Record<number, number>;
  maxUsableContext: number;
  recommendedContext: number;
  modelMaxContext?: number;
  minLatency?: number;
  isInteractiveSpeed: boolean;
  speedRating: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

// ============================================================
// FAILURE PROFILES (NEW - 9.x)
// ============================================================

export interface FailureProfile {
  failureType: 'silent' | 'partial' | 'protocol_drift' | 'recovery_failure' | 'none';
  hallucinationType: 'tool' | 'code' | 'intent' | 'fact' | 'none';
  confidenceWhenWrong: number;
  recoverable: boolean;
  recoveryStepsNeeded: number;
  failureConditions: string[];
  overconfidenceRatio: number;
}

// ============================================================
// STATEFUL TESTING (NEW - 10.x)
// ============================================================

export interface StatefulTestConfig {
  totalTurns: number;
  instructionTurn: number;
  testTurns: number[];
  testType: 'instruction_decay' | 'schema_erosion' | 'context_drift' | 'role_stability';
}

export interface StatefulTestResult {
  testType: string;
  complianceAtTurn: Record<number, number>;
  degradationCurve: number[];
  breakpointTurn: number | null;
  recoveryAfterReminder: boolean;
}

// ============================================================
// PRECEDENCE TESTING (NEW - 11.x)
// ============================================================

export interface PrecedenceTest {
  rules: Array<{
    source: 'system' | 'developer' | 'rag_context' | 'user' | 'tool_schema';
    instruction: string;
    priority: number;
  }>;
  conflict: string;
  expectedWinner: string;
  actualWinner?: string;
}

export interface PrecedenceMatrix {
  systemVsDeveloper: 'system' | 'developer' | 'unpredictable';
  developerVsUser: 'developer' | 'user' | 'unpredictable';
  ragVsToolSchema: 'rag' | 'tool_schema' | 'unpredictable';
  safetyVsExecution: 'safety' | 'execution' | 'unpredictable';
}

// ============================================================
// COMPLIANCE TESTING (NEW - 14.x)
// ============================================================

export interface ComplianceTestResult {
  testId: string;
  testName: string;
  instruction: string;
  testedAtTurns: number[];
  complianceAtEachPoint: number[];
  overallCompliance: number;
  decayRate: number;
}

export interface SystemPromptCompliance {
  simpleRuleCompliance: number;
  complexRuleCompliance: number;
  constraintAdherence: number;
  memoryInjectionCompliance: number;
  longTermPersistence: number;
  conflictHandling: number;
  formatCompliance: number;
  priorityOrdering: number;
  overallComplianceScore: number;
  programmabilityRating: 'high' | 'medium' | 'low';
}

// ============================================================
// ANTI-PATTERN DETECTION
// ============================================================

export interface AntiPatternDetection {
  overTooling: boolean;
  megaToolCall: boolean;
  fileReadWithoutSearch: boolean;
  repeatedFailedQuery: boolean;
  ignoresContext: boolean;
  verbosePlanning: boolean;
  toolHallucination: boolean;
  redFlagScore: number;
  recommendations: string[];
}

// ============================================================
// SCORING
// ============================================================

export interface AgenticScores {
  toolAccuracy: number;
  intentRecognition: number;
  ragUsage: number;
  reasoning: number;
  bugDetection: number;
  codeUnderstanding: number;
  selfCorrection: number;
  antiPatternPenalty: number;
  overallScore: number;
}

export interface BaselineComparison {
  modelId: string;
  baselineModelId: string;
  timestamp: string;
  deltas: Partial<AgenticScores>;
  relativePerformance: number; // Percent of baseline
  strengths: string[];
  weaknesses: string[];
}

export interface TrainabilityScores {
  systemPromptCompliance: number;
  instructionPersistence: number;
  correctionAcceptance: number;
  overallTrainability: number;
}

export interface ScoreBreakdown {
  toolScore: number;
  reasoningScore: number;
  ragScore: number;
  bugDetectionScore: number;
  architecturalScore: number;
  navigationScore: number;
  helicopterScore: number;
  proactiveScore: number;
  intentScore: number;
  complianceScore: number;
  overallScore: number;
}

// ============================================================
// MODEL PROFILES
// ============================================================

export interface ModelProfileV2 {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  testedAt: string;
  testVersion: number;

  // Raw capability scores
  rawScores: AgenticScores;

  // Trainability scores
  trainabilityScores: TrainabilityScores;

  // Failure profile
  failureProfile: FailureProfile;

  // Precedence matrix
  precedenceMatrix?: PrecedenceMatrix;

  // Stateful behavior
  statefulProfile?: {
    instructionDecayTurn: number;
    maxReliableContext: number;
    recoversWithReminder: boolean;
  };

  // Anti-patterns
  antiPatterns: AntiPatternDetection;

  // Score breakdown
  scoreBreakdown: ScoreBreakdown;

  // Role recommendation
  recommendedRole: 'main' | 'executor' | 'both' | 'none';
  optimalPairings: string[];

  // Optimal settings
  optimalSettings: ModelOptimalSettings;

  // MCP config path
  mcpConfigPath?: string;
}

export interface ModelOptimalSettings {
  toolFormat: 'openai' | 'xml';
  maxToolsPerCall: number;
  descriptionStyle: 'verbose' | 'concise';
  systemPromptTemplate: string;
  contextBudget: ContextBudget;
  ragSettings: RAGSettings;
}

export interface ContextBudget {
  total: number;
  systemPrompt: number;
  toolSchemas: number;
  memory: number;
  ragResults: number;
  history: number;
  reserve: number;
}

export interface RAGSettings {
  chunkSize: number;
  chunkOverlap: number;
  resultCount: number;
  includeSummaries: boolean;
  includeGraph: boolean;
}

// ============================================================
// PROBE RUN OPTIONS
// ============================================================

export interface ProbeOptions {
  contextLength?: number;
  timeout?: number;
  runLatencyProfile?: boolean;
  runReasoningProbes?: boolean;
  categories?: string[];
  runStrategicProbes?: boolean;
  runArchitecturalProbes?: boolean;
  runNavigationProbes?: boolean;
  runHelicopterProbes?: boolean;
  runProactiveProbes?: boolean;
  runIntentProbes?: boolean;
  runFailureProbes?: boolean;
  runStatefulProbes?: boolean;
  runPrecedenceProbes?: boolean;
  runComplianceProbes?: boolean;
  quickMode?: boolean;
  testMode?: TestMode;
  isBaseline?: boolean;
}

export type TestMode = 'quick' | 'standard' | 'deep' | 'optimization';

export const TEST_MODE_CONFIG: Record<TestMode, {
  categories: string[];
  purpose: string;
  estimatedTime: string;
}> = {
  quick: {
    categories: ['1.x basic', 'format detection', 'speed check'],
    purpose: 'Quick ranking',
    estimatedTime: '~2 min'
  },
  standard: {
    categories: ['1.x-3.x', '8.x', '14.x basic'],
    purpose: 'Full capability assessment',
    estimatedTime: '~10 min'
  },
  deep: {
    categories: ['All 1.x-14.x'],
    purpose: 'Complete evaluation',
    estimatedTime: '~20 min'
  },
  optimization: {
    categories: ['All + context limits + tool count limits + RAG tuning'],
    purpose: 'Find optimal settings',
    estimatedTime: '~30+ min'
  }
};

// ============================================================
// PROBE CATEGORY DEFINITIONS
// ============================================================

export interface ProbeCategory {
  id: string;
  name: string;
  icon: string;
  probes: ProbeDefinition[];
}

// ============================================================
// MCP ORCHESTRATOR
// ============================================================

export interface ProstheticConfig {
  modelId: string;
  level1Prompts: string[];
  level2Constraints: string[];
  level3Interventions: {
    trigger: string;
    action: 'block' | 'rewrite';
    message: string;
  }[];
  level4Disqualifications: string[];
}

export interface MCPModelConfig {
  modelId: string;
  toolFormat: 'openai' | 'xml';
  enabledTools: string[];
  disabledTools: string[];
  toolOverrides: Record<string, {
    description?: string;
    priority?: number;
  }>;
  systemPromptAdditions: string[];
  contextBudget: ContextBudget;
  optimalSettings: {
    maxToolsPerCall: number;
    ragChunkSize: number;
    ragResultCount: number;
  };
  prosthetic?: ProstheticConfig;
}

export const TOOL_TIERS = {
  essential: [
    'rag_query', 'rag_status',
    'read_file', 'read_multiple_files', 'write_file', 'edit_file',
    'list_directory', 'search_files', 'get_file_info',
    'git_status', 'git_diff', 'git_add', 'git_commit',
    'shell_exec', 'memory_store'
  ],
  standard: [
    // All essential plus:
    'rag_index',
    'delete_file', 'copy_file', 'move_file',
    'create_directory', 'delete_directory', 'list_allowed_directories',
    'git_init', 'git_push', 'git_pull', 'git_checkout',
    'git_stash', 'git_stash_pop', 'git_reset', 'git_clone',
    'git_branch_create', 'git_branch_list', 'git_blame', 'git_show',
    'run_python', 'run_node', 'run_typescript',
    'memory_retrieve', 'memory_list', 'memory_delete'
  ],
  full: [
    // All standard plus:
    'npm_run', 'npm_install', 'npm_uninstall', 'npm_init',
    'npm_test', 'npm_build', 'npm_list',
    'http_request', 'url_fetch_content', 'web_search',
    'browser_navigate', 'browser_go_back', 'browser_go_forward',
    'browser_click', 'browser_type', 'browser_hover',
    'browser_select_option', 'browser_press_key', 'browser_snapshot',
    'browser_fetch_content', 'browser_take_screenshot', 'browser_wait',
    'browser_resize', 'browser_handle_dialog', 'browser_drag',
    'browser_tabs', 'browser_evaluate', 'browser_console_messages',
    'browser_network_requests',
    'text_summarize', 'diff_files',
    'process_list', 'process_kill',
    'zip_create', 'zip_extract',
    'mcp_rules', 'env_get', 'env_set',
    'json_parse', 'base64_encode', 'base64_decode'
  ]
} as const;

// ============================================================
// LEARNING SYSTEM
// ============================================================

export interface LearnedPattern {
  id: string;
  patternType: 'preference' | 'correction' | 'behavior' | 'rule';
  trigger: string;
  action: string;
  confidence: number;
  successRate: number;
  occurrenceCount: number;
  lastUsed: string;
  source: 'user_correction' | 'observed_behavior' | 'explicit_preference';
}

export interface LongTermMemory {
  global: {
    codingStyle: {
      preferredLanguage: string;
      formatting: string;
      testFramework: string;
    };
    communicationStyle: {
      verbosity: 'concise' | 'normal' | 'detailed';
      explanationLevel: 'beginner' | 'intermediate' | 'expert';
      codeComments: 'none' | 'minimal' | 'verbose';
    };
    safetyPreferences: {
      confirmDestructive: boolean;
      autoBackup: boolean;
      dryRunFirst: boolean;
    };
  };
  project: Record<string, {
    architecture: string;
    keyFiles: string[];
    conventions: string[];
    knownIssues: string[];
    userNotes: string[];
  }>;
  session: {
    currentTask: string;
    recentDecisions: string[];
    pendingItems: string[];
    importantFacts: string[];
  };
  learned: LearnedPattern[];
}

// ============================================================
// OPTIMAL SETUP
// ============================================================

export interface HardwareProfile {
  gpuName: string;
  vramGB: number;
  ramGB: number;
  cpuCores: number;
}

export interface OptimalSetupResult {
  hardware: HardwareProfile;
  scannedModels: number;
  testedModels: number;
  topMainCandidates: Array<{
    modelId: string;
    score: number;
    vramRequired: number;
  }>;
  topExecutorCandidates: Array<{
    modelId: string;
    score: number;
    vramRequired: number;
  }>;
  recommendedPairing: {
    mainModel: string;
    executorModel: string;
    confidence: number;
    reasoning: string;
  };
  recommendedSwarm?: {
    models: string[];
    roles: Record<string, 'main' | 'executor' | 'specialist'>;
    totalVramUsage: number;
    confidence: number;
    reasoning: string;
  };
  internetRecommendations?: Array<{
    modelId: string;
    source: string;
    estimatedScore: number;
    fitsHardware: boolean;
    downloadUrl: string;
  }>;
}

// ============================================================
// COGNITIVE LOOP TYPES (Phase 4)
// ============================================================

export interface MentalModel {
  summary: string;
  affectedComponents: string[];
  constraints: string[];
  requiredCapabilities: string[];
  completeness: number;
}

export type StrategyType = 'refactor' | 'patch' | 'investigate' | 'consult';

export interface IntentJSON {
  strategy: StrategyType;
  primaryAction: string;
  reasoning: string;
  riskLevel: 'high' | 'medium' | 'low';
  requiresUserApproval: boolean;
  targetComponents: string[];
}

