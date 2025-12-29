/**
 * Distributed Tracing System
 * Provides comprehensive tracing and observability for the application
 */

import { v4 as uuidv4 } from 'uuid';
import { addDebugEntry } from './logger.js';
import { db } from './database.js';

// ============================================================
// TYPES
// ============================================================

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

// ============================================================
// TRACE MANAGER
// ============================================================

export class TraceManager {
  private static instance: TraceManager;
  private activeSpans: Map<string, TraceSpan> = new Map();
  private traceContext: TraceContext | null = null;
  private isTracingEnabled = process.env.ENABLE_TRACING === 'true';

  private constructor() {}

  static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

  /**
   * Start a new trace
   */
  startTrace(operation: string, baggage: Record<string, string> = {}): TraceContext {
    const traceId = uuidv4();
    const spanId = uuidv4();
    
    this.traceContext = {
      traceId,
      spanId,
      baggage: { ...baggage }
    };

    this.createSpan(operation, spanId, undefined, traceId);

    return this.traceContext;
  }

  /**
   * Start a new span
   */
  startSpan(operation: string, parentId?: string): string {
    if (!this.isTracingEnabled) return '';

    const spanId = uuidv4();
    const traceId = parentId ? this.getTraceIdFromParent(parentId) : this.traceContext?.traceId || uuidv4();

    this.createSpan(operation, spanId, parentId, traceId);

    return spanId;
  }

  /**
   * End a span
   */
  endSpan(spanId: string, error?: Error): void {
    if (!this.isTracingEnabled) return;

    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'completed';
    
    if (error) {
      span.error = this.formatError(error);
      this.logSpan(spanId, 'error', `Span failed: ${error.message}`);
    } else {
      this.logSpan(spanId, 'info', 'Span completed successfully');
    }

    this.saveSpan(span);
    this.activeSpans.delete(spanId);
  }

  /**
   * Add log to span
   */
  logSpan(spanId: string, level: TraceLog['level'], message: string, fields?: Record<string, any>): void {
    if (!this.isTracingEnabled) return;

    const span = this.activeSpans.get(spanId);
    if (!span) return;

    const log: TraceLog = {
      timestamp: Date.now(),
      level,
      message,
      fields
    };

    span.logs.push(log);

    // Also log to debug system
    addDebugEntry('request', `Trace: ${message}`, {
      spanId,
      traceId: span.traceId,
      level,
      fields
    });
  }

  /**
   * Add tag to span
   */
  addTag(spanId: string, key: string, value: any): void {
    if (!this.isTracingEnabled) return;

    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.tags[key] = value;
  }

  /**
   * Get current trace context
   */
  getTraceContext(): TraceContext | null {
    return this.traceContext;
  }

  /**
   * Set trace context (for distributed tracing)
   */
  setTraceContext(context: TraceContext): void {
    this.traceContext = context;
  }

  /**
   * Clear trace context
   */
  clearTraceContext(): void {
    this.traceContext = null;
  }

  /**
   * Get trace metrics
   */
  async getTraceMetrics(traceId: string): Promise<TraceMetrics | null> {
    try {
      const spans = await db.query<TraceSpan>('SELECT * FROM trace_spans WHERE trace_id = ?', [traceId]);
      
      if (spans.length === 0) return null;

      const operations = spans.map(s => s.operation);
      const errors = spans.filter(s => s.status === 'error').length;
      const duration = spans.reduce((max, span) => 
        Math.max(max, span.duration || 0), 0
      );

      return {
        traceId,
        spans: spans.length,
        duration,
        errors,
        operations,
        startTime: Math.min(...spans.map(s => s.startTime)),
        endTime: Math.max(...spans.map(s => s.endTime || s.startTime))
      };
    } catch (error) {
      addDebugEntry('error', `Failed to get trace metrics: ${error}`);
      return null;
    }
  }

  /**
   * Get all active traces
   */
  getActiveTraces(): TraceSpan[] {
    return Array.from(this.activeSpans.values());
  }

  /**
   * Clear all active spans
   */
  clearActiveSpans(): void {
    this.activeSpans.clear();
  }

  // Private methods
  private createSpan(operation: string, spanId: string, parentId: string | undefined, traceId: string): void {
    const span: TraceSpan = {
      id: spanId,
      traceId,
      parentId,
      operation,
      startTime: Date.now(),
      status: 'started',
      tags: {},
      logs: []
    };

    this.activeSpans.set(spanId, span);
  }

