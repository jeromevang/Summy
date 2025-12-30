export interface RunnerSettings {
  lmstudioUrl: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
}

export interface TestRunResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
  latency: number;
  attribution?: 'main' | 'executor' | 'both' | null;
}

export interface BroadcastFn {
  broadcastReadinessProgress(data: any): void;
  broadcastBatchReadinessProgress(data: any): void;
}
