export interface TraceSpan {
  id: string;
  traceId: string;
  parentId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'started' | 'completed' | 'error';
  tags: Record<string, any>;
  logs: TraceLog[];
  error?: TraceError;
}

export interface TraceLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

export interface TraceError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: any;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentId?: string;
  baggage: Record<string, string>;
}

export interface TraceMetrics {
  traceId: string;
  spans: number;
  duration: number;
  errors: number;
  operations: string[];
  startTime: number;
  endTime: number;
}
