export interface IntentSchema {
  schemaVersion: string;
  action: 'call_tool' | 'respond' | 'ask_clarification' | 'multi_step';
  tool?: string;
  parameters?: Record<string, any>;
  steps?: IntentStep[];
  metadata?: {
    reasoning?: string;
    priority?: 'low' | 'normal' | 'high';
    context?: string;
    response?: string;
    question?: string;
  };
}

export interface IntentStep {
  order: number;
  action: 'call_tool' | 'respond';
  tool?: string;
  parameters?: Record<string, any>;
  waitForResult?: boolean;
}

export interface RouterConfig {
  mainModelId?: string;
  executorModelId?: string;
  enableDualModel: boolean;
  timeout: number;
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  settings: {
    lmstudioUrl?: string;
    openaiApiKey?: string;
    azureResourceName?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
    azureApiVersion?: string;
    openrouterApiKey?: string;
  };
}

export interface RoutingPhase {
  phase: 'planning' | 'execution' | 'response';
  systemPrompt: string;
  model: string;
  latencyMs: number;
  reasoning?: string;
}

export interface RoutingResult {
  mode: 'single' | 'dual';
  mainResponse?: any;
  executorResponse?: any;
  finalResponse: any;
  toolCalls?: any[];
  latency: {
    main?: number;
    executor?: number;
    total: number;
  };
  phases: RoutingPhase[];
  intent?: IntentSchema;
}

// --- New Types for MCP Orchestrator & Scoring ---

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

export interface ModelOptimalSettings {
  toolFormat: string;
  maxToolsPerCall: number;
  descriptionStyle: 'verbose' | 'concise';
  systemPromptTemplate: string;
  contextBudget: ContextBudget;
  ragSettings: RAGSettings;
  ragChunkSize?: number;
  ragResultCount?: number;
}

import { InterventionRule } from './orchestrator/prosthetic-prompt-builder.js';

export interface ProstheticConfig {
  modelId: string;
  level1Prompts: string[];
  level2Constraints: string[];
  level3Interventions: InterventionRule[];
  level4Disqualifications: string[];
}

export interface ToolOverride {
  description: string;
  priority: 'high' | 'normal' | 'low';
}

export interface MCPModelConfig {
  modelId: string;
  toolFormat: string;
  enabledTools: string[];
  disabledTools: string[];
  toolOverrides: Record<string, ToolOverride>;
  systemPromptAdditions: string[];
  contextBudget: ContextBudget;
  optimalSettings: {
    maxToolsPerCall: number;
    descriptionStyle: 'verbose' | 'concise';
    ragChunkSize: number;
    ragResultCount: number;
  };
  prosthetic: ProstheticConfig;
}

// --- Agentic Readiness & Scoring Types ---

export interface ProbeResult {
  passed: boolean;
  score: number;
  details?: string;
  latency?: number;
  testId?: string;
  error?: string;
}

export interface ProbeRunResult {
  modelId: string;
  toolScore: number;
  ragScore: number;
  reasoningScore: number;
  intentScore: number;
  results: Array<{
    testId: string;
    passed: boolean;
    score: number;
    details?: string;
  }>;
}

export interface AgenticScores {
  overallScore: number;
  toolAccuracy: number;
  intentRecognition: number;
  ragUsage: number;
  reasoning: number;
  bugDetection: number;
  codeUnderstanding: number;
  selfCorrection: number;
  antiPatternPenalty: number;
}

export interface FailureProfile {
  failureType: 'none' | 'silent' | 'partial' | 'recovery_failure';
  hallucinationType: 'none' | 'tool' | 'code' | 'fact' | 'intent';
  detectability: 'obvious' | 'subtle' | 'hidden';
  confidenceWhenWrong?: number;
  recoverable?: boolean;
  recoveryStepsNeeded?: number;
  acceptsCorrection?: boolean;
  failureConditions?: string[];
}

export interface StatefulProfile {
  instructionDecayTurn: number;
  maxReliableContext: number;
  contextRecallScore: number;
}

export interface PrecedenceMatrix {
  systemVsDeveloper: 'system' | 'developer' | 'balanced' | 'unpredictable';
  safetyVsExecution: 'safety' | 'execution' | 'balanced' | 'unpredictable';
  developerVsUser?: 'developer' | 'user' | 'balanced' | 'unpredictable';
  ragVsToolSchema?: 'rag' | 'tool_schema' | 'balanced' | 'unpredictable';
}

export interface EfficiencyMetrics {
  ragWasteRatio: number;
  planningVerbosity: number;
  redundantToolCalls: number;
  tokensPerCorrectAction: number;
  estimatedCostPerTask?: number;
  speedEfficiencyScore?: number;
}

export interface CalibrationData {
  overconfidenceRatio: number;
  confidenceAccuracyCorrelation: number;
}

export interface ContextLatencyData {
  averageLatencyPer1kTokens: number;
  recommendedContext: number;
}

export interface ModelProfile {
  modelId: string;
  toolFormat?: string;
  descriptionStyle?: 'verbose' | 'concise';
  contextLength?: number;
  contextBudget?: ContextBudget;
  optimalSettings?: ModelOptimalSettings;
  blockedCapabilities?: string[];
  toolScore?: number;
  probeResults?: ProbeRunResult;
  // Deep Analysis Fields
  agenticReadiness?: AgenticScores;
  failureProfile?: FailureProfile;
  statefulProfile?: StatefulProfile;
  precedenceMatrix?: PrecedenceMatrix;
  efficiencyMetrics?: EfficiencyMetrics;
  calibration?: CalibrationData;
  contextLatency?: ContextLatencyData;
}

