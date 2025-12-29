/**
 * Standardized Error Handling System
 * Provides consistent error handling across the application
 */

import { Request, Response, NextFunction } from 'express';
import { addDebugEntry } from './logger.js';

// ============================================================
// ERROR TYPES
// ============================================================

export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  CONFLICT = 'CONFLICT_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  DATABASE = 'DATABASE_ERROR',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE_ERROR',
  MODEL = 'MODEL_ERROR',
  CACHE = 'CACHE_ERROR',
  FILE_SYSTEM = 'FILE_SYSTEM_ERROR',
  NETWORK = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR'
}

export interface ApplicationError extends Error {
  type: ErrorType;
  statusCode: number;
  code?: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  stack?: string;
}

// ============================================================
// ERROR CLASSES
// ============================================================

export class AppError extends Error implements ApplicationError {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    type: ErrorType,
    statusCode: number,
    code?: string,
    details?: any,
    requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.VALIDATION, 400, 'VALIDATION_ERROR', details, requestId);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: any, requestId?: string) {
    super(message, ErrorType.AUTHENTICATION, 401, 'AUTH_ERROR', details, requestId);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', details?: any, requestId?: string) {
    super(message, ErrorType.AUTHORIZATION, 403, 'AUTHZ_ERROR', details, requestId);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.NOT_FOUND, 404, 'NOT_FOUND', details, requestId);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.CONFLICT, 409, 'CONFLICT', details, requestId);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.TIMEOUT, 408, 'TIMEOUT', details, requestId);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any, requestId?: string) {
    super(message, ErrorType.RATE_LIMIT, 429, 'RATE_LIMIT', details, requestId);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.DATABASE, 500, 'DB_ERROR', details, requestId);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.EXTERNAL_SERVICE, 502, 'EXTERNAL_SERVICE_ERROR', details, requestId);
  }
}

export class ModelError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.MODEL, 500, 'MODEL_ERROR', details, requestId);
  }
}

export class CacheError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.CACHE, 500, 'CACHE_ERROR', details, requestId);
  }
}

export class FileSystemError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.FILE_SYSTEM, 500, 'FS_ERROR', details, requestId);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.NETWORK, 500, 'NETWORK_ERROR', details, requestId);
  }
}

// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  let error: ApplicationError;

  // Handle known error types
  if (err instanceof AppError) {
    error = err;
  } else {
    // Handle unknown errors
    error = new AppError(
      'An unexpected error occurred',
      ErrorType.UNKNOWN,
      500,
      'INTERNAL_ERROR',
      { originalError: err.message },
      req.headers['x-request-id'] as string
    );
  }

  // Log error
  addDebugEntry('error', `${error.type}: ${error.message}`, {
    error: {
      type: error.type,
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
      timestamp: error.timestamp,
      requestId: error.requestId
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    },
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });

  // Send error response
  const errorResponse = {
    success: false,
    error: {
      type: error.type,
      message: error.message,
      code: error.code,
      timestamp: error.timestamp,
      requestId: error.requestId
    }
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = error.details;
    errorResponse.error.stack = error.stack;
  }

  res.status(error.statusCode).json(errorResponse);
};

// ============================================================
// ASYNC ERROR WRAPPER
// ============================================================

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================================
// ERROR RESPONSE FORMATTER
// ============================================================

export const formatErrorResponse = (error: ApplicationError, includeStack: boolean = false) => {
  const response = {
    success: false,
    error: {
      type: error.type,
      message: error.message,
      code: error.code,
      timestamp: error.timestamp,
      requestId: error.requestId
    }
  };

  if (includeStack && process.env.NODE_ENV === 'development') {
    response.error.details = error.details;
    response.error.stack = error.stack;
  }

  return response;
};

// ============================================================
// ERROR CONTEXT ENHANCER
// ============================================================

export const enhanceErrorContext = (error: ApplicationError, context: any): ApplicationError => {
  return new AppError(
    error.message,
    error.type,
    error.statusCode,
    error.code,
    { ...error.details, ...context },
    error.requestId
  );
};

// ============================================================
// ERROR RECOVERY STRATEGIES
// ============================================================

