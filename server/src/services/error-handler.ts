/**
 * Standardized Error Handling System
 * Provides consistent error handling across the application, including custom error types,
 * middleware, and utilities for validation, monitoring, and recovery.
 */

import { Request, Response, NextFunction } from 'express';
import { addDebugEntry } from './logger.js';

// ============================================================
// ERROR TYPES
// ============================================================

/**
 * Defines standardized types of errors that can occur within the application.
 */
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

/**
 * Interface representing a standardized application error.
 */
export interface ApplicationError extends Error {
  /** The type of error, defined by `ErrorType`. */
  type: ErrorType;
  /** The HTTP status code associated with the error. */
  statusCode: number;
  /** An optional, machine-readable error code. */
  code?: string;
  /** Optional detailed information about the error. */
  details?: any;
  /** The ISO timestamp when the error occurred. */
  timestamp: string;
  /** An optional request ID for tracing. */
  requestId?: string;
  /** The stack trace of the error. */
  stack?: string;
}

// ============================================================
// ERROR CLASSES
// ============================================================

/**
 * Base class for all custom application errors.
 * Extends the native `Error` class and adds structured error information.
 */
export class AppError extends Error implements ApplicationError {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly timestamp: string;
  public readonly requestId?: string;

  /**
   * Creates an instance of AppError.
   * @param message - A human-readable error message.
   * @param type - The standardized type of the error.
   * @param statusCode - The HTTP status code.
   * @param code - An optional machine-readable error code.
   * @param details - Optional detailed information about the error.
   * @param requestId - An optional request ID for tracing.
   */
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

    // Capture stack trace, excluding the constructor call
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Represents a validation error (HTTP 400).
 */
export class ValidationError extends AppError {
  /**
   * Creates an instance of ValidationError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information about the validation failure.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.VALIDATION, 400, 'VALIDATION_ERROR', details, requestId);
  }
}

/**
 * Represents an authentication error (HTTP 401).
 */
export class AuthenticationError extends AppError {
  /**
   * Creates an instance of AuthenticationError.
   * @param message - A human-readable error message. Defaults to 'Authentication required'.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string = 'Authentication required', details?: any, requestId?: string) {
    super(message, ErrorType.AUTHENTICATION, 401, 'AUTH_ERROR', details, requestId);
  }
}

/**
 * Represents an authorization error (HTTP 403).
 */
export class AuthorizationError extends AppError {
  /**
   * Creates an instance of AuthorizationError.
   * @param message - A human-readable error message. Defaults to 'Access denied'.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string = 'Access denied', details?: any, requestId?: string) {
    super(message, ErrorType.AUTHORIZATION, 403, 'AUTHZ_ERROR', details, requestId);
  }
}

/**
 * Represents a "not found" error (HTTP 404).
 */
export class NotFoundError extends AppError {
  /**
   * Creates an instance of NotFoundError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.NOT_FOUND, 404, 'NOT_FOUND', details, requestId);
  }
}

/**
 * Represents a conflict error (HTTP 409).
 */
export class ConflictError extends AppError {
  /**
   * Creates an instance of ConflictError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.CONFLICT, 409, 'CONFLICT', details, requestId);
  }
}

/**
 * Represents a timeout error (HTTP 408).
 */
export class TimeoutError extends AppError {
  /**
   * Creates an instance of TimeoutError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.TIMEOUT, 408, 'TIMEOUT', details, requestId);
  }
}

/**
 * Represents a rate limit exceeded error (HTTP 429).
 */
export class RateLimitError extends AppError {
  /**
   * Creates an instance of RateLimitError.
   * @param message - A human-readable error message. Defaults to 'Rate limit exceeded'.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string = 'Rate limit exceeded', details?: any, requestId?: string) {
    super(message, ErrorType.RATE_LIMIT, 429, 'RATE_LIMIT', details, requestId);
  }
}

/**
 * Represents a database-related error (HTTP 500).
 */
export class DatabaseError extends AppError {
  /**
   * Creates an instance of DatabaseError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.DATABASE, 500, 'DB_ERROR', details, requestId);
  }
}

/**
 * Represents an error from an external service dependency (HTTP 502).
 */
export class ExternalServiceError extends AppError {
  /**
   * Creates an instance of ExternalServiceError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.EXTERNAL_SERVICE, 502, 'EXTERNAL_SERVICE_ERROR', details, requestId);
  }
}

/**
 * Represents an error specifically related to model operations (e.g., LLM inference, loading) (HTTP 500).
 */
export class ModelError extends AppError {
  /**
   * Creates an instance of ModelError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.MODEL, 500, 'MODEL_ERROR', details, requestId);
  }
}

/**
 * Represents an error related to caching operations (HTTP 500).
 */
export class CacheError extends AppError {
  /**
   * Creates an instance of CacheError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.CACHE, 500, 'CACHE_ERROR', details, requestId);
  }
}

/**
 * Represents an error related to file system operations (HTTP 500).
 */
export class FileSystemError extends AppError {
  /**
   * Creates an instance of FileSystemError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.FILE_SYSTEM, 500, 'FS_ERROR', details, requestId);
  }
}

/**
 * Represents an error related to network operations (HTTP 500).
 */
export class NetworkError extends AppError {
  /**
   * Creates an instance of NetworkError.
   * @param message - A human-readable error message.
   * @param details - Optional detailed information.
   * @param requestId - An optional request ID for tracing.
   */
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorType.NETWORK, 500, 'NETWORK_ERROR', details, requestId);
  }
}

// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================

/**
 * Express error handling middleware.
 * Catches errors, logs them, and sends a standardized JSON error response to the client.
 * Provides more details in development mode.
 * @param err - The error object. Can be an `AppError` or a native `Error`.
 * @param _req - The Express request object.
 * @param _res - The Express response object.
 * @param _next - The next middleware function (unused as this is a terminal error handler).
 */
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  let error: ApplicationError;

