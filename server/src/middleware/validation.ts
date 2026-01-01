/**
 * Input Validation Middleware
 * Provides comprehensive validation for API endpoints using Zod schemas.
 * Includes middleware for schema validation, input sanitization, rate limiting,
 * security headers, input size limits, authentication, and audit logging.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  ModelIdSchema, 
  BooleanSchema, 
  TestExecutionSchema, 
  ProbeExecutionSchema, 
  ComboTestSchema, 
  FailureLogSchema 
} from '@summy/shared'; // Assuming @summy/shared provides necessary Zod schemas

/**
 * Zod schema for validating system prompt configurations.
 */
export const SystemPromptSchema = z.object({
  /** The ID of the model associated with the system prompt. */
  modelId: ModelIdSchema,
  /** The content of the system prompt, must be at least 10 characters long. */
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  /** Indicates whether the system prompt should be appended to existing prompts. */
  append: BooleanSchema
});

/**
 * Zod schema for validating prosthetic configurations.
 */
export const ProstheticSchema = z.object({
  /** The ID of the model to which the prosthetic applies. */
  modelId: ModelIdSchema,
  /** The prosthetic details, including level, prompt, and optional description. */
  prosthetic: z.object({
    /** The level of the prosthetic (e.g., '1', '2', '3', '4'). */
    level: z.enum(['1', '2', '3', '4']),
    /** The content of the prosthetic prompt, must be at least 10 characters long. */
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    /** An optional description for the prosthetic. */
    description: z.string().optional()
  }),
  /** Indicates whether a test should be run before applying the prosthetic. */
  testFirst: BooleanSchema
});


/**
 * Zod schema for validating rate limiting configurations.
 */
export const RateLimitSchema = z.object({
  /** The time window in milliseconds for rate limiting (1 second to 1 hour). */
  windowMs: z.number().int().min(1000).max(3600000),
  /** The maximum number of requests allowed within the `windowMs`. */
  max: z.number().int().min(1).max(1000),
  /** An optional custom message to send when the rate limit is exceeded. */
  message: z.string().optional()
});

/**
 * Zod schema for validating common security headers.
 */
export const SecurityHeadersSchema = z.object({
  /** `X-Content-Type-Options` header value, typically 'nosniff'. */
  'X-Content-Type-Options': z.literal('nosniff'),
  /** `X-Frame-Options` header value, either 'DENY' or 'SAMEORIGIN'. */
  'X-Frame-Options': z.enum(['DENY', 'SAMEORIGIN']),
  /** `X-XSS-Protection` header value, typically '1; mode=block'. */
  'X-XSS-Protection': z.literal('1; mode=block'),
  /** `Strict-Transport-Security` header value, optional. */
  'Strict-Transport-Security': z.string().optional(),
  /** `Content-Security-Policy` header value, optional. */
  'Content-Security-Policy': z.string().optional()
});

/**
 * Factory function to create a validation middleware for a given Zod schema.
 * This middleware validates request query, body, and path parameters against the schema.
 * @param schema - The Zod schema to use for validation.
 * @returns An Express middleware function.
 */
