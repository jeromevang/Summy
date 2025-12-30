export type ModelStatus = 'tested' | 'untested' | 'failed' | 'known_good';

export interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  status: ModelStatus;
  score?: number;
  toolScore?: number;
  reasoningScore?: number;
  toolCount?: number;
  totalTools?: number;
  avgLatency?: number;
  testedAt?: string;
  error?: string;
  role?: 'main' | 'executor' | 'both' | 'none';
  maxContextLength?: number;
  trainedForToolUse?: boolean;
  vision?: boolean;
  sizeBytes?: number;
  quantization?: string;
}

export interface ModelDiscoveryResult {
  lmstudio: DiscoveredModel[];
  openai: DiscoveredModel[];
  azure: DiscoveredModel[];
  openrouter: DiscoveredModel[];
  lastUpdated: string;
}