export interface HardwareProfile {
  cpu: string;
  gpu: string;
  ram: string;
  vram?: string;
  
  // Extended fields for setup-finder
  gpuName?: string;
  vramGB?: number;
  ramGB?: number;
  cpuCores?: number;
}

export interface OptimalSetupResult {
  hardware: HardwareProfile;
  recommendedModels?: ModelProfile[];
  
  // Extended fields for setup-finder
  scannedModels?: number;
  testedModels?: number;
  topMainCandidates?: Array<{modelId: string, score: number, vramRequired: number}>;
  topExecutorCandidates?: Array<{modelId: string, score: number, vramRequired: number}>;
  recommendedPairing?: {
    mainModel: string;
    executorModel: string;
    confidence: number;
    reasoning: string;
  };
  recommendedSwarm?: {
    models: string[];
    roles: Record<string, string>;
    totalVramUsage: number;
    confidence: number;
    reasoning: string;
  };
}

export interface TrainabilityScores {
  score?: number;
  learningRate?: number;
  adaptationSpeed?: number;
  overallTrainability: number;
  systemPromptCompliance: number;
  instructionPersistence: number;
  correctionAcceptance: number;
}

export interface SystemPromptCompliance {
  score: number;
  adherenceRate: number;
  overallComplianceScore: number;
}

export interface AntiPatternDetection {
  detected: boolean;
  patterns: string[];
  redFlagScore?: number;
  overTooling?: boolean;
  megaToolCall?: boolean;
  fileReadWithoutSearch?: boolean;
  repeatedFailedQuery?: boolean;
  ignoresContext?: boolean;
  verbosePlanning?: boolean;
  toolHallucination?: boolean;
  recommendations?: string[];
}

export interface BaselineComparison {
  modelId: string;
  baselineModelId?: string;
  similarity: number;
  improvement: number;
  timestamp?: string;
  deltas?: Record<string, number>;
  relativePerformance?: number;
  strengths?: string[];
  weaknesses?: string[];
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
  categories?: Record<string, number>;
  details?: string[];
}

export interface LearnedPattern {
  id: string;
  patternType: 'preference' | 'rule' | 'correction' | 'behavior';
  trigger: string;
  action: string;
  confidence: number;
  successRate: number;
  occurrenceCount: number;
  uses: number;
  lastUsed: string;
  source: 'user_correction' | 'observed_behavior' | 'system_inference';
}

export interface ProjectMemory {
  architecture?: string;
  keyFiles: string[];
  conventions: string[];
  knownIssues: string[];
  userNotes: string[];
}

export interface GlobalMemory {
  codingStyle: {
    preferredLanguage: string;
    formatting: string;
    testFramework: string;
  };
  communicationStyle: {
    verbosity: string;
    explanationLevel: string;
    codeComments: string;
  };
  safetyPreferences: {
    confirmDestructive: boolean;
    autoBackup: boolean;
    dryRunFirst: boolean;
  };
}

export interface SessionMemory {
  currentTask: string;
  recentDecisions: string[];
  pendingItems: string[];
  importantFacts: string[];
}

export interface LongTermMemory {
  global: GlobalMemory;
  project: Record<string, ProjectMemory>;
  session: SessionMemory;
  learned: LearnedPattern[];
}

export type TOOL_TIERS = 'essential' | 'standard' | 'full';

// Re-export for compatibility if needed
export type ModelProfileV2 = ModelProfile;
export type StrategyType = 'tool_call' | 'read_more' | 'direct_answer';
export type IntentJSON = IntentSchema;

export interface ProbeDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt: string;
  expectedBehavior: string;
  evaluate: (response: any, toolCalls: any[], conversationHistory?: any[]) => ProbeEvaluation;
}

export interface ProbeEvaluation {
  passed: boolean;
  score: number;
  details: string;
}

export interface ComplianceTestResult {
  testId: string;
  passed: boolean;
  score: number;
  details: string;
}

export interface PrecedenceTest extends ProbeDefinition {
  conflictType: 'system_vs_user' | 'safety_vs_execution';
}

export interface StatefulTestConfig {
  turns: number;
  totalTurns?: number;
  instructionTurn?: number;
  testTurns?: number[];
  testType?: string;
  complexity: 'low' | 'medium' | 'high';
}

export interface StatefulTestResult {
  passed: boolean;
  decayTurn?: number;
  testType?: string;
  complianceAtTurn?: Record<number, number>;
  degradationCurve?: number[];
  breakpointTurn?: number | null;
  recoveryAfterReminder?: boolean;
}

export interface SmokeTestSummary {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  latencyMs: number;
}

export interface SmokeTestResult {
  testId: string;
  passed: boolean;
  latency: number;
  error?: string;
}

export type TestCategory = 'smoke' | 'regression' | 'performance' | 'compliance';

export interface ComboTestProgress {
  testId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
}

export interface ReadinessResult {
  overallScore: number;
  breakdown: Record<string, number>;
  recommendations: string[];
}

export interface BroadcastService {
  broadcast: (type: string, payload: any) => void;
}

export interface ComboTeachingResult {
  improved: boolean;
  testId: string;
  beforeScore: number;
  afterScore: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  meta?: any;
}

export interface LogStats {
  totalLogs: number;
  errorCount: number;
  warnCount: number;
}

export interface LogFilter {
  level?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogType = 'system' | 'request' | 'model';
