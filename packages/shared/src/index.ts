import { z } from 'zod';

// ==========================================
// Base Schemas
// ==========================================
export const ModelIdSchema = z.string().min(1, 'Model ID is required').max(500, 'Model ID too long');
export const ProviderSchema = z.enum(['all', 'lmstudio', 'openai', 'azure', 'openrouter', 'ollama']).default('all');
export const BooleanSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return undefined;
}, z.boolean().default(false));

// ==========================================
// Business Schemas
// ==========================================
export const TestExecutionSchema = z.object({
  modelId: ModelIdSchema,
  provider: ProviderSchema,
  runLatencyProfile: BooleanSchema,
  isBaseline: BooleanSchema,
  runCount: z.number().int().min(1).max(10).default(1)
});

export const ProbeExecutionSchema = z.object({
  modelId: ModelIdSchema,
  categories: z.array(z.string()).optional(),
  mode: z.enum(['quick', 'full']).default('full'),
  isBaseline: BooleanSchema
});

export const ComboTestSchema = z.object({
  mainModelId: ModelIdSchema,
  executorModelId: ModelIdSchema,
  runCount: z.number().int().min(1).max(10).default(1),
  includeQualifyingGate: BooleanSchema
});

export const FailureLogSchema = z.object({
  modelId: ModelIdSchema,
  executorModelId: ModelIdSchema.optional(),
  category: z.enum(['tool', 'intent', 'rag', 'reasoning', 'architectural', 'navigation', 'proactive', 'helicopter']).optional(),
  tool: z.string().optional(),
  error: z.string().min(1, 'Error message is required'),
  query: z.string().min(5, 'Query must be at least 5 characters'),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional()
});

// ==========================================
// Types
// ==========================================
export interface ServerSettings {
    provider: 'openai' | 'azure' | 'lmstudio' | 'openrouter';
    openaiModel: string;
    azureResourceName: string;
    azureDeploymentName: string;
    azureApiKey: string;
    azureApiVersion: string;
    lmstudioUrl: string;
    lmstudioModel: string;
    openrouterApiKey: string;
    openrouterModel: string;
    defaultCompressionMode: 0 | 1 | 2 | 3;
    defaultKeepRecent: number;
    defaultContextLength?: number;
    proxyMode?: 'passthrough' | 'summy' | 'tooly' | 'both';
    enableDualModel?: boolean;
    mainModelId?: string;
    executorModelId?: string;
    ollamaModel?: string;
    ollamaUrl?: string;
}

export type SymbolType = 
  | 'function' | 'class' | 'interface' | 'type' | 'enum' 
  | 'variable' | 'constant' | 'method' | 'property' | 'constructor'
  | 'module' | 'namespace' | 'export' | 'import';
