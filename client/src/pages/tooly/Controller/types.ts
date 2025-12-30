export interface FailureEntry {
  id: string;
  timestamp: string;
  modelId: string;
  category: string;
  tool?: string;
  error: string;
  errorType: string;
  context: {
    query: string;
    queryHash: string;
  };
  pattern?: string;
  resolved: boolean;
}

export interface FailureAlert {
  id: string;
  type: string;
  severity: string;
  patternName: string;
  message: string;
  timestamp: string;
}

export interface ComboProsthetic {
  comboId: string;
  mainModelId: string;
  executorModelId: string;
  prompt: string;
  level: number;
  verified: boolean;
  comboScoreBefore?: number;
  comboScoreAfter?: number;
  createdAt: string;
  successfulRuns: number;
}

export interface ComboResult {
  id: string;
  mainModelId: string;
  executorModelId: string;
  overallScore: number;
  mainScore: number;
  executorScore: number;
  testedAt: string;
}

export interface ComboTeachingResult {
  success: boolean;
  attempts: number;
  finalScore: number;
  comboId: string;
  mainModelId: string;
  executorModelId: string;
  comboScoreBefore: number;
  comboScoreAfter: number;
  improvements: {
    overall: number;
  };
  certified: boolean;
  log: string[];
}

export interface ControllerAnalysis {
  diagnosis: string;
  rootCause: string;
  suggestedProsthetic: {
    level: number;
    prompt: string;
    targetCategories: string[];
  };
  testCases: Array<{
    id: string;
    prompt: string;
    expectedTool?: string;
    expectedBehavior: string;
  }>;
  confidence: number;
  priority: string;
}

export interface ObserverStatus {
  enabled: boolean;
  running: boolean;
  lastCheck: string;
  alertCount: number;
  patternsTracked: number;
}

export interface DashboardSummary {
  unresolvedFailures: number;
  criticalPatterns: number;
  modelsAffected: number;
  recentAlerts: FailureAlert[];
  needsAttention: boolean;
}
