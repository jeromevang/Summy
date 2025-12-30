export interface SystemMetrics {
  cpu: number;
  gpu: number;
  vramUsedMB?: number;
  vramTotalMB?: number;
  vramPercent?: number;
  gpuName?: string;
  gpuTemp?: number;
  ramUsedGB?: number;
  ramTotalGB?: number;
  ramPercent?: number;
}

export interface ModelProfile {
  modelId: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  testedAt: string;
  score: number;
  role?: 'main' | 'executor' | 'both' | 'none';
  scoreBreakdown?: Record<string, number>;
  modelInfo?: Record<string, any>;
  probeResults?: Record<string, any>;
  capabilities?: Record<string, any>;
  contextLatency?: Record<string, any>;
  badges?: Array<{ id: string; name: string; icon: string }>;
  recommendations?: Array<{ type: string; message: string; priority: string }>;
  failureProfile?: Record<string, any>;
  trainabilityScores?: Record<string, number>;
  optimalSettings?: Record<string, any>;
  contextPerformance?: {
    testedAt: string;
    results: Array<{
      fillLevel: number;
      tokensUsed: number;
      qualityScore: number;
      latencyMs: number;
      degradationFromBaseline: number;
    }>;
    effectiveMaxContext: number;
    degradationCurve: number[];
  };
}

export interface TestProgress {
  isRunning: boolean;
  currentTest?: string;
  currentCategory?: string;
  progress?: { current: number; total: number };
  status?: string;
  eta?: number;
}

export interface PreflightError {
  aborted: boolean;
  abortReason?: 'MODEL_TOO_SLOW' | 'USER_CANCELLED' | 'ERROR';
  preflightLatency?: number;
  preflightMessage?: string;
}

export type TabId = 'overview' | 'testing' | 'capabilities' | 'configuration' | 'history';
