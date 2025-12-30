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
}