export enum RecoveryStrategy {
  RETRY = 'RETRY',
  FALLBACK = 'FALLBACK',
  SKIP = 'SKIP',
  FAIL = 'FAIL'
}

export interface ErrorRecoveryConfig {
  maxRetries: number;
  retryDelay: number;
  strategy: RecoveryStrategy;
  fallbackValue?: any;
}

export const createErrorRecovery = (config: ErrorRecoveryConfig) => {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === config.maxRetries) {
          break;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, config.retryDelay * (attempt + 1)));
      }
    }

    // Handle final failure
    switch (config.strategy) {
      case RecoveryStrategy.FALLBACK:
        return config.fallbackValue;
      case RecoveryStrategy.SKIP:
        throw new AppError('Operation skipped due to repeated failures', ErrorType.UNKNOWN, 500);
      case RecoveryStrategy.FAIL:
      default:
        throw lastError;
    }
  };
};

// ============================================================
// ERROR MONITORING
// ============================================================

export interface ErrorReport {
  type: ErrorType;
  message: string;
  statusCode: number;
  timestamp: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  stack?: string;
  details?: any;
}

export class ErrorMonitor {
  private static reports: ErrorReport[] = [];

  static report(error: ApplicationError, req?: Request): void {
    const report: ErrorReport = {
      type: error.type,
      message: error.message,
      statusCode: error.statusCode,
      timestamp: error.timestamp,
      requestId: error.requestId,
      userAgent: req?.get('User-Agent'),
      ip: req?.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      details: error.details
    };

    this.reports.push(report);

    // Keep only last 1000 reports
    if (this.reports.length > 1000) {
      this.reports.shift();
    }

    // Log critical errors
    if (error.statusCode >= 500) {
      console.error('CRITICAL ERROR:', report);
    }
  }

  static getReports(): ErrorReport[] {
    return this.reports;
  }

  static getErrorStats(): {
    total: number;
    byType: Record<ErrorType, number>;
    byStatusCode: Record<number, number>;
    recent: ErrorReport[];
  } {
    const total = this.reports.length;
    const byType = {} as Record<ErrorType, number>;
    const byStatusCode = {} as Record<number, number>;

    this.reports.forEach(report => {
      byType[report.type] = (byType[report.type] || 0) + 1;
      byStatusCode[report.statusCode] = (byStatusCode[report.statusCode] || 0) + 1;
    });

    const recent = this.reports.slice(-10);

    return { total, byType, byStatusCode, recent };
  }

  static clearReports(): void {
    this.reports = [];
  }
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

export const validateRequired = (value: any, field: string, requestId?: string): void => {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${field} is required`, { field }, requestId);
  }
};

export const validateArray = (value: any, field: string, requestId?: string): void => {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`, { field }, requestId);
  }
};

export const validateString = (value: any, field: string, minLength?: number, maxLength?: number, requestId?: string): void => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, { field }, requestId);
  }
  if (minLength && value.length < minLength) {
    throw new ValidationError(`${field} must be at least ${minLength} characters`, { field, minLength }, requestId);
  }
  if (maxLength && value.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`, { field, maxLength }, requestId);
  }
};

export const validateNumber = (value: any, field: string, min?: number, max?: number, requestId?: string): void => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${field} must be a number`, { field }, requestId);
  }
  if (min !== undefined && value < min) {
    throw new ValidationError(`${field} must be at least ${min}`, { field, min }, requestId);
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(`${field} must be at most ${max}`, { field, max }, requestId);
  }
};

export const validateEnum = <T>(value: any, field: string, validValues: T[], requestId?: string): void => {
  if (!validValues.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${validValues.join(', ')}`, { field, validValues }, requestId);
  }
};

export const validateUUID = (value: string, field: string, requestId?: string): void => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`${field} must be a valid UUID`, { field }, requestId);
  }
};

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  TimeoutError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  ModelError,
  CacheError,
  FileSystemError,
  NetworkError,
  errorHandler,
  asyncHandler,
  formatErrorResponse,
  enhanceErrorContext,
  createErrorRecovery,
  ErrorMonitor,
  validateRequired,
  validateArray,
  validateString,
  validateNumber,
  validateEnum,
  validateUUID
};