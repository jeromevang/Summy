/**
 * Enhanced Logging System
 * Provides a structured and enhanced logging mechanism for the application.
 * This module exports the main logger instance and associated middleware.
 */

import { logger } from './enhanced-logger/EnhancedLogger.js';
import { loggingMiddleware } from './enhanced-logger/middleware.js';
import { LogFileManager } from './enhanced-logger/managers.js'; // Import LogFileManager

/**
 * The main logger instance.
 */
export { logger };

/**
 * Middleware for integrating logging into request/response cycles.
 */
export { loggingMiddleware };

/**
 * The singleton instance of LogFileManager for managing log files.
 */
export { LogFileManager };

/**
 * Default export containing logger and middleware.
 */
export default {
  logger,
  loggingMiddleware,
  LogFileManager // Also export in default for completeness
};