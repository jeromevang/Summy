/**
 * Input Validation Middleware
 * Comprehensive validation for all API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Common validation schemas
export const ModelIdSchema = z.string().min(1, 'Model ID is required').max(500, 'Model ID too long');
export const ProviderSchema = z.enum(['all', 'lmstudio', 'openai', 'azure', 'openrouter']).default('all');
export const BooleanSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return undefined;
}, z.boolean().default(false));

// Test execution validation
export const TestExecutionSchema = z.object({
  modelId: ModelIdSchema,
  provider: ProviderSchema,
  runLatencyProfile: BooleanSchema,
  isBaseline: BooleanSchema,
  runCount: z.number().int().min(1).max(10).default(1)
});

// Probe execution validation
export const ProbeExecutionSchema = z.object({
  modelId: ModelIdSchema,
  categories: z.array(z.string()).optional(),
  mode: z.enum(['quick', 'full']).default('full'),
  isBaseline: BooleanSchema
});

// Combo test validation
export const ComboTestSchema = z.object({
  mainModelId: ModelIdSchema,
  executorModelId: ModelIdSchema,
  runCount: z.number().int().min(1).max(10).default(1),
  includeQualifyingGate: BooleanSchema
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

// System prompt validation
export const SystemPromptSchema = z.object({
  modelId: ModelIdSchema,
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  append: BooleanSchema
});

// Failure log validation
export const FailureLogSchema = z.object({
  modelId: ModelIdSchema,
  executorModelId: ModelIdSchema.optional(),
  category: z.enum(['tool', 'intent', 'rag', 'reasoning', 'architectural', 'navigation', 'proactive', 'helicopter']).optional(),
  tool: z.string().optional(),
  error: z.string().min(1, 'Error message is required'),
  query: z.string().min(5, 'Query must be at least 5 characters'),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional()
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
      // Validate query parameters
      if (Object.keys(req.query).length > 0) {
        const querySchema = schema.pick(Object.keys(req.query).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as any));
        if (querySchema) {
          querySchema.parse(req.query);
        }
      }

      // Validate body parameters
      if (Object.keys(req.body).length > 0) {
        const bodySchema = schema.pick(Object.keys(req.body).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as any));
        if (bodySchema) {
          bodySchema.parse(req.body);
        }
      }

      // Validate path parameters
      if (Object.keys(req.params).length > 0) {
        const paramSchema = schema.pick(Object.keys(req.params).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as any));
        if (paramSchema) {
          paramSchema.parse(req.params);
        }
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
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
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
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
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many API requests from this IP, please try again later.'
});

export const expensiveOperationRateLimit = createRateLimit({
  windowMs: 300000, // 5 minutes
  max: 10, // limit each IP to 10 requests per 5 minutes
  message: 'Too many expensive operations from this IP, please try again later.'
});
