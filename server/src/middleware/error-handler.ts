/**
 * Standardized Error Handling Middleware
 * Improvement #5
 */

import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Log error
  console.error('[Error Handler]', {
    message: err.message,
    code: err.code || 'UNKNOWN',
    statusCode: err.statusCode || 500,
    path: req.path,
    method: req.method,
    requestId: (req as any).id,
    ...(isDev && { stack: err.stack })
  });

  // Send response
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    requestId: (req as any).id,
    ...(isDev && {
      stack: err.stack,
      details: err.details
    })
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
    requestId: (req as any).id
  });
}

/**
 * Async route wrapper
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
