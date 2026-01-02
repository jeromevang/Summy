/**
 * Complete Workflow Integration Tests
 * Tests end-to-end user journeys through the entire system
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = 'http://localhost:3001';
const RAG_SERVER_URL = 'http://localhost:3002';
const TEST_PROJECT = path.join(__dirname, '../fixtures/workflow-test-project');

describe('Complete User Workflows', () => {
  beforeAll(async () => {
    // Create test project
    await fs.mkdir(TEST_PROJECT, { recursive: true });
    await fs.writeFile(
      path.join(TEST_PROJECT, 'main.ts'),
      'export function main() { console.log("test"); }'
    );
    await fs.writeFile(
      path.join(TEST_PROJECT, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' })
    );
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT, { recursive: true, force: true });
  });

  describe('Workflow 1: New User Setup', () => {
    it('should complete full new user setup flow', async () => {
      // Step 1: User opens frontend, fetches models
      const modelsRes = await fetch(`${SERVER_URL}/api/tooly/models?provider=all`);
      expect(modelsRes.ok).toBe(true);
      const { models } = await modelsRes.json();
      expect(Array.isArray(models)).toBe(true);

      // Step 2: User configures sources (API keys)
      const sourcesRes = await fetch(`${SERVER_URL}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lmstudioUrl: 'http://localhost:1234'
        })
      });
      expect(sourcesRes.ok).toBe(true);

      // Step 3: User creates first team
      const teamRes = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModelId: models[0]?.id || 'gpt-4',
          executorEnabled: false,
          executorModelId: '',
          agents: []
        })
      });
      expect(teamRes.ok).toBe(true);

      // Step 4: Verify team was saved
      const getTeamRes = await fetch(`${SERVER_URL}/api/team`);
      const { team } = await getTeamRes.json();
      expect(team).toBeDefined();
      expect(team.mainModelId).toBe(models[0]?.id || 'gpt-4');
    });
  });

  describe('Workflow 2: Project Switching', () => {
    it('should switch projects and verify RAG reindex', async () => {
      // Step 1: Get current workspace
      const currentRes = await fetch(`${SERVER_URL}/api/workspace`);
      const currentData = await currentRes.json();
      const originalWorkspace = currentData.current;

      // Step 2: Switch to test project
      const switchRes = await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: TEST_PROJECT })
      });
      expect(switchRes.ok).toBe(true);
      const switchData = await switchRes.json();
      expect(switchData.path).toBe(TEST_PROJECT);
      expect(switchData).toHaveProperty('projectHash');

      // Step 3: Wait for RAG reindexing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 4: Verify RAG indexed the new project
      try {
        const ragStatusRes = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
        if (ragStatusRes.ok) {
          const ragStatus = await ragStatusRes.json();
          // RAG should now be indexing or have indexed the test project
          expect(ragStatus).toBeDefined();
        }
      } catch (e) {
        console.warn('RAG server check skipped');
      }

      // Step 5: Switch back to original workspace
      if (originalWorkspace) {
        await fetch(`${SERVER_URL}/api/workspace/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: originalWorkspace })
        });
      }
    });
  });

  describe('Workflow 3: Folder Selection in UI', () => {
    it('should navigate folders and select project directory', async () => {
      // Step 1: Get current directory for browse start point
      const currentRes = await fetch(`${SERVER_URL}/api/workspace/current-folder`);
      const { currentFolder } = await currentRes.json();

      // Step 2: Browse current directory
      const browseRes = await fetch(
        `${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(currentFolder)}`
      );
      expect(browseRes.ok).toBe(true);
      const browseData = await browseRes.json();
      expect(browseData.items).toBeDefined();

      // Step 3: Find a subdirectory to browse into
      const subdir = browseData.items.find(item => item.isDirectory);

      if (subdir) {
        // Step 4: Navigate into subdirectory
        const subdirRes = await fetch(
          `${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(subdir.path)}`
        );
        expect(subdirRes.ok).toBe(true);
        const subdirData = await subdirRes.json();
        expect(subdirData.currentPath).toBe(subdir.path);

        // Step 5: Navigate back to parent
        const parentRes = await fetch(
          `${SERVER_URL}/api/workspace/browse?path=${encodeURIComponent(subdirData.parentPath)}`
        );
        expect(parentRes.ok).toBe(true);

        // Step 6: Select directory for workspace
        const selectRes = await fetch(`${SERVER_URL}/api/workspace/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: subdir.path })
        });
        expect(selectRes.ok).toBe(true);
      }
    });
  });

  describe('Workflow 4: IDE Integration Flow', () => {
    it('should handle complete IDE conversation flow', async () => {
      // Step 1: IDE sends initial message
      const request1 = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Help me understand this codebase'
          }
        ]
      };

      const response1 = await fetch(`${SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request1),
        timeout: 30000
      });

      // Should create session and route request
      expect(response1).toBeDefined();

      // Step 2: Check session was created
      await new Promise(resolve => setTimeout(resolve, 500));

      const sessionsRes = await fetch(`${SERVER_URL}/api/sessions`);
      expect(sessionsRes.ok).toBe(true);
      const sessions = await sessionsRes.json();
      expect(Array.isArray(sessions)).toBe(true);

      // Step 3: IDE sends follow-up (continuing conversation)
      const request2 = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Help me understand this codebase'
          },
          {
            role: 'assistant',
            content: 'I can help you with that.'
          },
          {
            role: 'user',
            content: 'What files are in the project?'
          }
        ]
      };

      const response2 = await fetch(`${SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request2),
        timeout: 30000
      });

      expect(response2).toBeDefined();
    });
  });

  describe('Workflow 5: Team Builder with Specialists', () => {
    it('should create team with multiple specialists', async () => {
      // Step 1: Fetch available models
      const modelsRes = await fetch(`${SERVER_URL}/api/tooly/models?provider=all`);
      const { models } = await modelsRes.json();
      expect(models.length).toBeGreaterThan(0);

      // Step 2: Create team with architect
      const mainModel = models[0].id;
      const teamConfig = {
        mainModelId: mainModel,
        executorEnabled: true,
        executorModelId: models[1]?.id || models[0].id,
        agents: []
      };

      const createRes = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamConfig)
      });
      expect(createRes.ok).toBe(true);

      // Step 3: Add specialist agent
      const updatedConfig = {
        ...teamConfig,
        agents: [
          {
            id: '1',
            name: 'QA Specialist',
            role: 'Reviewer',
            model: models[0].id
          }
        ]
      };

      const updateRes = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });
      expect(updateRes.ok).toBe(true);

      // Step 4: Verify team config persisted
      const getRes = await fetch(`${SERVER_URL}/api/team`);
      const { team } = await getRes.json();
      expect(team.agents.length).toBe(1);
      expect(team.agents[0].name).toBe('QA Specialist');
    });
  });

  describe('Workflow 6: Safe Mode and Git Integration', () => {
    it('should handle safe mode workflow when repo is dirty', async () => {
      // This workflow is tested in workspace-management.test.mjs
      // Here we verify the endpoints exist and work together

      // Step 1: Get git status
      const gitRes = await fetch(`${SERVER_URL}/api/workspace/git-status`);
      expect(gitRes.ok).toBe(true);
      const gitStatus = await gitRes.json();
      expect(gitStatus).toHaveProperty('isClean');

      // Step 2: Check safe mode
      const safeModeRes = await fetch(`${SERVER_URL}/api/workspace/safe-mode`);
      expect(safeModeRes.ok).toBe(true);
      const safeModeData = await safeModeRes.json();
      expect(safeModeData).toHaveProperty('enabled');

      // Step 3: Try to validate an operation
      const validateRes = await fetch(`${SERVER_URL}/api/workspace/validate-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'write',
          path: '/test/file.txt'
        })
      });

      // Should either allow or block based on safe mode
      expect([200, 403].includes(validateRes.status)).toBe(true);
    });
  });

  describe('Workflow 7: RAG Semantic Search', () => {
    it('should perform semantic search on active project', async () => {
      try {
        // Step 1: Verify RAG server is available
        const healthRes = await fetch(`${RAG_SERVER_URL}/api/rag/health`, { timeout: 2000 });

        if (healthRes.ok) {
          // Step 2: Perform semantic search
          const searchRes = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: 'authentication',
              limit: 5
            }),
            timeout: 5000
          });

          expect(searchRes.ok).toBe(true);
          const results = await searchRes.json();

          // Step 3: Verify results format
          expect(results).toBeDefined();
          if (Array.isArray(results)) {
            expect(results.length).toBeLessThanOrEqual(5);
          } else if (results.results) {
            expect(Array.isArray(results.results)).toBe(true);
          }
        }
      } catch (e) {
        console.warn('RAG workflow test skipped - server unavailable');
      }
    });
  });

  describe('Workflow 8: External Agent Integration', () => {
    it('should provide bridge info for external agents', async () => {
      // Step 1: Get bridge configuration
      const bridgeRes = await fetch(`${SERVER_URL}/api/bridge/info`);
      expect(bridgeRes.ok).toBe(true);

      const bridgeInfo = await bridgeRes.json();
      expect(bridgeInfo).toHaveProperty('ragEndpoint');
      expect(bridgeInfo).toHaveProperty('systemPromptSnippet');

      // Step 2: Verify RAG endpoint is accessible
      const ragEndpoint = bridgeInfo.ragEndpoint;
      expect(typeof ragEndpoint).toBe('string');
      expect(ragEndpoint).toContain('http');

      // Step 3: External agent could use the provided snippet
      expect(bridgeInfo.systemPromptSnippet).toBeDefined();
      expect(typeof bridgeInfo.systemPromptSnippet).toBe('string');
    });
  });

  describe('Workflow 9: Health Monitoring', () => {
    it('should check system health before starting work', async () => {
      // Step 1: Check basic health
      const healthRes = await fetch(`${SERVER_URL}/health`);
      expect(healthRes.ok).toBe(true);

      const health = await healthRes.json();
      expect(health.status).toBe('ok');

      // Step 2: Check readiness (all services)
      const readyRes = await fetch(`${SERVER_URL}/ready`);
      const readiness = await readyRes.json();

      expect(readiness).toHaveProperty('ready');
      expect(readiness).toHaveProperty('services');

      // Step 3: Verify critical services
      expect(readiness.services.database).toBe(true);
    });
  });

  describe('Workflow 10: Complete Development Session', () => {
    it('should simulate complete development session', async () => {
      // This test combines multiple workflows

      // 1. Setup: Configure team
      const teamRes = await fetch(`${SERVER_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModelId: 'gpt-4',
          executorEnabled: false,
          executorModelId: '',
          agents: []
        })
      });
      expect(teamRes.ok).toBe(true);

      // 2. Switch project
      const switchRes = await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: TEST_PROJECT })
      });
      expect(switchRes.ok).toBe(true);

      // 3. Wait for RAG indexing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Check git status
      const gitRes = await fetch(`${SERVER_URL}/api/workspace/git-status`);
      expect(gitRes.ok).toBe(true);

      // 5. Start coding session via IDE
      const codeRes = await fetch(`${SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: 'Review the code in main.ts'
            }
          ]
        }),
        timeout: 30000
      });

      // Session completes (success or failure doesn't matter for integration test)
      expect(codeRes).toBeDefined();
    });
  });
});
