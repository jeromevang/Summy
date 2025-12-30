export interface CompressionConfig {
  mode: 0 | 1 | 2 | 3;
  keepRecent: number;
  enabled: boolean;
  lastCompressed?: string;
  stats?: {
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  };
  systemPrompt?: string | null;
}

export interface ContextSession {
  id: string;
  name: string;
  ide: string;
  created: string;
  conversations: ConversationTurn[];
  compression?: CompressionConfig;
  compressedConversations?: any[];
}

export interface ToolyPhase {
  phase: 'planning' | 'execution' | 'response';
  systemPrompt: string;
  model: string;
  latencyMs: number;
  reasoning?: string;
}

export interface ToolyToolCallMeta {
  id: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'success' | 'failed' | 'timeout' | 'pending';
  latencyMs?: number;
  error?: string;
}

export interface ToolyMeta {
  mode?: 'single' | 'dual' | 'passthrough';
  phases?: ToolyPhase[];
  toolCalls?: ToolyToolCallMeta[];
  totalLatencyMs?: number;
  agenticLoop?: boolean;
  toolExecutions?: Array<{
    toolName: string;
    mcpTool: string;
    args: any;
    result: string;
    toolCallId: string;
    isError?: boolean;
  }>;
  iterations?: number;
  initialIntent?: string;
}

export interface ConversationTurn {
  id: string;
  timestamp: string;
  request: {
    messages: Array<{ 
      role: string; 
      content: string; 
      tool_calls?: any[];
      tool_call_id?: string;
      name?: string;
    }>;
    model?: string;
  };
  response: {
    type?: string;
    content?: string;
    model?: string;
    usage?: { total_tokens?: number };
    finish_reason?: string;
    choices?: Array<{ message?: { content: string; role: string; tool_calls?: any[] }; finish_reason?: string }>;
    toolyMeta?: ToolyMeta;
  };
  toolyMeta?: ToolyMeta;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResultInfo {
  tool_call_id: string;
  content: string;
  name?: string;
  isError?: boolean;
}

export interface CompressionVersion {
  messages: any[];
  stats: { originalTokens: number; compressedTokens: number; ratio: number };
}

export interface CompressionVersions {
  none: CompressionVersion;
  light: CompressionVersion;
  medium: CompressionVersion;
  aggressive: CompressionVersion;
}
