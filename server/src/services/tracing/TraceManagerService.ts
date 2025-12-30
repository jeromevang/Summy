import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { TraceSpan, TraceContext } from './types.js';

export class TraceManager {
  private static instance: TraceManager;
  private activeSpans: Map<string, TraceSpan> = new Map();

  static getInstance(): TraceManager {
    if (!TraceManager.instance) TraceManager.instance = new TraceManager();
    return TraceManager.instance;
  }

  startSpan(operation: string, parentId?: string): string {
    const spanId = uuidv4();
    const traceId = uuidv4();
    const span: TraceSpan = { id: spanId, traceId, parentId, operation, startTime: Date.now(), status: 'started', tags: {}, logs: [] };
    this.activeSpans.set(spanId, span);
    return spanId;
  }

  endSpan(spanId: string): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.status = 'completed';
      this.activeSpans.delete(spanId);
    }
  }
}

export const traceManager = TraceManager.getInstance();