export function validateSchema(schema: any) { 
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Create a stripped version of the schema to ignore unknown keys.
      // This is crucial for middleware where the request might contain more fields than the schema defines.
      const strippedSchema = schema.strip();

      // Helper to pick keys that exist in the schema's shape.
      // This ensures we only validate parameters that the schema is designed to handle. 
      const pickValidKeys = (data: any, currentSchema: any) => {
        if (!currentSchema || !(currentSchema instanceof z.ZodObject) || !currentSchema.shape) return data; // If not a ZodObject or no shape, return data as is
        const validKeys = Object.keys(currentSchema.shape);
        const filteredData: any = {};
        for (const key of Object.keys(data)) {
          if (validKeys.includes(key)) {
            filteredData[key] = data[key];
          }
        }
        return filteredData;
      };

      // Validate query parameters
      if (Object.keys(req.query).length > 0) {
        const queryData = pickValidKeys(req.query, schema); // Pass schema to helper
        if (Object.keys(queryData).length > 0) {
          try {
            strippedSchema.parse(queryData);
          } catch (e: any) {
            console.error(`[Validation Error] Query params failed for ${req.path}:`, e.errors || e);
            // Return 400 status with validation errors
            return res.status(400).json({
              error: 'Validation failed',
              details: e.errors.map((err: any) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code
              }))
            });
          }
        }
      }

      // Validate body parameters
      if (Object.keys(req.body).length > 0) {
        const bodyData = pickValidKeys(req.body, schema); // Pass schema to helper
        if (Object.keys(bodyData).length > 0) {
          try {
            strippedSchema.parse(bodyData);
          } catch (e: any) {
            console.error(`[Validation Error] Body failed for ${req.path}:`, e.errors || e);
            // Return 400 status with validation errors
            return res.status(400).json({
              error: 'Validation failed',
              details: e.errors.map((err: any) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code
              }))
            });
          }
        }
      }

      // Validate path parameters
      if (Object.keys(req.params).length > 0) {
        const paramData = pickValidKeys(req.params, schema); // Pass schema to helper
        if (Object.keys(paramData).length > 0) {
          try {
            strippedSchema.parse(paramData);
          } catch (e: any) {
            console.error(`[Validation Error] Path params failed for ${req.path}:`, e.errors || e);
            // Return 400 status with validation errors
            return res.status(400).json({
              error: 'Validation failed',
              details: e.errors.map((err: any) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code
              }))
            });
          }
        }
      }

      return next(); // If all validations pass, proceed to the next middleware/route handler
    } catch (error: any) {
      const issues = error?.issues || error?.errors;
      if (issues && Array.isArray(issues)) {
        const errors = issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        return res.status(400).json({ // Ensure return statement here (TS7030)
          error: 'Validation failed',
          details: errors
        });
      }
      
      return res.status(400).json({ // Ensure return statement here (TS7030)
        error: 'Invalid request format',
        details: error.message || 'An unknown validation error occurred.' // Provide more info
      });
    }
  };
}

/**
 * Sanitize input recursively to prevent injection attacks and other common vulnerabilities.
 * It removes dangerous HTML tags, JavaScript protocols, and event handlers.
 * @param input - The input data to sanitize (can be string, array, or object).
 * @returns The sanitized input.
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous HTML tags and their content
    return input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]*>?/gm, '') // Remove any other HTML tags
      .replace(/javascript:/gi, '') // Remove JS protocols
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: { [key: string]: any } = {}; // Explicitly type sanitized object
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Factory function to create a rate limiting middleware.
 * Limits the number of requests from a single IP address within a specified time window.
 * @param options - Configuration for the rate limit, defined by `RateLimitSchema`.
 * @returns An Express middleware function for rate limiting.
 */
export function createRateLimit(options: z.infer<typeof RateLimitSchema>) {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'; // More robust IP retrieval
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, { count: 1, resetTime: now + options.windowMs });
      return next(); // Proceed to next middleware
    }
    
    const client = requests.get(ip)!; // Non-null assertion as we just checked has(ip)
    
    if (now > client.resetTime) {
      client.count = 1;
      client.resetTime = now + options.windowMs;
      return next(); // Proceed to next middleware
    }
    
    if (client.count >= options.max) {
      return res.status(429).json({ // Ensure return statement here (TS7030)
        error: 'Too many requests',
        message: options.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((client.resetTime - now) / 1000)
      });
    }
    
    client.count++;
              return next(); // Proceed to next middleware
  };
}

/**
 * Middleware to add recommended security headers to all responses.
 * Helps protect against common web vulnerabilities like XSS, clickjacking, and MIME type sniffing.
 * Also sets CORS headers.
 * @returns An Express middleware function for security headers.
 */
