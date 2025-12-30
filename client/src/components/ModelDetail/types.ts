export interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: string;
  role: 'main' | 'executor' | 'both' | 'none';
  score: number;
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
  contextLatency?: {
    latencies?: Record<string, number>;
    speedRating?: 'excellent' | 'good' | 'acceptable' | 'slow';
    maxUsableContext?: number;
    isInteractiveSpeed?: boolean;
    recommendedContext?: number;
  };
  badges?: Array<{ id: string; name: string; icon: string }>;
  recommendations?: Array<{ task: string; suitability: 'excellent' | 'good' | 'fair' | 'poor' }>;
  modelInfo?: {
    name?: string;
    author?: string;
    description?: string;
    parameters?: string;
    architecture?: string;
    contextLength?: number;
    license?: string;
    capabilities?: string[];
  };
  toolCategories?: Record<string, { tools: Array<{ name: string; score: number; testsPassed: number; enabled: boolean }> }>;
  probeResults?: {
    coreProbes?: Array<{ name: string; passed: boolean; latency?: number }>;
    enhancedProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    reasoningProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    strategicRAGProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    architecturalProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    navigationProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    helicopterProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    proactiveProbes?: Array<{ name: string; passed: boolean; score?: number }>;
    intentProbes?: Array<{ name: string; passed: boolean; score?: number }>;
  };
}

export interface TestProgress {
  isRunning: boolean;
  current: number;
  total: number;
  currentCategory?: string;
  currentTest?: string;
  percent: number;
  eta?: string;
  testType?: 'probe' | 'tools' | 'latency';
}

export interface ModelLoading {
  isLoading: boolean;
  status?: 'loading' | 'unloading';
  message?: string;
}

export type TabId = 'overview' | 'capabilities' | 'tools' | 'perf';
