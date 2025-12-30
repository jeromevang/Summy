export type TestCategory = 
  | 'suppress' | 'single_tool' | 'tool_select' | 'param_extract'
  | 'clarify' | 'multi_tool' | 'reasoning' | 'refusal';

export type DifficultyTier = 'simple' | 'medium' | 'complex';

export interface Model {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'openrouter' | 'azure';
  role?: 'main' | 'executor' | 'both';
  score?: number;
  sizeBytes?: number;
  quantization?: string;
  estimatedVramGB?: number;
}

export interface ComboTestResult {
  testId: string;
  testName: string;
  category: TestCategory;
  difficulty: DifficultyTier;
  passed: boolean;
  mainAction: string | null;
  mainTool: string | null;
  executorToolCalls: string[];
  latencyMs: number;
  error?: string;
  timedOut?: boolean;
  skipped?: boolean;
}

export interface CategoryScore {
  category: TestCategory;
  difficulty: DifficultyTier;
  score: number;
  passed: boolean;
  latencyMs: number;
}

export interface TierScore {
  tier: DifficultyTier;
  score: number;
  categories: CategoryScore[];
}

export interface ComboScore {
  mainModelId: string;
  executorModelId: string;
  totalTests: number;
  passedTests: number;
  categoryScores?: CategoryScore[];
  tierScores?: TierScore[];
  mainScore: number;
  executorScore: number;
  mainCorrectCount?: number;
  executorSuccessCount?: number;
  intentAccuracy: number;
  executionSuccess: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  overallScore: number;
  testResults: ComboTestResult[];
  testedAt: string;
  skippedTests?: number;
  timedOutTests?: number;
  mainExcluded?: boolean;
  mainTimedOut?: boolean;
  executorTimedOut?: boolean;
  qualifyingGatePassed?: boolean;
  disqualifiedAt?: string | null;
  qualifyingResults?: ComboTestResult[];
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
  phase?: 'qualifying' | 'full_test';
}

export interface ContextSizeResult {
  contextSize: number;
  score: ComboScore;
}