export function addSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Add CORS headers for API to allow frontend interaction
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          return res.status(200).end(); // Ensure return statement here (TS7030)
        }
    
        return next(); // Proceed to next middleware
  };
}

/**
 * Factory function to create an input size validation middleware.
 * Rejects requests with a body larger than a specified maximum size.
 * @param maxSize - The maximum allowed request body size in bytes. Defaults to 1MB.
 * @returns An Express middleware function for input size validation.
 */
export function validateInputSize(maxSize: number = 1024 * 1024) { // 1MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({ // Ensure return statement here (TS7030)
        error: 'Request too large',
        message: `Request size exceeds maximum allowed size of ${maxSize} bytes`
      });
    }
    
    return next(); // Proceed to next middleware
  };
}

/**
 * Placeholder authentication middleware.
 * Currently allows all requests but provides a structure for future authentication logic.
 * @returns An Express middleware function.
 */
export function requireAuth() {
  return (req: Request, _res: Response, next: NextFunction) => {
    // For now, allow all requests but log them
    // TODO: Implement proper authentication mechanism (e.g., JWT, API Key)
    console.log(`[Auth] Request from ${req.ip || 'unknown IP'} to ${req.path}`);
    return next(); // Always proceed for now
  };
}

/**
 * Audit logging middleware.
 * Logs details about incoming requests and outgoing responses, with special handling for sensitive operations.
 * @returns An Express middleware function for audit logging.
 */
export function auditLog() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log request
    console.log(`[Audit] ${req.method} ${req.path} from ${req.ip || 'unknown IP'}`);
    
    // Store original json method to override and capture response body
    const originalJson = res.json;
    // @ts-ignore - We are intentionally overriding and then restoring a method
    res.json = function(body: any) {
      const duration = Date.now() - startTime;
      console.log(`[Audit] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      
      // Log sensitive operations with additional details
      if (req.path.includes('/prosthetic') || req.path.includes('/rollback') || req.path.includes('/test')) {
        console.log(`[Audit] Sensitive operation: ${req.method} ${req.path} - User: ${req.ip || 'unknown IP'}`);
      }
      
      return originalJson.call(this, body); // Call the original json method to send the response
    };
    
    return next(); // Proceed to next middleware
  };
}

// --- Export Common Validation Middleware Instances ---
/**
 * Validation middleware for routes requiring a `modelId`.
 */
export const validateModelId = validateSchema(z.object({ modelId: ModelIdSchema }));
/**
 * Validation middleware for test execution requests.
 */
export const validateTestExecution = validateSchema(TestExecutionSchema);
/**
 * Validation middleware for probe execution requests.
 */
export const validateProbeExecution = validateSchema(ProbeExecutionSchema);
/**
 * Validation middleware for combo test requests.
 */
export const validateComboTest = validateSchema(ComboTestSchema);
/**
 * Validation middleware for prosthetic configuration requests.
 */
export const validateProsthetic = validateSchema(ProstheticSchema);
/**
 * Validation middleware for system prompt configuration requests.
 */
export const validateSystemPrompt = validateSchema(SystemPromptSchema);
/**
 * Validation middleware for failure logging requests.
 */
export const validateFailureLog = validateSchema(FailureLogSchema);

// --- Export Rate Limiting Middleware Instances ---
/**
 * Rate limiting middleware for general API requests.
 * Limits to 1000 requests per minute per IP.
 */
export const apiRateLimit = createRateLimit({
  windowMs: 60000, // 1 minute
  max: 1000, // Increased from 100 to 1000 to prevent blocking during health checks
  message: 'Too many API requests from this IP, please try again later.'
});

/**
 * Rate limiting middleware for expensive operations.
 * Limits to 10 requests per 5 minutes per IP.
 */
export const expensiveOperationRateLimit = createRateLimit({
  windowMs: 300000, // 5 minutes
  max: 10, // limit each IP to 10 requests per 5 minutes
  message: 'Too many expensive operations from this IP, please try again later.'
});

