import type { ProbeEvaluation } from '../types.js';

export interface AgenticReadinessTest {
  id: string;
  name: string;
  category: 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'multi_turn' | 'boundary' | 'fault_injection';
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedToolAny?: string[];
  expectedNoTool?: boolean;
  evaluate: (response: any, toolCalls: any[], conversationHistory?: any[]) => ProbeEvaluation;
}

export interface TestSuiteConfig {
  version: string;
  description: string;
  threshold: number;
  categoryWeights: Record<string, number>;
  tests: any[];
}

export interface ReadinessResult {
  modelId: string;
  assessedAt: string;
  overallScore: number;
  passed: boolean;
  categoryScores: Record<string, number>;
  testResults: any[];
  failedTests: string[];
  duration: number;
}
