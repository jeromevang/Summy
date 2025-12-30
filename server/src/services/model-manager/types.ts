export type ModelProvider = 'lmstudio' | 'openai' | 'azure' | 'openrouter';
export type ModelStatus = 'tested' | 'untested' | 'failed' | 'known_good' | 'disabled';
export type ModelRole = 'main' | 'executor' | 'both' | 'none';
export type ModelCategory = 'general' | 'coding' | 'creative' | 'analysis' | 'specialized';

export interface ModelMetadata {
  id: string;
  displayName: string;
  provider: ModelProvider;
  status: ModelStatus;
  role: ModelRole;
  category: ModelCategory;
  score?: number;
  toolScore?: number;
  reasoningScore?: number;
  avgLatency?: number;
  testedAt?: string;
  error?: string;
  maxContextLength?: number;
  trainedForToolUse?: boolean;
  vision?: boolean;
  sizeBytes?: number;
  quantization?: string;
}

export interface ModelDiscoveryResult {
  models: ModelMetadata[];
  providers: { [key in ModelProvider]: boolean };
  lastUpdated: string;
  totalModels: number;
}

export interface ModelHealthCheck {
  modelId: string;
  provider: ModelProvider;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'error';
  responseTime: number;
  timestamp: string;
}
