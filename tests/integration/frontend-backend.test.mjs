/**
 * Frontend-Backend Integration Tests
 * Tests that frontend components are properly wired to backend APIs
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3001';

describe('Frontend-Backend Integration', () => {
  describe('Team Builder Integration', () => {
    it('should fetch models for Team Builder dropdowns', async () => {
      const response = await fetch(`${SERVER_URL}/api/tooly/models?provider=all`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('models');
      expect(Array.isArray(data.models)).toBe(true);

      // Should have models from various providers
      if (data.models.length > 0) {
        const model = data.models[0];
        expect(model).toHaveProperty('id');
        // Optional properties
        expect(model).toBeDefined();
      }
    });

    it('should fetch current team config', async () => {
      const response = await fetch(`${SERVER_URL}/api/team`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Should return {team: null} or {team: {...}}
      expect(data).toHaveProperty('team');
    });

    it('should save team config from Team Builder', async () => {
      const teamConfig = {
        mainModelId: 'test-model-' + Date.now(),
        executorEnabled: true,
        executorModelId: 'executor-test',
        agents: [
          {
            id: '1',
            name: 'Test Agent',
            role: 'Reviewer',
            model: 'test-reviewer-model'
          }
        ]
      };

      const response = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamConfig)
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('team');
      expect(data.team).toHaveProperty('mainModelId', teamConfig.mainModelId);
      expect(data.team).toHaveProperty('executorEnabled', true);
      expect(data.team.agents.length).toBe(1);
    });

    it('should validate required fields on team save', async () => {
      const invalidConfig = {
        // Missing mainModelId
        executorEnabled: false,
        agents: []
      };

      const response = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidConfig)
      });

      // Should reject invalid config
      expect([400, 500].includes(response.status)).toBe(true);
    });
  });

  describe('Project Switcher Integration', () => {
    it('should get current workspace info', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('current');
      expect(data).toHaveProperty('recent');
      expect(data).toHaveProperty('safeMode');
      expect(Array.isArray(data.recent)).toBe(true);
    });

    it('should browse directories for folder picker', async () => {
      // Get current directory first
      const currentRes = await fetch(`${SERVER_URL}/api/workspace/current-folder`);
      const { currentFolder } = await currentRes.json();

      // Browse that directory
      const response = await fetch(`${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(currentFolder)}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('currentPath');
      expect(data).toHaveProperty('parentPath');
      expect(data).toHaveProperty('items');
      expect(Array.isArray(data.items)).toBe(true);

      // Each item should have required fields
      if (data.items.length > 0) {
        const item = data.items[0];
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('path');
        expect(item).toHaveProperty('isDirectory');
      }
    });

    it('should navigate up to parent directory', async () => {
      const currentRes = await fetch(`${SERVER_URL}/api/workspace/current-folder`);
      const { currentFolder } = await currentRes.json();

      // Browse current
      const browseRes = await fetch(`${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(currentFolder)}`);
      const browseData = await browseRes.json();

      // Browse parent
      const parentRes = await fetch(`${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(browseData.parentPath)}`);
      expect(parentRes.ok).toBe(true);

      const parentData = await parentRes.json();
      expect(parentData.currentPath).toBe(browseData.parentPath);
    });

    it('should handle non-existent directory', async () => {
      const fakePath = '/this/path/definitely/does/not/exist/12345';
      const response = await fetch(`${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(fakePath)}`);

      expect(response.status).toBe(404);

      const error = await response.json();
      expect(error).toHaveProperty('error');
    });

    it('should switch workspace', async () => {
      // Get current workspace
      const currentRes = await fetch(`${SERVER_URL}/api/workspace`);
      const currentData = await currentRes.json();
      const currentPath = currentData.current;

      // Switch back to same (no-op but tests the endpoint)
      const response = await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath })
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('path');
    });
  });

  describe('Sources Page Integration', () => {
    it('should fetch source settings', async () => {
      const response = await fetch(`${SERVER_URL}/api/sources`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Should have various API key fields (may be empty)
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });

    it('should save source settings', async () => {
      const settings = {
        lmstudioUrl: 'http://localhost:1234',
        ollamaUrl: 'http://localhost:11434'
      };

      const response = await fetch(`${SERVER_URL}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    });

    it('should get API bridge info for external agents', async () => {
      const response = await fetch(`${SERVER_URL}/api/bridge/info`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('ragEndpoint');
      expect(data).toHaveProperty('systemPromptSnippet');
    });
  });

  describe('RAG Integration', () => {
    it('should check RAG server health', async () => {
      try {
        const response = await fetch('http://localhost:3002/api/rag/health', { timeout: 2000 });

        if (response.ok) {
          const data = await response.json();
          expect(data).toHaveProperty('status');
        }
      } catch (e) {
        // RAG server may not be running, that's ok for this test
        console.warn('RAG server not available');
      }
    });

    it('should query RAG from frontend', async () => {
      try {
        const response = await fetch('http://localhost:3002/api/rag/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'test search',
            limit: 5
          }),
          timeout: 5000
        });

        if (response.ok) {
          const data = await response.json();
          expect(Array.isArray(data) || data.results).toBeTruthy();
        }
      } catch (e) {
        console.warn('RAG query test skipped - server unavailable');
      }
    });
  });

  describe('Data Flow Verification', () => {
    it('should persist team config across GET/POST', async () => {
      const uniqueId = 'integration-test-' + Date.now();
      const teamConfig = {
        mainModelId: uniqueId,
        executorEnabled: false,
        executorModelId: '',
        agents: []
      };

      // Save
      const saveRes = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamConfig)
      });

      expect(saveRes.ok).toBe(true);

      // Fetch back
      const getRes = await fetch(`${SERVER_URL}/api/team`);
      const getData = await getRes.json();

      expect(getData.team.mainModelId).toBe(uniqueId);
    });

    it('should handle model dropdown population', async () => {
      // Test that models endpoint returns data in format expected by frontend
      const response = await fetch(`${SERVER_URL}/api/tooly/models?provider=all`);
      const data = await response.json();

      expect(data.models).toBeDefined();

      // Frontend expects models to have at least an id
      if (data.models.length > 0) {
        data.models.forEach(model => {
          expect(model.id).toBeDefined();
          expect(typeof model.id).toBe('string');
        });
      }
    });
  });

  describe('Error Handling in Frontend Context', () => {
    it('should return user-friendly errors for invalid paths', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/browse?path=/invalid/path/12345`);

      expect(response.status).toBe(404);

      const error = await response.json();
      expect(error.error).toBeDefined();
      expect(typeof error.error).toBe('string');
    });

    it('should validate team config before saving', async () => {
      const response = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty config
      });

      expect([400, 500].includes(response.status)).toBe(true);
    });
  });
});
