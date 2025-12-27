import type { Recommendation } from '../../components/Recommendations';

// ============================================================
// TYPES
// ============================================================

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

export interface ExtendedProbeResult {
  name: string;
  passed: boolean;
  score?: number;
}

export interface ProbeResults {
  testedAt: string;
  // Core tool probes (1.1 - 1.4)
  emitTest: ProbeTestResult;
  schemaTest: ProbeTestResult;
  selectionTest: ProbeTestResult;
  suppressionTest: ProbeTestResult;
  // Enhanced tool probes (1.5 - 1.8)
  nearIdenticalSelectionTest?: ProbeTestResult;
  multiToolEmitTest?: ProbeTestResult;
  argumentValidationTest?: ProbeTestResult;
  schemaReorderTest?: ProbeTestResult;
  // Reasoning
  reasoningProbes?: ReasoningProbeResults;
  // Extended probes
  strategicRAGProbes?: ExtendedProbeResult[];
  architecturalProbes?: ExtendedProbeResult[];
  navigationProbes?: ExtendedProbeResult[];
  helicopterProbes?: ExtendedProbeResult[];
  proactiveProbes?: ExtendedProbeResult[];
  intentProbes?: ExtendedProbeResult[];
  toolScore?: number;
  reasoningScore?: number;
  overallScore: number;
}

export interface ContextLatencyData {
  testedContextSizes: number[];
  latencies: Record<number, number>;
  maxUsableContext: number;
  recommendedContext: number;
  modelMaxContext?: number;
  minLatency?: number;
  isInteractiveSpeed?: boolean;
  speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow' | 'very_slow';
}

export interface ModelInfo {
  name?: string;
  author?: string;
  description?: string;
  parameters?: string;
  architecture?: string;
  contextLength?: number;
  license?: string;
  quantization?: string;
  capabilities?: string[];
  tags?: string[];
  source?: string;
}

export interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  testedAt: string;
  score: number;
  enabledTools: string[];
  capabilities: Record<string, { supported: boolean; score: number; nativeAliases?: string[]; testsPassed?: number; testsFailed?: number }>;
  contextLength?: number;
  maxContextLength?: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  probeResults?: ProbeResults;
  contextLatency?: ContextLatencyData;
  systemPrompt?: string;
  discoveredNativeTools?: string[];  // ALL tools the model claims to support
  unmappedNativeTools?: string[];    // Tools that couldn't be matched to any MCP tool
  scoreBreakdown?: {
    ragScore?: number;
    bugDetectionScore?: number;
    architecturalScore?: number;
    navigationScore?: number;
    proactiveScore?: number;
    toolScore?: number;
    reasoningScore?: number;
    intentScore?: number;
    overallScore?: number;
  };
  badges?: Array<{ id: string; name: string; icon: string }>;
  modelInfo?: ModelInfo;
  recommendations?: Recommendation[];
}

export interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  status: 'tested' | 'untested' | 'failed' | 'known_good';
  score?: number;
  toolScore?: number;
  reasoningScore?: number;
  toolCount?: number;
  totalTools?: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  maxContextLength?: number;
  sizeBytes?: number;
  quantization?: string;
}

export interface TestDefinition {
  id: string;
  tool: string;
  category: string;
  difficulty: string;
  prompt: string;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  model: string;
  tool: string;
  status: 'success' | 'failed' | 'timeout';
  durationMs: number;
  backupId?: string;
}

export type TabId = 'models' | 'tests' | 'logs';

// Test progress types
export interface TestProgressItem {
  current: number;
  total: number;
  currentTest: string;
  score?: number;
  status: string;
}

export interface TestProgress {
  probeProgress?: TestProgressItem;
  toolsProgress?: TestProgressItem;
  latencyProgress?: { current: number; total: number; currentTest: string; status: string };
  modelId?: string;
  startTime?: number;
}

// Model loading state
export interface ModelLoadingState {
  modelId?: string;
  status?: 'loading' | 'unloading' | 'loaded' | 'unloaded' | 'failed';
  message?: string;
}

// System metrics
export interface SystemMetric {
  cpu: number;
  gpu: number;
  gpuMemory: number;
  gpuTemp: number;
  gpuName: string;
}

// Test all progress
export interface TestAllProgress {
  current: number;
  total: number;
  currentModelName: string;
  skipped: string[];
  completed: string[];
}

// Intent progress
export interface IntentProgress {
  current: number;
  total: number;
  currentModelName: string;
}

// Provider types
export type ProviderFilter = 'all' | 'lmstudio' | 'openai' | 'azure' | 'openrouter';
export type TestMode = 'quick' | 'keep_on_success' | 'manual';
export type ProxyMode = 'passthrough' | 'summy' | 'tooly' | 'both';

export interface AvailableProviders {
  lmstudio: boolean;
  openai: boolean;
  azure: boolean;
  openrouter: boolean;
}

// Expanded sections for V1 detail view
export interface ExpandedSections {
  scores: boolean;
  breakdown: boolean;
  badges: boolean;
  info: boolean;
  recommendations: boolean;
  probes: boolean;
  latency: boolean;
  tools: boolean;
}

