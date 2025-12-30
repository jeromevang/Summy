export interface ProstheticVersion {
  version: number;
  prompt: string;
  createdAt: string;
  scoreImprovement: number;
  testedAgainst: string[];
}

export interface ProstheticEntry {
  modelId: string;
  prompt: string;
  level: 1 | 2 | 3 | 4;
  probesFixed: string[];
  categoryImprovements: {
    tool?: number;
    rag?: number;
    reasoning?: number;
    intent?: number;
    browser?: number;
  };
  createdAt: string;
  updatedAt: string;
  successfulRuns: number;
  verified: boolean;
  currentVersion: number;
  versions: ProstheticVersion[];
  targetTaskTypes?: string[];
  learnedFromModel?: string;
}

export interface ProstheticStats {
  totalEntries: number;
  verifiedCount: number;
  levelDistribution: Record<number, number>;
  avgSuccessfulRuns: number;
}

export interface DistillationResult {
  success: boolean;
  teacherModelId: string;
  studentModelId: string;
  capability: string;
  teacherScore: number;
  studentScoreBefore: number;
  studentScoreAfter: number;
  prostheticGenerated: string | null;
  patterns: Array<{ name: string; description: string }>;
  message: string;
}

export interface Model {
  id: string;
  displayName?: string;
}

export type Tab = 'library' | 'editor' | 'distill';
