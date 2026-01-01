/**
 * Input Validation Middleware
 * Comprehensive validation for all API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  ModelIdSchema, 
  ProviderSchema, 
  BooleanSchema, 
  TestExecutionSchema, 
  ProbeExecutionSchema, 
  ComboTestSchema, 
  FailureLogSchema 
} from '@summy/shared';

// System prompt validation
export const SystemPromptSchema = z.object({
  modelId: ModelIdSchema,
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  append: BooleanSchema
});

// Prosthetic validation
export const ProstheticSchema = z.object({
  modelId: ModelIdSchema,
  prosthetic: z.object({
    level: z.enum(['1', '2', '3', '4']),
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    description: z.string().optional()
  }),
  testFirst: BooleanSchema
});


// Rate limiting validation
export const RateLimitSchema = z.object({
  windowMs: z.number().int().min(1000).max(3600000), // 1 second to 1 hour
  max: z.number().int().min(1).max(1000),
  message: z.string().optional()
});

// Security validation
export const SecurityHeadersSchema = z.object({
  'X-Content-Type-Options': z.literal('nosniff'),
  'X-Frame-Options': z.enum(['DENY', 'SAMEORIGIN']),
  'X-XSS-Protection': z.literal('1; mode=block'),
  'Strict-Transport-Security': z.string().optional(),
  'Content-Security-Policy': z.string().optional()
});

/**
 * Validation middleware factory
 */
export function validateSchema(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Create a stripped version of the schema to ignore unknown keys
      const strippedSchema = schema instanceof z.ZodObject ? schema.strip() : schema;

      // Helper to pick keys that exist in the schema
      const pickValidKeys = (data: any) => {
        if (!(schema instanceof z.ZodObject)) return data;
        const validKeys = Object.keys(schema.shape);
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
        const queryData = pickValidKeys(req.query);
        if (Object.keys(queryData).length > 0) {
          try {
            strippedSchema.parse(queryData);
          } catch (e: any) {
            console.error(`[Validation Error] Query params failed for ${req.path}:`, e.errors || e);
            throw e;
          }
        }
      }

      // Validate body parameters
      if (Object.keys(req.body).length > 0) {
        const bodyData = pickValidKeys(req.body);
        if (Object.keys(bodyData).length > 0) {
          try {
            strippedSchema.parse(bodyData);
          } catch (e: any) {
            console.error(`[Validation Error] Body failed for ${req.path}:`, e.errors || e);
            throw e;
          }
        }
      }

      // Validate path parameters
      if (Object.keys(req.params).length > 0) {
        const paramData = pickValidKeys(req.params);
        if (Object.keys(paramData).length > 0) {
          try {
            strippedSchema.parse(paramData);
          } catch (e: any) {
            console.error(`[Validation Error] Path params failed for ${req.path}:`, e.errors || e);
            throw e;
          }
        }
      }

      next();
    } catch (error: any) {
      const issues = error?.issues || error?.errors;
      if (issues && Array.isArray(issues)) {
        const errors = issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }
      
      return res.status(400).json({
        error: 'Invalid request format'
      });
    }
  };
}

/**
 * Sanitize input to prevent injection attacks
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous HTML tags and their content
    return input
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]*>?/gm, '') // Remove any other HTML tags
      .replace(/javascript:/gi, '') // Remove JS protocols
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Rate limiting middleware
 */
export function createRateLimit(options: z.infer<typeof RateLimitSchema>) {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, { count: 1, resetTime: now + options.windowMs });
      return next();
    }
    
    const client = requests.get(ip)!;
    
    if (now > client.resetTime) {
      client.count = 1;
      client.resetTime = now + options.windowMs;
      return next();
    }
    
    if (client.count >= options.max) {
      return res.status(429).json({
        error: 'Too many requests',
        message: options.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((client.resetTime - now) / 1000)
      });
    }
    
    client.count++;
    next();
  };
}

/**
 * Security headers middleware
 */
export function addSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Add CORS headers for API
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  };
}

/**
 * Input size validation middleware
 */
export function validateInputSize(maxSize: number = 1024 * 1024) { // 1MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request too large',
        message: `Request size exceeds maximum allowed size of ${maxSize} bytes`
      });
    }
    
    next();
  };
}

/**
 * Authentication middleware (placeholder for future implementation)
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    // For now, allow all requests but log them
    // TODO: Implement proper authentication
    console.log(`[Auth] Request from ${req.ip} to ${req.path}`);
    next();
  };
}

/**
 * Audit logging middleware
 */
export function auditLog() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log request
    console.log(`[Audit] ${req.method} ${req.path} from ${req.ip}`);
    
    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(body: any) {
      const duration = Date.now() - startTime;
      console.log(`[Audit] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      
      // Log sensitive operations
      if (req.path.includes('/prosthetic') || req.path.includes('/rollback') || req.path.includes('/test')) {
        console.log(`[Audit] Sensitive operation: ${req.method} ${req.path} - User: ${req.ip}`);
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
}

// Export common validation middleware instances
export const validateModelId = validateSchema(z.object({ modelId: ModelIdSchema }));
export const validateTestExecution = validateSchema(TestExecutionSchema);
export const validateProbeExecution = validateSchema(ProbeExecutionSchema);
export const validateComboTest = validateSchema(ComboTestSchema);
export const validateProsthetic = validateSchema(ProstheticSchema);
export const validateSystemPrompt = validateSchema(SystemPromptSchema);
export const validateFailureLog = validateSchema(FailureLogSchema);

// Export rate limiting instances
export const apiRateLimit = createRateLimit({
  windowMs: 60000, // 1 minute
  max: 1000, // Increased from 100 to 1000 to prevent blocking during health checks
  message: 'Too many API requests from this IP, please try again later.'
});

export const expensiveOperationRateLimit = createRateLimit({
  windowMs: 300000, // 5 minutes
  max: 10, // limit each IP to 10 requests per 5 minutes
  message: 'Too many expensive operations from this IP, please try again later.'
});
