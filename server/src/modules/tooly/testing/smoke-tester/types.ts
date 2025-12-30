export interface SmokeTestCase {
  id: string;
  name: string;
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'multi_step' | 'param_extraction' | 'format';
  prompt: string;
  expectedTool?: string;
  expectedNoTool?: boolean;
  evaluate: (response: any, toolCalls: any[]) => { passed: boolean; score: number; details: string };
}

export interface SmokeTestResult {
  testId: string;
  testName: string;
  category: string;
  nativePassed: boolean;
  nativeScore: number;
  nativeLatencyMs: number;
  trainedPassed?: boolean;
  trainedScore?: number;
  trainedLatencyMs?: number;
  trainable: boolean | null;
  details: string;
}

export interface SmokeTestSummary {
  modelId: string;
  testedAt: string;
  durationMs: number;
  passed: boolean;
  overallScore: number;
  nativeCapabilities: string[];
  trainableCapabilities: string[];
  blockedCapabilities: string[];
  categoryScores: Record<string, { native: number; trained: number | null; trainable: boolean | null }>;
  results: SmokeTestResult[];
  recommendation: 'deploy' | 'deploy_with_prosthetic' | 'needs_controller' | 'blocked';
  recommendationReason: string;
}