  // Handle known error types
  if (err instanceof AppError) {
    error = err;
  } else {
    // Handle unknown errors, wrap them in a generic AppError
    error = new AppError(
      'An unexpected error occurred',
      ErrorType.UNKNOWN,
      500,
      'INTERNAL_ERROR',
      { originalError: err.message },
      (req as any).traceId || req.headers['x-request-id'] as string
    );
  }

  // Log error using enhanced logger
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
  const errorResponse: any = {
    success: false,
    error: {
      type: error.type,
      message: error.message,
      code: error.code,
      timestamp: error.timestamp,
      requestId: error.requestId
    }
  };

  // Add details and stack trace in development mode for debugging
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = error.details;
    errorResponse.error.stack = error.stack;
  }

  res.status(error.statusCode).json(errorResponse);
};

// ============================================================
// ASYNC ERROR WRAPPER
// ============================================================

/**
 * Higher-order function for wrapping asynchronous Express route handlers.
 * Catches any errors from the async function and passes them to the `next` middleware (error handler).
 * @param fn - The asynchronous Express request handler function.
 * @returns An Express request handler that handles errors automatically.
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================================
// ERROR RESPONSE FORMATTER
// ============================================================

/**
 * Formats an `ApplicationError` into a standardized JSON response structure.
 * @param error - The `ApplicationError` object to format.
 * @param includeStack - If true, includes stack trace and full details in development mode. Defaults to false.
 * @returns An object representing the formatted error response.
 */
export const formatErrorResponse = (error: ApplicationError, includeStack: boolean = false) => {
  const response: any = {
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

/**
 * Enhances an existing `ApplicationError` with additional context details.
 * Useful for adding request-specific or operation-specific information to an error.
 * @param error - The original `ApplicationError` to enhance.
 * @param context - An object containing additional details to merge into the error's `details` property.
 * @returns A new `AppError` instance with enhanced context.
 */
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

/**
 * Defines strategies for error recovery in operations that might fail.
 */
export enum RecoveryStrategy {
  RETRY = 'RETRY',
  FALLBACK = 'FALLBACK',
  SKIP = 'SKIP',
  FAIL = 'FAIL'
}

/**
 * Configuration for an error recovery mechanism.
 */
export interface ErrorRecoveryConfig {
  /** The maximum number of times to retry an operation. */
  maxRetries: number;
  /** The delay in milliseconds between retries. */
  retryDelay: number;
  /** The strategy to apply if all retries fail. */
  strategy: RecoveryStrategy;
  /** An optional fallback value to return if the `FALLBACK` strategy is used. */
  fallbackValue?: any;
}

/**
 * Creates an error recovery function that can wrap any asynchronous operation.
 * It retries the operation based on the configuration and applies a recovery strategy on final failure.
 * @param config - The `ErrorRecoveryConfig` to use for recovery.
 * @returns A higher-order function that takes an asynchronous operation and returns a wrapped operation with recovery logic.
 */
export const createErrorRecovery = (config: ErrorRecoveryConfig) => {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === config.maxRetries) {
          break; // Last attempt failed, break to apply final strategy
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, config.retryDelay * (attempt + 1)));
      }
    }

