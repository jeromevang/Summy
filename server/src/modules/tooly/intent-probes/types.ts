export interface IntentProbeResult {
  id: string;
  name: string;
  invoked: boolean;
  invokedCorrectly: boolean;
  actionCorrect: boolean;
  score: number;
  details: string;
  toolsInvoked: string[];
  expectedTools: string[];
  response?: string;
}

export interface IntentProbeDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  explicitness: 'implicit' | 'subtle' | 'neutral' | 'explicit';
  shouldInvoke: boolean;
  expectedTools?: string[];
  acceptableTools?: string[];
  forbiddenTools?: string[];
  evaluateIntent: (response: any, toolCalls: any[]) => IntentProbeResult;
}
