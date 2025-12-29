/**
 * Input Validation Test Suite
 * Tests for the validation middleware
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { 
  validateSchema, 
  sanitizeInput, 
  createRateLimit, 
  addSecurityHeaders,
  auditLog 
} from '../middleware/validation.js';

describe('Input Validation', () => {
  describe('validateSchema', () => {
    const testSchema = z.object({
      modelId: z.string().min(1, 'Model ID is required').max(500, 'Model ID too long'),
      provider: z.enum(['all', 'lmstudio', 'openai', 'azure', 'openrouter']).default('all'),
      runLatencyProfile: z.boolean().default(false)
    });

    it('should validate valid input', () => {
      const middleware = validateSchema(testSchema);
      const req = {
        query: { provider: 'lmstudio' },
        body: { modelId: 'test-model', runLatencyProfile: true },
        params: {}
      };
      const res = { status: () => ({ json: () => {} }) };
      const next = vi.fn();
      
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid input', () => {
      const middleware = validateSchema(testSchema);
      const req = {
        query: { provider: 'invalid' },
        body: { modelId: '' },
        params: {}
      };
      const res = {
        status: vi.fn(() => ({
          json: vi.fn()
        }))
      };
      const next = vi.fn();
      
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize string input', () => {
      const input = '<script>alert("xss")</script>test';
      const result = sanitizeInput(input);
      expect(result).toBe('test');
    });

    it('should sanitize object input', () => {
      const input = {
        '<script>': 'value',
        'normal': '<img src=x onerror=alert(1)>'
      };
      const result = sanitizeInput(input);
      expect(result).toEqual({
        '': 'value',
        'normal': ''
      });
    });
  });

  describe('createRateLimit', () => {
    it('should allow requests within limit', () => {
      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 100
      });
      
      const req = { ip: '127.0.0.1' };
      const res = { status: vi.fn(() => ({ json: vi.fn() })) };
      const next = vi.fn();
      
      rateLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should block requests exceeding limit', () => {
      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1
      });
      
      const req = { ip: '127.0.0.1' };
      const res = {
        status: vi.fn(() => ({
          json: vi.fn()
        }))
      };
      const next = vi.fn();
      
      // First request should pass
      rateLimit(req, res, next);
      expect(next).toHaveBeenCalled();
      
      // Second request should be blocked
      next.mockClear();
      rateLimit(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('addSecurityHeaders', () => {
    it('should add security headers', () => {
      const middleware = addSecurityHeaders();
      const res = {
        setHeader: vi.fn()
      };
      const next = vi.fn();
      
      middleware({}, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('auditLog', () => {
    it('should log requests', () => {
      const middleware = auditLog();
      const req = {
        method: 'GET',
        path: '/test',
        ip: '127.0.0.1'
      };
      const res = {
        json: vi.fn(),
        statusCode: 200
      };
      const next = vi.fn();
      
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});

export default describe;
