export interface QueryAnalysis {
  queryType: 'code_question' | 'file_operation' | 'git_operation' | 'explanation' | 'generation' | 'debug';
  complexity: 'simple' | 'medium' | 'complex';
  requiresRag: boolean;
  requiresHistory: boolean;
  estimatedResponseTokens: number;
}

export interface Turn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
}

export interface OptimizedContext {
  systemPrompt: string;
  toolSchemas: any[];
  memories: string[];
  ragResults: string[];
  history: Turn[];
  currentQuery: string;
  totalTokens: number;
  breakdown: Record<string, number>;
  warnings: string[];
}
