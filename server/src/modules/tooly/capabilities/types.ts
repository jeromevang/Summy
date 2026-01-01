export interface ToolCapability {
  supported: boolean;
  score: number;
  testsPassed: number;
  testsFailed: number;
  avgLatency?: number;
  lastTested?: string;
  notes?: string;
  nativeAliases?: string[];
  nativeScore?: number;
  trainedScore?: number;
  trainable?: boolean | null;
}

export interface CapabilityStatus {
  nativeScore: number;
  trainedScore: number | null;
  trainable: boolean | null;
  blocked: boolean;
  lastTested?: string;
}

export interface ProbeTestResult {
  passed: boolean;
  score: number;
  details: string;
}

export interface ReasoningProbeResults {
  intentExtraction: ProbeTestResult;
  multiStepPlanning: ProbeTestResult;
  conditionalReasoning: ProbeTestResult;
  contextContinuity: ProbeTestResult;
  logicalConsistency: ProbeTestResult;
  explanation: ProbeTestResult;
  edgeCaseHandling: ProbeTestResult;
}

export interface ProbeResults {
  testedAt: string;
  emitTest: ProbeTestResult;
  schemaTest: ProbeTestResult;
  selectionTest: ProbeTestResult;
  suppressionTest: ProbeTestResult;
  nearIdenticalSelectionTest?: ProbeTestResult;
  multiToolEmitTest?: ProbeTestResult;
  argumentValidationTest?: ProbeTestResult;
  schemaReorderTest?: ProbeTestResult;
  reasoningProbes?: ReasoningProbeResults;
  toolScore: number;
  reasoningScore: number;
  overallScore: number;
}

export interface ContextLatencyData {
  testedContextSizes: number[];
  latencies: Record<number, number>;
  maxUsableContext: number;
  recommendedContext: number;
}

export interface AgenticReadinessStatus {
  certified: boolean;
  score: number;
  assessedAt?: string;
  certifiedAt?: string;
  categoryScores: {
    tool: number;
    rag: number;
    reasoning: number;
    intent: number;
    browser: number;
  };
  failedTests: string[];
  prostheticApplied: boolean;
  prostheticLevel?: 1 | 2 | 3 | 4;
  qualifyingGatePassed?: boolean;
  disqualifiedAt?: string;
  mode?: 'single' | 'dual';
  executorModelId?: string;
  testResults?: Array<{
    testId: string;
    testName: string;
    category: string;
    passed: boolean;
    score: number;
    details: string;
    latency: number;
    attribution?: 'main' | 'executor' | 'loop';
  }>;
}

export interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  testedAt: string;
  testVersion: number;
  score: number;
  toolFormat: 'openai_tools' | 'function_calling' | 'xml' | 'none';
  systemPrompt?: string;
  avgLatency?: number;
  contextLength?: number;
  isBaseline?: boolean;
  teachingResults?: any;
  role?: 'main' | 'executor' | 'both' | 'none';
  probeResults?: ProbeResults;
  contextLatency?: ContextLatencyData;
  discoveredNativeTools?: string[];
  unmappedNativeTools?: string[];
  agenticReadiness?: AgenticReadinessStatus;
  prostheticApplied?: boolean;
  trainabilityScores?: {
    systemPromptCompliance: number;
    instructionPersistence: number;
    correctionAcceptance: number;
    overallTrainability: number;
  };
  capabilities: Record<string, ToolCapability>;
  enabledTools: string[];
  testResults?: Array<{
    testId: string;
    passed: boolean;
    score: number;
    response?: string;
    error?: string;
  }>;
  capabilityMap?: Record<string, CapabilityStatus>;
  nativeStrengths?: string[];
  learnedCapabilities?: string[];
  blockedCapabilities?: string[];
  fallbackModelId?: string;
  smokeTestResults?: {
    testedAt: string;
    passed: boolean;
    score: number;
    nativeCapabilities: string[];
    trainableCapabilities: string[];
    blockedCapabilities: string[];
  };

  // --- NEW: Project Opus Behavioral Profiles ---
  failureProfile?: FailureProfile;
  statefulProfile?: StatefulProfile;
  precedenceMatrix?: PrecedenceMatrix;
  efficiencyMetrics?: EfficiencyMetrics;
  calibration?: ConfidenceCalibration;
  // -----------------------------------------
}

// ============================================================
// NEW: From Project Opus - Advanced Behavioral Profiling
// ============================================================

export interface FailureProfile {
  // Classification
  failureType: 'silent' | 'partial' | 'protocol_drift' | 'recovery_failure' | 'none';
  hallucinationType: 'tool' | 'code' | 'intent' | 'fact' | 'none';
  
  // Severity
  confidenceWhenWrong: number; // 0-1, High = dangerous (overconfident)
  detectability: 'obvious' | 'subtle' | 'hidden';
  
  // Recovery
  recoverable: boolean;
  recoveryStepsNeeded: number; // 0 = self-corrects, 3+ = needs human
  acceptsCorrection: boolean;
  
  // Common failure conditions for this model
  failureConditions: string[]; // e.g., "long_context", "ambiguous_request", "complex_tool_chain"
}

export interface StatefulProfile {
  instructionDecayTurn: number; // At what turn instructions start failing (0 = no decay)
  maxReliableContext: number; // Tokens before significant quality degradation
  recoversWithReminder: boolean;
}

export interface PrecedenceMatrix {
  // Records which source wins in a conflict
  systemVsDeveloper: 'system' | 'developer' | 'unpredictable';
  developerVsUser: 'developer' | 'user' | 'unpredictable';
  ragVsToolSchema: 'rag' | 'tool_schema' | 'unpredictable';
  safetyVsExecution: 'safety' | 'execution' | 'unpredictable';
}

export interface EfficiencyMetrics {
  tokensPerCorrectAction: number;
  ragWasteRatio: number; // Unused retrieved context / total retrieved
  planningVerbosity: number; // Planning tokens / execution tokens
  redundantToolCalls: number;
  estimatedCostPerTask?: number;
  speedEfficiencyScore?: number;
}

export interface ConfidenceCalibration {
  score: number; // 0-1, how well confidence matches accuracy
  overconfidenceRatio: number; // % of time model was wrong but confident
  saysIDontKnow: boolean; // Does the model admit when it doesn't know?
}
