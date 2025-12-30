export type FailureCategory = 'tool' | 'rag' | 'reasoning' | 'intent' | 'browser' | 'unknown' | 'combo_pairing';

export interface FailureEntry {
  id: string;
  timestamp: string;
  modelId: string;
  executorModelId?: string;
  category: FailureCategory;
  tool?: string;
  error: string;
  errorType: string;
  context: {
    query: string;
    queryHash: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    toolCallAttempted?: string;
    conversationLength: number;
  };
  pattern?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  category: FailureCategory;
  count: number;
  firstSeen: string;
  lastSeen: string;
  examples: string[];
  suggestedFix?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface FailureLogData {
  version: number;
  entries: FailureEntry[];
  patterns: Record<string, FailurePattern>;
  stats: {
    totalFailures: number;
    resolvedFailures: number;
    lastUpdated: string;
    failuresByCategory: Record<FailureCategory, number>;
    failuresByModel: Record<string, number>;
  };
}
