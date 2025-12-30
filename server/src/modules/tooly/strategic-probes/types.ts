export interface ProbeTestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  score: number;
  latency: number;
  details: string;
  response?: any;
  expectedBehavior?: string;
  variants?: ProbeVariantResult[];
}

export interface ProbeVariantResult {
  id: string;
  prompt: string;
  passed: boolean;
  score: number;
  response?: string;
}

export interface ProbeCategory {
  id: string;
  name: string;
  icon: string;
  probes: ProbeDefinition[];
}

export interface ProbeDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  expectedTool?: string;
  expectedFiles?: string[];
  expectedBehavior: string;
  evaluate: (response: any, toolCalls: any[]) => { passed: boolean; score: number; details: string };
  variants?: Array<{
    id: string;
    prompt: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>;
}
