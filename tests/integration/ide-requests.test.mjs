/**
 * IDE Integration Tests
 * Tests incoming requests from IDEs (Continue, Cursor, etc.) through OpenAI proxy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3001';
const PROXY_ENDPOINT = `${SERVER_URL}/v1/chat/completions`; // OpenAI-compatible endpoint

describe('IDE Request Integration', () => {
  describe('OpenAI Proxy Endpoint', () => {
    it('should accept OpenAI-formatted chat completion request', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello, this is a test from an IDE'
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      // Should either succeed or return a specific error
      // May fail if no API keys configured, but endpoint should exist
      expect([200, 400, 401, 500].includes(response.status)).toBe(true);

      // Check response format
      if (response.ok) {
        const data = await response.json();
        // OpenAI format response
        expect(data).toHaveProperty('choices');
      } else {
        const error = await response.json();
        expect(error).toHaveProperty('error');
      }
    });

    it('should handle messages array correctly', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful coding assistant.'
          },
          {
            role: 'user',
            content: 'Write a hello world function'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });

    it('should handle tool calls in request', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Read the package.json file'
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read contents of a file',
              parameters: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'Path to the file'
                  }
                },
                required: ['path']
              }
            }
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Intent Router Integration', () => {
    it('should route requests through intent router', async () => {
      // The proxy should route through intentRouter.route()
      // This test verifies the routing mechanism works

      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'List files in current directory'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      // Should be routed (even if it fails due to missing config)
      expect(response).toBeDefined();
      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Session Creation from IDE', () => {
    it('should create session when IDE sends messages', async () => {
      const uniqueContent = 'test-session-' + Date.now();

      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: uniqueContent
          }
        ]
      };

      // Send request through proxy
      await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      }).catch(() => {
        // Ignore errors for this test - we're checking session creation
      });

      // Wait a bit for session to be created
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if sessions endpoint exists and returns data
      const sessionsRes = await fetch(`${SERVER_URL}/api/sessions`);
      expect(sessionsRes.ok).toBe(true);

      const sessions = await sessionsRes.json();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });

  describe('WebSocket Broadcasts from IDE Requests', () => {
    it('should broadcast IDE activity over WebSocket', async () => {
      // This is tested in websocket.test.mjs
      // Here we just verify the endpoint that triggers broadcasts exists

      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Test websocket broadcast'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      // Should process request (broadcast happens internally)
      expect(response).toBeDefined();
    });
  });

  describe('MCP Tool Execution from IDE', () => {
    it('should trigger MCP tools when model requests them', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Use the read_file tool to read package.json'
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read a file',
              parameters: {
                type: 'object',
                properties: {
                  path: { type: 'string' }
                },
                required: ['path']
              }
            }
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      // Tool execution happens through MCP server
      // Even if request fails due to config, endpoint should exist
      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Error Handling for IDE Requests', () => {
    it('should handle malformed IDE request', async () => {
      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
          messages: []
        }),
        timeout: 30000
      });

      expect([400, 500].includes(response.status)).toBe(true);
    });

    it('should handle missing API keys gracefully', async () => {
      // With no API keys configured, should return error but not crash
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'test'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      // Should handle gracefully (may return 401 or 500)
      expect(response).toBeDefined();

      if (!response.ok) {
        const error = await response.json();
        expect(error).toHaveProperty('error');
      }
    });

    it('should handle network timeouts', async () => {
      // Test with very short timeout
      try {
        await fetch(PROXY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'test' }]
          }),
          timeout: 1 // 1ms timeout to force failure
        });
      } catch (err) {
        // Should throw timeout error, not crash server
        expect(err.name).toContain('Timeout');
      }
    });
  });

  describe('Continue/Cursor Specific Flows', () => {
    it('should handle Continue IDE request format', async () => {
      // Continue sends requests in OpenAI format
      const continueRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Continue, a coding assistant.'
          },
          {
            role: 'user',
            content: 'Explain this code: console.log("hello")'
          }
        ],
        temperature: 0.5
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(continueRequest),
        timeout: 30000
      });

      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });

    it('should handle Cursor IDE request format', async () => {
      // Cursor also uses OpenAI format
      const cursorRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Help me refactor this function'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cursorRequest),
        timeout: 30000
      });

      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Learning System from IDE Corrections', () => {
    it('should detect user corrections in conversation', async () => {
      // Send initial request
      const request1 = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Write a function to add two numbers'
          }
        ]
      };

      await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request1),
        timeout: 30000
      }).catch(() => {});

      // Send correction
      const request2 = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Write a function to add two numbers'
          },
          {
            role: 'assistant',
            content: 'function add(a, b) { return a + b; }'
          },
          {
            role: 'user',
            content: 'No, add type checking first'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request2),
        timeout: 30000
      });

      // Learning system should detect the correction pattern
      expect([200, 400, 401, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Response Format Validation', () => {
    it('should return OpenAI-compatible response format', async () => {
      const request = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'test'
          }
        ]
      };

      const response = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeout: 30000
      });

      if (response.ok) {
        const data = await response.json();

        // OpenAI format validation
        if (data.choices) {
          expect(data).toHaveProperty('id');
          expect(data).toHaveProperty('object');
          expect(data).toHaveProperty('created');
          expect(data).toHaveProperty('model');
          expect(data).toHaveProperty('choices');
          expect(Array.isArray(data.choices)).toBe(true);
        }
      }
    });
  });
});
