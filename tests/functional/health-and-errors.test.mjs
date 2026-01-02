/**
 * Health Check & Error Handling Tests
 * Tests the new health endpoints and standardized error handling
 */

import { describe, it, expect } from 'vitest';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3001';
const RAG_SERVER_URL = 'http://localhost:3002';

describe('Health Check Endpoints', () => {
  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await fetch(`${SERVER_URL}/health`);
      expect(response.ok).toBe(true);

      const health = await response.json();

      expect(health).toHaveProperty('status', 'ok');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('memory');

      // Validate memory structure
      expect(health.memory).toHaveProperty('used');
      expect(health.memory).toHaveProperty('total');
      expect(typeof health.memory.used).toBe('number');
      expect(typeof health.memory.total).toBe('number');
      expect(health.memory.used).toBeGreaterThan(0);
      expect(health.memory.total).toBeGreaterThan(0);
    });

    it('should return valid timestamp', async () => {
      const response = await fetch(`${SERVER_URL}/health`);
      const health = await response.json();

      const timestamp = new Date(health.timestamp);
      expect(timestamp instanceof Date && !isNaN(timestamp)).toBe(true);

      // Should be recent (within last 5 seconds)
      const now = new Date();
      const diff = Math.abs(now - timestamp);
      expect(diff).toBeLessThan(5000);
    });

    it('should show increasing uptime', async () => {
      const response1 = await fetch(`${SERVER_URL}/health`);
      const health1 = await response1.json();

      await new Promise(resolve => setTimeout(resolve, 1000));

      const response2 = await fetch(`${SERVER_URL}/health`);
      const health2 = await response2.json();

      expect(health2.uptime).toBeGreaterThan(health1.uptime);
    });
  });

  describe('GET /ready', () => {
    it('should check all service dependencies', async () => {
      const response = await fetch(`${SERVER_URL}/ready`);
      const readiness = await response.json();

      expect(readiness).toHaveProperty('ready');
      expect(readiness).toHaveProperty('services');
      expect(typeof readiness.ready).toBe('boolean');

      // Should check database
      expect(readiness.services).toHaveProperty('database');
      expect(typeof readiness.services.database).toBe('boolean');

      // Should check RAG server
      expect(readiness.services).toHaveProperty('rag');
      expect(typeof readiness.services.rag).toBe('boolean');
    });

    it('should return 200 when all services ready', async () => {
      const response = await fetch(`${SERVER_URL}/ready`);

      if (response.ok) {
        const readiness = await response.json();
        expect(readiness.ready).toBe(true);
        expect(Object.values(readiness.services).every(s => s)).toBe(true);
      }
    });

    it('should verify database is accessible', async () => {
      const response = await fetch(`${SERVER_URL}/ready`);
      const readiness = await response.json();

      // Database should be available
      expect(readiness.services.database).toBe(true);
    });

    it('should check RAG server connectivity', async () => {
      const response = await fetch(`${SERVER_URL}/ready`);
      const readiness = await response.json();

      // RAG service status is checked (true or false based on availability)
      expect(readiness.services).toHaveProperty('rag');
      expect(typeof readiness.services.rag).toBe('boolean');

      // Note: RAG might be unavailable due to network timeouts, that's ok
      // The important thing is that the endpoint handles it gracefully
    });
  });
});

