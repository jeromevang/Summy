/**
 * Request ID Tracking Middleware
 * Improvement #13
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();

  // Attach to request
  (req as any).id = requestId;

  // Add to response headers
  res.setHeader('X-Request-ID', requestId);

  next();
}
