export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string;
  success: boolean;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  operation: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'running' | 'success' | 'error';
  attributes: Record<string, any>;
}

export interface Trace {
  traceId: string;
  requestId: string;
  modelId: string;
  startTime: number;
  endTime?: number;
  spans: Span[];
}
