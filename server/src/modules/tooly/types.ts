export interface IntentSchema {
  schemaVersion: string;
  action: 'call_tool' | 'respond' | 'ask_clarification' | 'multi_step';
  tool?: string;
  parameters?: Record<string, any>;
  steps?: IntentStep[];
  metadata?: {
    reasoning?: string;
    priority?: 'low' | 'normal' | 'high';
    context?: string;
    response?: string;
    question?: string;
  };
}

export interface IntentStep {
  order: number;
  action: 'call_tool' | 'respond';
  tool?: string;
  parameters?: Record<string, any>;
  waitForResult?: boolean;
}

export interface RouterConfig {
  mainModelId?: string;
  executorModelId?: string;
  enableDualModel: boolean;
  timeout: number;
  provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter';
  settings: {
    lmstudioUrl?: string;
    openaiApiKey?: string;
    azureResourceName?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
    azureApiVersion?: string;
    openrouterApiKey?: string;
  };
}

export interface RoutingPhase {
  phase: 'planning' | 'execution' | 'response';
  systemPrompt: string;
  model: string;
  latencyMs: number;
  reasoning?: string;
}

export interface RoutingResult {
  mode: 'single' | 'dual';
  mainResponse?: any;
  executorResponse?: any;
  finalResponse: any;
  toolCalls?: any[];
  latency: {
    main?: number;
    executor?: number;
    total: number;
  };
  phases: RoutingPhase[];
  intent?: IntentSchema;
}