export interface GPUInfo {
  name: string;
  vramMB: number;
  vramFreeMB: number;
  driver: string;
}

export interface HardwareProfile {
  gpus: GPUInfo[];
  primaryGpu: GPUInfo | null;
  system: {
    cpuModel: string;
    cpuCores: number;
    ramTotalGB: number;
    ramFreeGB: number;
    platform: string;
  };
  totalVramGB: number;
  availableVramGB: number;
}

export interface ScannedModel {
  id: string;
  displayName: string;
  parameters?: string;
  quantization?: string;
  estimatedVramGB: number;
  canRun: boolean;
  loadedNow: boolean;
  testedBefore: boolean;
  lastScore?: number;
}

export interface CategoryScore {
  tool: number;
  rag: number;
  reasoning: number;
  intent: number;
  browser: number;
  multi_turn: number;
  boundary: number;
  fault_injection: number;
}

export interface TestResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
  latency: number;
  attribution?: 'main' | 'executor' | 'loop';
}

export interface CombinationCheckResult {
  vramOk: boolean;
  compatibilityOk: boolean;
  setupOk: boolean;
  vramMessage: string;
  compatibilityMessage: string;
  setupMessage: string;
  overallOk: boolean;
}

export interface ReadinessResult {
  modelId: string;
  executorModelId?: string;
  assessedAt: string;
  overallScore: number;
  passed: boolean;
  qualifyingGatePassed: boolean;
  disqualifiedAt?: string;
  categoryScores: CategoryScore;
  testResults: TestResult[];
  failedTests: string[];
  duration: number;
  mode: 'single' | 'dual';
  trainabilityScores?: {
    systemPromptCompliance: number;
    instructionPersistence: number;
    correctionAcceptance: number;
    overallTrainability: number;
  };
}

export interface TeachingResult {
  success: boolean;
  attempts: number;
  startingScore: number;
  finalScore: number;
  finalLevel: 1 | 2 | 3 | 4;
  prostheticApplied: boolean;
  probesFixed: string[];
  probesRemaining: string[];
  failedTestsByLevel: { level: number; count: number }[];
  improvements: CategoryScore;
  certified: boolean;
  log: string[];
}

export interface LeaderboardEntry {
  rank: number;
  modelId: string;
  executorModelId?: string;
  score: number;
  certified: boolean;
  mode: 'single' | 'dual';
}

export interface BatchResult {
  startedAt: string;
  completedAt: string;
  leaderboard: LeaderboardEntry[];
  bestModel: string | null;
}

export interface Model {
  id: string;
  displayName?: string;
  estimatedVramGB?: number;
}

export interface ReadinessProgress {
  modelId: string;
  current: number;
  total: number;
  currentTest: string;
  currentCategory?: string;
  status: string;
  score: number;
  passed?: boolean;
  mode?: 'single' | 'dual';
  phase?: 'qualifying' | 'discovery';
  attribution?: 'main' | 'executor' | 'loop';
}

export interface BatchProgress {
  currentModel: string | null;
  currentModelIndex: number;
  totalModels: number;
  status: string;
  results: LeaderboardEntry[];
}

export interface ToolCapability {
  tool: string;
  runs: number;
  passes: number;
  avgScore: number;
  avgLatency: number;
}

export type Tab = 'setup' | 'single' | 'dual' | 'batch' | 'capabilities';
