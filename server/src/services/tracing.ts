/**
 * Distributed Tracing System
 */

export * from './tracing/index.js';
import { traceManager } from './tracing/TraceManagerService.js';
import { Request, Response, NextFunction } from 'express';

export class TraceStorage {
  static async initialize() {
    console.log('[Tracing] Initializing trace storage...');
    // Real implementation would ensure DB tables exist
    return true;
  }
}

export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const traceId = req.headers['x-trace-id'] as string || `trace-${Date.now()}`;
  (req as any).traceId = traceId;
  next();
};

export { traceManager };
export default traceManager;