  private getTraceIdFromParent(parentId: string): string {
    const parentSpan = this.activeSpans.get(parentId);
    return parentSpan?.traceId || uuidv4();
  }

  private formatError(error: Error): TraceError {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
      details: (error as any).details
    };
  }

  private async saveSpan(span: TraceSpan): Promise<void> {
    try {
      // Save to database
      await db.insert(`
        INSERT INTO trace_spans (
          id, trace_id, parent_id, operation, start_time, end_time, duration, status, tags, logs, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        span.id,
        span.traceId,
        span.parentId,
        span.operation,
        span.startTime,
        span.endTime,
        span.duration,
        span.status,
        JSON.stringify(span.tags),
        JSON.stringify(span.logs),
        span.error ? JSON.stringify(span.error) : null
      ]);
    } catch (error) {
      addDebugEntry('error', `Failed to save span: ${error}`);
    }
  }
}

// ============================================================
// TRACING MIDDLEWARE
// ============================================================

export const tracingMiddleware = (req: any, res: any, next: any): void => {
  const traceManager = TraceManager.getInstance();
  
  // Extract trace context from headers
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const parentId = req.headers['x-span-id'];
  const baggageStr = req.headers['x-baggage'];
  
  let baggage = {};
  try {
    baggage = baggageStr ? JSON.parse(baggageStr) : {};
  } catch (error) {
    // Ignore invalid baggage
  }

  // Create trace context
  const traceContext: TraceContext = {
    traceId,
    spanId: uuidv4(),
    parentId,
    baggage
  };

  traceManager.setTraceContext(traceContext);

  // Start span for this request
  const spanId = traceManager.startSpan(`${req.method} ${req.path}`, parentId);
  
  // Add request information as tags
  traceManager.addTag(spanId, 'http.method', req.method);
  traceManager.addTag(spanId, 'http.path', req.path);
  traceManager.addTag(spanId, 'http.user_agent', req.get('User-Agent'));
  traceManager.addTag(spanId, 'http.client_ip', req.ip);

  // Override res.end to capture response information
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding: any) {
    // Add response information
    traceManager.addTag(spanId, 'http.status_code', res.statusCode);
    traceManager.addTag(spanId, 'http.content_length', res.get('Content-Length') || 0);
    
    // End the span
    if (res.statusCode >= 400) {
      const error = new Error(`HTTP ${res.statusCode}`);
      traceManager.endSpan(spanId, error);
    } else {
      traceManager.endSpan(spanId);
    }

    // Restore original end and call it
    res.end = originalEnd;
    res.end(chunk, encoding);
  };

  // Store span ID in request for use in handlers
  req.traceSpanId = spanId;
  req.traceContext = traceContext;

  next();
};

// ============================================================
// TRACING DECORATORS
// ============================================================

export function traceOperation(operationName?: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const traceManager = TraceManager.getInstance();
      const spanName = operationName || `${target.constructor.name}.${propertyKey}`;
      
      const spanId = traceManager.startSpan(spanName);
      traceManager.logSpan(spanId, 'info', `Starting ${spanName}`);

      try {
        const result = await originalMethod.apply(this, args);
        traceManager.endSpan(spanId);
        return result;
      } catch (error) {
        traceManager.logSpan(spanId, 'error', `Error in ${spanName}: ${error.message}`);
        traceManager.endSpan(spanId, error);
        throw error;
      }
    };

    return descriptor;
  };
}

// ============================================================
// TRACING UTILITIES
// ============================================================

export class TracingUtils {
  /**
   * Create a child span within a function
   */
  static async withSpan<T>(
    operation: string, 
    fn: (spanId: string) => Promise<T>
  ): Promise<T> {
    const traceManager = TraceManager.getInstance();
    const spanId = traceManager.startSpan(operation);
    
    try {
      const result = await fn(spanId);
      traceManager.endSpan(spanId);
      return result;
    } catch (error) {
      traceManager.endSpan(spanId, error);
      throw error;
    }
  }

  /**
   * Add baggage to current trace
   */
  static addBaggage(key: string, value: string): void {
    const traceManager = TraceManager.getInstance();
    const context = traceManager.getTraceContext();
    
    if (context) {
      context.baggage[key] = value;
      traceManager.setTraceContext(context);
    }
  }

  /**
   * Get baggage from current trace
   */
  static getBaggage(key: string): string | undefined {
    const traceManager = TraceManager.getInstance();
    const context = traceManager.getTraceContext();
    
    return context?.baggage[key];
  }

  /**
   * Inject trace context into headers
   */
  static injectHeaders(): Record<string, string> {
    const traceManager = TraceManager.getInstance();
    const context = traceManager.getTraceContext();
    
    if (!context) return {};

    return {
      'x-trace-id': context.traceId,
      'x-span-id': context.spanId,
      'x-baggage': JSON.stringify(context.baggage)
    };
  }

  /**
   * Extract trace context from headers
   */
  static extractHeaders(headers: Record<string, string>): TraceContext | null {
    const traceId = headers['x-trace-id'];
    const spanId = headers['x-span-id'];
    const baggageStr = headers['x-baggage'];

    if (!traceId || !spanId) return null;

    let baggage = {};
    try {
      baggage = baggageStr ? JSON.parse(baggageStr) : {};
    } catch (error) {
      // Ignore invalid baggage
    }

    return {
      traceId,
      spanId,
      parentId: headers['x-parent-id'],
      baggage
    };
  }
}

// ============================================================
// TRACE STORAGE
// ============================================================

export class TraceStorage {
  /**
   * Initialize trace storage
   */
  static async initialize(): Promise<void> {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS trace_spans (
          id TEXT PRIMARY KEY,
          trace_id TEXT NOT NULL,
          parent_id TEXT,
          operation TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          status TEXT NOT NULL,
          tags TEXT,
          logs TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.exec('CREATE INDEX IF NOT EXISTS idx_trace_spans_trace_id ON trace_spans(trace_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_trace_spans_operation ON trace_spans(operation)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_trace_spans_status ON trace_spans(status)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_trace_spans_start_time ON trace_spans(start_time)');
    } catch (error) {
      addDebugEntry('error', `Failed to initialize trace storage: ${error}`);
    }
  }

  /**
   * Get trace by ID
   */
  static async getTrace(traceId: string): Promise<TraceSpan[]> {
    return await db.query<TraceSpan>('SELECT * FROM trace_spans WHERE trace_id = ? ORDER BY start_time', [traceId]);
  }

  /**
   * Get spans by operation
   */
  static async getSpansByOperation(operation: string, limit: number = 100): Promise<TraceSpan[]> {
    return await db.query<TraceSpan>(
      'SELECT * FROM trace_spans WHERE operation = ? ORDER BY start_time DESC LIMIT ?', 
      [operation, limit]
    );
  }

  /**
   * Get error spans
   */
  static async getErrorSpans(limit: number = 100): Promise<TraceSpan[]> {
    return await db.query<TraceSpan>(
      'SELECT * FROM trace_spans WHERE status = "error" ORDER BY start_time DESC LIMIT ?', 
      [limit]
    );
  }

  /**
   * Clean old traces
   */
  static async cleanupOldTraces(days: number = 7): Promise<number> {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const result = await db.delete(
      'DELETE FROM trace_spans WHERE start_time < ?',
      [cutoff]
    );

    return result;
  }

  /**
   * Get trace statistics
   */
  static async getTraceStats(): Promise<{
    totalSpans: number;
    errorRate: number;
    avgDuration: number;
    operations: string[];
  }> {
    const totalSpans = await db.get<number>('SELECT COUNT(*) as count FROM trace_spans', []);
    const errorCount = await db.get<number>('SELECT COUNT(*) as count FROM trace_spans WHERE status = "error"', []);
    const avgDuration = await db.get<number>('SELECT AVG(duration) as avg FROM trace_spans WHERE duration IS NOT NULL', []);
    const operations = await db.query<{ operation: string }>('SELECT DISTINCT operation FROM trace_spans', []);

    return {
      totalSpans: totalSpans || 0,
      errorRate: totalSpans ? (errorCount / totalSpans) * 100 : 0,
      avgDuration: avgDuration || 0,
      operations: operations.map(o => o.operation)
    };
  }
}

// Export singleton instance
export const traceManager = TraceManager.getInstance();

// Export for convenience
export default {
  traceManager,
  tracingMiddleware,
  traceOperation,
  TracingUtils,
  TraceStorage
};
