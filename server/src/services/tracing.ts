/**
 * Distributed Tracing System
 * Provides functionality for distributed tracing, including middleware and trace management.
 */

import { traceManager } from './tracing/TraceManagerService.js';
import { Request, Response, NextFunction } from 'express';

/**
 * Manages the initialization of trace storage.
 * This is a placeholder for actual database or storage initialization for traces.
 */
export class TraceStorage {
  /**
   * Initializes the trace storage system.
   * In a real implementation, this would set up database tables or other storage mechanisms.
   * @returns A promise that resolves to true upon successful initialization.
   */
  static async initialize(): Promise<boolean> {
    console.log('[Tracing] Initializing trace storage...');
    // Real implementation would ensure DB tables exist
    return true;
  }
}

/**
 * Express middleware for initiating and propagating trace IDs.
 * If an 'x-trace-id' header is present, it uses that; otherwise, it generates a new one.
 * The trace ID is attached to the request object.
 * @param req - The Express request object.
 * @param _res - The Express response object (unused).
 * @param next - The next middleware function in the stack.
 */
export const tracingMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const traceId = req.headers['x-trace-id'] as string || `trace-${Date.now()}`;
  (req as any).traceId = traceId; // Attach traceId to the request object
  next();
};

/**
 * The singleton instance of the Trace Manager Service.
 */
export { traceManager };

/**
 * Default export of the traceManager instance.
 */
export default traceManager;