import { wsBroadcast } from '../../../../services/ws-broadcast.js';
import { Trace, Span } from './types.js';

let activeTraces: Map<string, Trace> = new Map();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function startTrace(requestId: string, modelId: string): string {
  const traceId = generateId();
  const trace: Trace = { traceId, requestId, modelId, startTime: Date.now(), spans: [] };
  activeTraces.set(traceId, trace);
  wsBroadcast.broadcast('trace_start', { traceId, requestId, modelId, startTime: trace.startTime });
  return traceId;
}

export function startSpan(traceId: string, operation: string, parentSpanId?: string, attributes: Record<string, any> = {}): string {
  const trace = activeTraces.get(traceId);
  if (!trace) return '';
  const spanId = generateId();
  const span: Span = { spanId, parentSpanId, traceId, operation, startTime: Date.now(), status: 'running', attributes };
  trace.spans.push(span);
  wsBroadcast.broadcast('span_start', { traceId, spanId, operation, parentSpanId, attributes });
  return spanId;
}

export function endSpan(traceId: string, spanId: string, status: 'success' | 'error' = 'success', attributes: Record<string, any> = {}): void {
  const trace = activeTraces.get(traceId);
  if (!trace) return;
  const span = trace.spans.find(s => s.spanId === spanId);
  if (!span) return;
  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  span.status = status;
  span.attributes = { ...span.attributes, ...attributes };
  wsBroadcast.broadcast('span_end', { traceId, spanId, operation: span.operation, durationMs: span.durationMs, status, attributes: span.attributes });
}

export function endTrace(traceId: string): Trace | undefined {
  const trace = activeTraces.get(traceId);
  if (!trace) return undefined;
  trace.endTime = Date.now();
  const totalDuration = trace.endTime - trace.startTime;
  wsBroadcast.broadcast('trace_end', { traceId, requestId: trace.requestId, modelId: trace.modelId, totalDurationMs: totalDuration, spanCount: trace.spans.length, spans: trace.spans.map(s => ({ operation: s.operation, durationMs: s.durationMs, status: s.status })) });
  activeTraces.delete(traceId);
  return trace;
}

export function getActiveTrace(traceId: string): Trace | undefined {
  return activeTraces.get(traceId);
}
