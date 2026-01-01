import { logger } from './EnhancedLogger.js';

export const loggingMiddleware = (req: any, res: any, next: any): void => {
  req.logger = logger;
  const _startTime = Date.now();
  const _originalEnd = res.end;

  const _requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    req.logger.info(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};
