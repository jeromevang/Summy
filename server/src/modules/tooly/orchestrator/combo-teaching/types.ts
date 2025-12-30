export interface ComboTeachingResult {
  success: boolean;
  attempts: number;
  startingScore: number;
  finalScore: number;
  finalLevel: 1 | 2 | 3 | 4;
  prostheticApplied: boolean;
  mainModelId: string;
  executorModelId: string;
  comboId: string;
  comboScoreBefore: number;
  comboScoreAfter: number;
  testsImproved: string[];
  testsRemaining: string[];
  failedTestsByLevel: { level: number; count: number }[];
  improvements: { overall: number; mainCorrect: number; executorSuccess: number };
  certified: boolean;
  log: string[];
}

export interface ComboTeachingOptions {
  maxAttempts?: number;
  startLevel?: 1 | 2 | 3 | 4;
  targetScore?: number;
  lmstudioUrl?: string;
}

export interface BroadcastService {
  broadcastComboTeachingProgress(data: any): void;
  broadcastComboTeachingVerify(data: any): void;
  broadcastComboTeachingComplete(data: any): void;
}
