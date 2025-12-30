/**
 * Enhanced Logging System
 */

export * from './enhanced-logger/index.js';
import { logger } from './enhanced-logger/EnhancedLogger.js';
import { loggingMiddleware } from './enhanced-logger/middleware.js';

export { logger, loggingMiddleware };
export default {
  logger,
  loggingMiddleware
};