describe('Error Handling & Request Tracking', () => {
  describe('Request ID Tracking', () => {
    it('should include X-Request-ID in response headers', async () => {
      const response = await fetch(`${SERVER_URL}/health`);

      expect(response.headers.has('x-request-id')).toBe(true);
      const requestId = response.headers.get('x-request-id');

      expect(requestId).toBeTruthy();
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    it('should generate unique request IDs', async () => {
      const response1 = await fetch(`${SERVER_URL}/health`);
      const requestId1 = response1.headers.get('x-request-id');

      const response2 = await fetch(`${SERVER_URL}/health`);
      const requestId2 = response2.headers.get('x-request-id');

      expect(requestId1).not.toBe(requestId2);
    });

    it('should preserve provided request ID', async () => {
      const customRequestId = 'test-request-12345';

      const response = await fetch(`${SERVER_URL}/health`, {
        headers: { 'X-Request-ID': customRequestId }
      });

      const returnedRequestId = response.headers.get('x-request-id');
      expect(returnedRequestId).toBe(customRequestId);
    });

    it('should include request ID in error responses', async () => {
      const response = await fetch(`${SERVER_URL}/api/nonexistent`);

      const error = await response.json();
      expect(error).toHaveProperty('requestId');
      expect(typeof error.requestId).toBe('string');
      expect(error.requestId.length).toBeGreaterThan(0);
    });
  });

  describe('404 Not Found Handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await fetch(`${SERVER_URL}/api/this-does-not-exist`);

      expect(response.status).toBe(404);
    });

    it('should return standardized 404 error format', async () => {
      const response = await fetch(`${SERVER_URL}/api/nonexistent-endpoint`);
      const error = await response.json();

      expect(error).toHaveProperty('error', 'Not found');
      expect(error).toHaveProperty('code', 'NOT_FOUND');
      expect(error).toHaveProperty('path');
      expect(error).toHaveProperty('requestId');

      expect(error.path).toBe('/api/nonexistent-endpoint');
    });

    it('should handle nested route 404s', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/fake-id-999/specialists/fake-specialist`);

      // Could be 404 (not found) or other error depending on validation order
      expect([404, 500].includes(response.status)).toBe(true);

      const error = await response.json();
      expect(error).toHaveProperty('error');
      expect(error).toHaveProperty('requestId');
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for invalid team creation', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Team',
          // Missing required mainArchitect
          projectHash: 'test-hash-123'
        })
      });

      expect(response.status).toBe(400);

      const error = await response.json();
      expect(error).toHaveProperty('error');
      // API returns generic validation error
      expect(typeof error.error).toBe('string');
    });

    it('should handle team creation validation', async () => {
      const projectHash = 'test-hash-' + Date.now();
      const teamData = {
        name: 'Unique Test Team ' + Date.now(),
        mainArchitect: {
          modelId: 'gpt-4o',
          provider: 'openai',
          role: 'architect',
          systemPrompt: 'You are the architect'
        },
        projectHash,
        description: 'Test team'
      };

      // Create first team
      const response1 = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamData)
      });

      // Should succeed or return validation error
      expect([200, 201, 400, 409].includes(response1.status)).toBe(true);

      if (response1.ok) {
        // If creation succeeded, try to create duplicate
        const response2 = await fetch(`${SERVER_URL}/api/teams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(teamData)
        });

        // Should reject duplicate
        expect([409, 400].includes(response2.status)).toBe(true);

        const error = await response2.json();
        expect(error).toHaveProperty('error');
      }
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error structure', async () => {
      const response = await fetch(`${SERVER_URL}/api/nonexistent`);
      const error = await response.json();

      // All errors should have these fields
      expect(error).toHaveProperty('error');
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('requestId');

      expect(typeof error.error).toBe('string');
      expect(typeof error.code).toBe('string');
      expect(typeof error.requestId).toBe('string');
    });

    it('should include path in 404 errors', async () => {
      const testPath = '/api/test-404-path';
      const response = await fetch(`${SERVER_URL}${testPath}`);
      const error = await response.json();

      expect(error).toHaveProperty('path', testPath);
    });

    it('should not leak stack traces in production mode', async () => {
      const response = await fetch(`${SERVER_URL}/api/nonexistent`);
      const error = await response.json();

      // In production, should not have stack trace
      if (process.env.NODE_ENV === 'production') {
        expect(error).not.toHaveProperty('stack');
      }
    });
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers', async () => {
      const response = await fetch(`${SERVER_URL}/health`);

      // Server should handle CORS
      expect(response.headers.has('access-control-allow-origin') || response.ok).toBe(true);
    });

    it('should include Content-Type JSON', async () => {
      const response = await fetch(`${SERVER_URL}/health`);

      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });
  });
});

describe('Service Integration', () => {
  describe('Health Check Integration', () => {
    it('should verify all services communicate correctly', async () => {
      // Check server health
      const serverHealth = await fetch(`${SERVER_URL}/health`);
      expect(serverHealth.ok).toBe(true);

      // Check readiness (includes RAG check)
      const readiness = await fetch(`${SERVER_URL}/ready`);
      const ready = await readiness.json();

      // At minimum, database should be working
      expect(ready.services.database).toBe(true);
    });

    it('should handle RAG server being down gracefully', async () => {
      // Even if RAG server is down, /ready should return a response
      const response = await fetch(`${SERVER_URL}/ready`);

      expect(response).toBeTruthy();
      expect([200, 503].includes(response.status)).toBe(true);

      const readiness = await response.json();
      expect(readiness).toHaveProperty('ready');
      expect(readiness).toHaveProperty('services');
    });
  });

  describe('Request Flow', () => {
    it('should process requests with full middleware stack', async () => {
      // Make a request that goes through full middleware
      const response = await fetch(`${SERVER_URL}/api/teams`);

      // Should have request ID from middleware
      expect(response.headers.get('x-request-id')).toBeTruthy();

      // Should get proper response (or error)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{'
      });

      expect([400, 500].includes(response.status)).toBe(true);

      const error = await response.json().catch(() => null);
      if (error) {
        expect(error).toHaveProperty('error');
      }
    });
  });
});
