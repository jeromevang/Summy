/**
 * Learning System (Tooly) Functional Tests
 * Tests combo teaching, prosthetic generation, failure analysis
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3001';
const API_BASE = `${SERVER_URL}/api/tooly`;

describe('Learning System Tests', () => {
  let testModelId;
  let mainArchitectId;
  let executorId;

  beforeAll(async () => {
    // Discover available models
    const modelsResponse = await fetch(`${API_BASE}/models`);
    const models = await modelsResponse.json();

    if (models.length > 0) {
      testModelId = models[0].id;
      mainArchitectId = models[0].id;
      executorId = models.length > 1 ? models[1].id : models[0].id;
    }
  });

  describe('5.1 Model Testing', () => {
    it('should list available models', async () => {
      const response = await fetch(`${API_BASE}/models?provider=all`);
      expect(response.ok).toBe(true);

      const models = await response.json();
      expect(Array.isArray(models)).toBe(true);

      if (models.length > 0) {
        expect(models[0]).toHaveProperty('id');
        expect(models[0]).toHaveProperty('provider');
        expect(models[0]).toHaveProperty('capabilities');
      }
    });

    it('should get model details', async () => {
      if (!testModelId) {
        console.log('Skipping: No models available');
        return;
      }

      const response = await fetch(`${API_BASE}/models/${encodeURIComponent(testModelId)}/detail`);
      expect(response.ok).toBe(true);

      const details = await response.json();
      expect(details).toHaveProperty('id', testModelId);
      expect(details).toHaveProperty('profile');
    });

    it('should run baseline tests on a model', async () => {
      if (!testModelId) {
        console.log('Skipping: No models available');
        return;
      }

      const response = await fetch(`${API_BASE}/models/${encodeURIComponent(testModelId)}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testSuite: 'baseline'
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result).toHaveProperty('testResults');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('timestamp');
    }, 30000); // 30 second timeout for API calls

    it('should store test results', async () => {
      if (!testModelId) {
        console.log('Skipping: No models available');
        return;
      }

      const response = await fetch(`${API_BASE}/tests?modelId=${encodeURIComponent(testModelId)}&limit=10`);
      expect(response.ok).toBe(true);

      const tests = await response.json();
      expect(Array.isArray(tests)).toBe(true);

      if (tests.length > 0) {
        expect(tests[0]).toHaveProperty('modelId');
        expect(tests[0]).toHaveProperty('score');
        expect(tests[0]).toHaveProperty('results');
      }
    });

    it('should run latency profiling', async () => {
      if (!testModelId) {
        console.log('Skipping: No models available');
        return;
      }

      const response = await fetch(`${API_BASE}/models/${encodeURIComponent(testModelId)}/latency-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleSize: 5
        })
      });

      expect(response.ok).toBe(true);
      const profile = await response.json();

      expect(profile).toHaveProperty('avgLatency');
      expect(profile).toHaveProperty('tokensPerSecond');
      expect(profile).toHaveProperty('samples');
    }, 60000);
  });

  describe('5.2 Custom Test Creation', () => {
    let customTestId;

    it('should create a custom test', async () => {
      const response = await fetch(`${API_BASE}/custom-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Authentication Logic',
          description: 'Tests if model understands auth patterns',
          category: 'logic',
          prompt: 'Explain how JWT authentication works',
          expectedKeywords: ['token', 'jwt', 'authentication'],
          passingScore: 70
        })
      });

      expect(response.ok).toBe(true);
      const test = await response.json();

      expect(test).toHaveProperty('id');
      customTestId = test.id;
    });

    it('should list custom tests', async () => {
      const response = await fetch(`${API_BASE}/custom-tests`);
      expect(response.ok).toBe(true);

      const tests = await response.json();
      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);

      const ourTest = tests.find(t => t.id === customTestId);
      expect(ourTest).toBeDefined();
      expect(ourTest.name).toBe('Test Authentication Logic');
    });

    it('should execute custom test on a model', async () => {
      if (!testModelId || !customTestId) {
        console.log('Skipping: Prerequisites not met');
        return;
      }

      const response = await fetch(`${API_BASE}/custom-tests/${customTestId}/try`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: testModelId })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('response');
    }, 30000);

    it('should update custom test', async () => {
      if (!customTestId) {
        console.log('Skipping: No custom test created');
        return;
      }

      const response = await fetch(`${API_BASE}/custom-tests/${customTestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customTestId,
          name: 'Updated Auth Test',
          description: 'Updated description',
          category: 'logic',
          prompt: 'Explain how JWT authentication works',
          expectedKeywords: ['token', 'jwt', 'authentication', 'bearer'],
          passingScore: 75
        })
      });

      expect(response.ok).toBe(true);
    });

    it('should delete custom test', async () => {
      if (!customTestId) {
        console.log('Skipping: No custom test created');
        return;
      }

      const response = await fetch(`${API_BASE}/custom-tests/${customTestId}`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);

      // Verify deletion
      const listResponse = await fetch(`${API_BASE}/custom-tests`);
      const tests = await listResponse.json();
      const deleted = tests.find(t => t.id === customTestId);
      expect(deleted).toBeUndefined();
    });
  });

  describe('5.3 Combo Teaching', () => {
    it('should get combo teaching status', async () => {
      const response = await fetch(`${API_BASE}/controller/status`);
      expect(response.ok).toBe(true);

      const status = await response.json();
      expect(status).toHaveProperty('mode');
      expect(status).toHaveProperty('isActive');
    });

    it('should run combo teaching session', async () => {
      if (!mainArchitectId || !executorId) {
        console.log('Skipping: Not enough models available');
        return;
      }

      const response = await fetch(`${API_BASE}/controller/run-combo-teaching`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainModelId: mainArchitectId,
          executorModelId: executorId,
          maxAttempts: 3,
          targetScore: 70
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result).toHaveProperty('iterations');
      expect(result).toHaveProperty('finalScore');
      expect(result).toHaveProperty('prosthetic');
    }, 120000); // 2 minute timeout

    it('should get combo teaching results', async () => {
      const response = await fetch(`${API_BASE}/controller/combo-teaching-results`);
      expect(response.ok).toBe(true);

      const results = await response.json();
      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('mainModel');
        expect(results[0]).toHaveProperty('executorModel');
        expect(results[0]).toHaveProperty('score');
        expect(results[0]).toHaveProperty('iterations');
      }
    });

    it('should retrieve generated prosthetics', async () => {
      const response = await fetch(`${API_BASE}/prosthetics?type=combo`);
      expect(response.ok).toBe(true);

      const prosthetics = await response.json();
      expect(Array.isArray(prosthetics)).toBe(true);

      if (prosthetics.length > 0) {
        expect(prosthetics[0]).toHaveProperty('id');
        expect(prosthetics[0]).toHaveProperty('prompt');
        expect(prosthetics[0]).toHaveProperty('modelPair');
        expect(prosthetics[0]).toHaveProperty('effectiveness');
      }
    });
  });

  describe('5.4 Prosthetic Manager', () => {
    let prostheticId;

    it('should create a prosthetic manually', async () => {
      if (!mainArchitectId || !executorId) {
        console.log('Skipping: Not enough models available');
        return;
      }

      const response = await fetch(`${API_BASE}/prosthetics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Manual Test Prosthetic',
          type: 'combo',
          prompt: 'You are working with an executor model. Break down tasks clearly.',
          modelPair: {
            main: mainArchitectId,
            executor: executorId
          },
          tags: ['test', 'manual']
        })
      });

      expect(response.ok).toBe(true);
      const prosthetic = await response.json();
      expect(prosthetic).toHaveProperty('id');
      prostheticId = prosthetic.id;
    });

    it('should list prosthetics', async () => {
      const response = await fetch(`${API_BASE}/prosthetics`);
      expect(response.ok).toBe(true);

      const prosthetics = await response.json();
      expect(Array.isArray(prosthetics)).toBe(true);
    });

    it('should get prosthetic by ID', async () => {
      if (!prostheticId) {
        console.log('Skipping: No prosthetic created');
        return;
      }

      const response = await fetch(`${API_BASE}/prosthetics/${prostheticId}`);
      expect(response.ok).toBe(true);

      const prosthetic = await response.json();
      expect(prosthetic.id).toBe(prostheticId);
      expect(prosthetic.name).toBe('Manual Test Prosthetic');
    });

    it('should test prosthetic before applying', async () => {
      if (!prostheticId || !mainArchitectId) {
        console.log('Skipping: Prerequisites not met');
        return;
      }

      const response = await fetch(`${API_BASE}/prosthetics/${prostheticId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: mainArchitectId,
          testPrompt: 'Break down the task of building a login form'
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('effectiveness');
    }, 30000);

    it('should apply prosthetic to model', async () => {
      if (!prostheticId || !mainArchitectId) {
        console.log('Skipping: Prerequisites not met');
        return;
      }

      const response = await fetch(`${API_BASE}/controller/apply-prosthetic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: mainArchitectId,
          prostheticId: prostheticId
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result).toHaveProperty('applied', true);
    });

    it('should delete prosthetic', async () => {
      if (!prostheticId) {
        console.log('Skipping: No prosthetic created');
        return;
      }

      const response = await fetch(`${API_BASE}/prosthetics/${prostheticId}`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('5.5 Failure Analysis', () => {
    it('should log a failure', async () => {
      if (!testModelId) {
        console.log('Skipping: No models available');
        return;
      }

      const response = await fetch(`${API_BASE}/failures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: testModelId,
          category: 'tool_execution',
          description: 'Failed to execute git command',
          context: 'User asked to commit changes',
          errorMessage: 'git: command not found'
        })
      });

      expect(response.ok).toBe(true);
      const failure = await response.json();
      expect(failure).toHaveProperty('id');
      expect(failure).toHaveProperty('timestamp');
    });

    it('should retrieve failure patterns', async () => {
      const response = await fetch(`${API_BASE}/failures/patterns`);
      expect(response.ok).toBe(true);

      const patterns = await response.json();
      expect(Array.isArray(patterns)).toBe(true);

      if (patterns.length > 0) {
        expect(patterns[0]).toHaveProperty('pattern');
        expect(patterns[0]).toHaveProperty('frequency');
        expect(patterns[0]).toHaveProperty('category');
      }
    });

    it('should get unresolved failures', async () => {
      const response = await fetch(`${API_BASE}/failures?resolved=false&limit=20`);
      expect(response.ok).toBe(true);

      const failures = await response.json();
      expect(Array.isArray(failures)).toBe(true);

      failures.forEach(failure => {
        expect(failure.resolved).toBe(false);
      });
    });

    it('should mark failure as resolved', async () => {
      // Get an unresolved failure
      const listResponse = await fetch(`${API_BASE}/failures?resolved=false&limit=1`);
      const failures = await listResponse.json();

      if (failures.length === 0) {
        console.log('Skipping: No unresolved failures');
        return;
      }

      const failureId = failures[0].id;

      const response = await fetch(`${API_BASE}/failures/${failureId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solution: 'Installed git and configured PATH',
          prostheticGenerated: false
        })
      });

      expect(response.ok).toBe(true);

      // Verify resolution
      const checkResponse = await fetch(`${API_BASE}/failures/${failureId}`);
      const failure = await checkResponse.json();
      expect(failure.resolved).toBe(true);
    });

    it('should analyze failures and suggest improvements', async () => {
      const response = await fetch(`${API_BASE}/controller/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframe: '7d'
        })
      });

      expect(response.ok).toBe(true);
      const analysis = await response.json();

      expect(analysis).toHaveProperty('totalFailures');
      expect(analysis).toHaveProperty('patterns');
      expect(analysis).toHaveProperty('recommendations');
    });
  });
});
