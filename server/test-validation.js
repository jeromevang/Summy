/**
 * Test Input Validation
 * Simple test script to verify validation middleware
 */

import { validateSchema, sanitizeInput, createRateLimit } from './src/middleware/validation.js';
import { z } from 'zod';

// Test schema
const testSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required').max(500, 'Model ID too long'),
  provider: z.enum(['all', 'lmstudio', 'openai', 'azure', 'openrouter']).default('all'),
  runLatencyProfile: z.boolean().default(false)
});

// Mock request/response objects
const createMockReq = (data) => ({
  query: data.query || {},
  body: data.body || {},
  params: data.params || {},
  ip: '127.0.0.1'
});

const createMockRes = () => ({
  status: (code) => ({
    json: (data) => {
      console.log(`Status ${code}:`, data);
      return { status: code, data };
    }
  })
});

const next = () => console.log('Next called');

console.log('🧪 Testing Input Validation...\n');

// Test 1: Valid input
console.log('Test 1: Valid input');
const validReq = createMockReq({
  body: { modelId: 'test-model', runLatencyProfile: true }
});
const validRes = createMockRes();
const validMiddleware = validateSchema(testSchema);
validMiddleware(validReq, validRes, next);

// Test 2: Invalid input
console.log('\nTest 2: Invalid input');
const invalidReq = createMockReq({
  body: { modelId: '', runLatencyProfile: 'not-a-boolean' }
});
const invalidRes = createMockRes();
const invalidMiddleware = validateSchema(testSchema);
invalidMiddleware(invalidReq, invalidRes, next);

// Test 3: Sanitization
console.log('\nTest 3: Input sanitization');
const dirtyInput = '<script>alert("xss")</script>test-model';
const cleanInput = sanitizeInput(dirtyInput);
console.log('Original:', dirtyInput);
console.log('Sanitized:', cleanInput);

// Test 4: Rate limiting
console.log('\nTest 4: Rate limiting');
const rateLimit = createRateLimit({
  windowMs: 60000,
  max: 2
});

const rateReq = { ip: '127.0.0.1' };
const rateRes = createMockRes();

console.log('First request (should pass):');
rateLimit(rateReq, rateRes, next);

console.log('Second request (should pass):');
rateLimit(rateReq, rateRes, next);

console.log('Third request (should be blocked):');
rateLimit(rateReq, rateRes, next);

console.log('\n✅ Input validation tests completed!');