    // Handle final failure based on strategy
    switch (config.strategy) {
      case RecoveryStrategy.FALLBACK:
        if (config.fallbackValue === undefined) {
          throw new AppError('Operation failed and no fallback value provided', ErrorType.UNKNOWN, 500, 'NO_FALLBACK');
        }
        return config.fallbackValue;
      case RecoveryStrategy.SKIP:
        throw new AppError('Operation skipped due to repeated failures', ErrorType.UNKNOWN, 500, 'SKIPPED_OPERATION');
      case RecoveryStrategy.FAIL:
      default:
        throw lastError!; // Re-throw the last error if FAIL strategy or default
    }
  };
};

// ============================================================
// ERROR MONITORING
// ============================================================

/**
 * Interface for a structured error report used for monitoring.
 */
export interface ErrorReport {
  /** The type of error. */
  type: ErrorType;
  /** The error message. */
  message: string;
  /** The HTTP status code. */
  statusCode: number;
  /** The ISO timestamp of the report. */
  timestamp: string;
  /** Optional request ID. */
  requestId?: string;
  /** Optional user agent string from the request. */
  userAgent?: string;
  /** Optional IP address from the request. */
  ip?: string;
  /** Optional stack trace (typically in development). */
  stack?: string;
  /** Optional detailed error information. */
  details?: any;
}

/**
 * Provides static methods for reporting, storing, and retrieving application error reports.
 */
export class ErrorMonitor {
  private static reports: ErrorReport[] = [];

  /**
   * Reports an application error, adding it to the internal list of reports.
   * Logs critical errors to the console.
   * @param error - The `ApplicationError` to report.
   * @param req - Optional Express request object to extract context like user agent and IP.
   */
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

  /**
   * Retrieves all stored error reports.
   * @returns An array of `ErrorReport` objects.
   */
  static getReports(): ErrorReport[] {
    return this.reports;
  }

  /**
   * Retrieves statistics about the stored errors.
   * @returns An object containing total error count, counts by type and status code, and recent reports.
   */
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

  /**
   * Clears all stored error reports.
   */
  static clearReports(): void {
    this.reports = [];
  }
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Validates that a value is not null, undefined, or an empty string.
 * @param value - The value to validate.
 * @param field - The name of the field being validated.
 * @param requestId - Optional request ID for error tracing.
 * @throws `ValidationError` if the value is not present.
 */
export const validateRequired = (value: any, field: string, requestId?: string): void => {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${field} is required`, { field }, requestId);
  }
};

/**
 * Validates that a value is an array.
 * @param value - The value to validate.
 * @param field - The name of the field being validated.
 * @param requestId - Optional request ID for error tracing.
 * @throws `ValidationError` if the value is not an array.
 */
export const validateArray = (value: any, field: string, requestId?: string): void => {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`, { field }, requestId);
  }
};

/**
 * Validates that a value is a string and optionally checks its length.
 * @param value - The value to validate.
 * @param field - The name of the field being validated.
 * @param minLength - Optional minimum length for the string.
 * @param maxLength - Optional maximum length for the string.
 * @param requestId - Optional request ID for error tracing.
 * @throws `ValidationError` if the value is not a string or fails length checks.
 */
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

/**
 * Validates that a value is a number and optionally checks its range.
 * @param value - The value to validate.
 * @param field - The name of the field being validated.
 * @param min - Optional minimum value for the number.
 * @param max - Optional maximum value for the number.
 * @param requestId - Optional request ID for error tracing.
 * @throws `ValidationError` if the value is not a number or fails range checks.
 */
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

/**
 * Validates that a value is one of the allowed enum values.
 * @template T - The type of the enum.
 * @param value - The value to validate.
 * @param field - The name of the field being validated.
 * @param validValues - An array of valid enum values.
 * @param requestId - Optional request ID for error tracing.
 * @throws `ValidationError` if the value is not among the valid values.
 */
export const validateEnum = <T>(value: any, field: string, validValues: T[], requestId?: string): void => {
  if (!validValues.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${validValues.join(', ')}`, { field, validValues }, requestId);
  }
};

/**
 * Validates that a string is a valid UUID.
 * @param value - The string value to validate.
 * @param field - The name of the field being validated.
 * @param requestId - Optional request ID for error tracing.
 * @throws `ValidationError` if the value is not a valid UUID.
 */
export const validateUUID = (value: string, field: string, requestId?: string): void => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`${field} must be a valid UUID`, { field }, requestId);
  }
};

/**
 * Default export of all error handling utilities.
 */
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