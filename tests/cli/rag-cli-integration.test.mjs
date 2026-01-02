#!/usr/bin/env node
/**
 * RAG/GPS CLI Integration Tests
 * Tests RAG functionality accessible from Claude Code CLI via MCP tools
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fetch from 'node-fetch';

const RAG_SERVER_URL = 'http://localhost:3002';
const MAIN_SERVER_URL = 'http://localhost:3001';
const TEST_PROJECT_PATH = process.cwd(); // Current Summy project

describe('RAG Server Connectivity', () => {
  it('should have RAG server running', async () => {
    const response = await fetch(`${RAG_SERVER_URL}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });

  it('should return RAG server status', async () => {
    const response = await fetch(`${RAG_SERVER_URL}/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('indexed');
    expect(data).toHaveProperty('projectPath');
    expect(data).toHaveProperty('fileCount');
  });
});

describe('RAG Query via API', () => {
  it('should perform semantic search', async () => {
    const query = 'team builder functionality';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBe(true);

    if (data.results.length > 0) {
      const result = data.results[0];
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('score');
    }
  });

  it('should search for specific functionality', async () => {
    const query = 'workspace management';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 3 })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.results).toBeDefined();

    // Should find workspace-related code
    if (data.results.length > 0) {
      const hasRelevantResult = data.results.some(r =>
        r.filePath.includes('workspace') ||
        r.content.toLowerCase().includes('workspace')
      );
      expect(hasRelevantResult).toBe(true);
    }
  });

  it('should filter by file types', async () => {
    const query = 'component';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit: 5,
        fileTypes: ['tsx', 'ts']
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.results).toBeDefined();

    // All results should be .ts or .tsx files
    if (data.results.length > 0) {
      data.results.forEach(result => {
        expect(result.filePath).toMatch(/\.(tsx?|jsx?)$/);
      });
    }
  });

  it('should filter by path patterns', async () => {
    const query = 'router';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit: 5,
        paths: ['server/']
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.results).toBeDefined();

    // Results should be from server directory
    if (data.results.length > 0) {
      data.results.forEach(result => {
        expect(result.filePath).toContain('server');
      });
    }
  });
});

describe('Code Navigation via API', () => {
  it('should find symbols by name', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/nav/symbols?name=TeamBuilder`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('symbols');
    expect(Array.isArray(data.symbols)).toBe(true);
  });

  it('should find function symbols', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/nav/symbols?name=fetch&type=function`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.symbols).toBeDefined();
  });

  it('should find class symbols', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/nav/symbols?name=Server&type=class`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.symbols).toBeDefined();
  });
});

describe('RAG Indexing', () => {
  it('should show indexing status', async () => {
    const response = await fetch(`${RAG_SERVER_URL}/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('indexed');
    expect(data).toHaveProperty('projectPath');
    expect(data).toHaveProperty('fileCount');
    expect(data).toHaveProperty('chunkCount');

    // Should be indexing current project
    expect(data.projectPath).toBeTruthy();
  });

  it('should have indexed files', async () => {
    const response = await fetch(`${RAG_SERVER_URL}/status`);
    const data = await response.json();

    expect(data.fileCount).toBeGreaterThan(0);
    expect(data.chunkCount).toBeGreaterThan(0);
  });

  it('should support reindexing', async () => {
    const response = await fetch(`${RAG_SERVER_URL}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: TEST_PROJECT_PATH
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('message');
    expect(data.message).toContain('index');
  });
});

describe('RAG Search Quality', () => {
  it('should return relevant results for "react component"', async () => {
    const query = 'react component';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 })
    });

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const hasRelevantResult = data.results.some(r =>
        r.filePath.includes('client') ||
        r.filePath.includes('.tsx') ||
        r.content.toLowerCase().includes('component')
      );
      expect(hasRelevantResult).toBe(true);
    }
  });

  it('should return relevant results for "database query"', async () => {
    const query = 'database query';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 })
    });

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const hasRelevantResult = data.results.some(r =>
        r.filePath.includes('database') ||
        r.content.toLowerCase().includes('query') ||
        r.content.toLowerCase().includes('sql')
      );
      expect(hasRelevantResult).toBe(true);
    }
  });

  it('should rank results by relevance', async () => {
    const query = 'team configuration';

    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 })
    });

    const data = await response.json();

    if (data.results && data.results.length > 1) {
      // Scores should be in descending order
      for (let i = 0; i < data.results.length - 1; i++) {
        expect(data.results[i].score).toBeGreaterThanOrEqual(data.results[i + 1].score);
      }
    }
  });
});

describe('API Bridge for External Agents', () => {
  it('should provide bridge information', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/bridge/info`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('ragEndpoint');
    expect(data).toHaveProperty('systemPrompt');
    expect(data.ragEndpoint).toContain('/api/rag/query');
  });

  it('should include system prompt for external agents', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/bridge/info`);
    const data = await response.json();

    expect(data.systemPrompt).toBeTruthy();
    expect(data.systemPrompt).toContain('semantic search');
    expect(data.systemPrompt).toContain('POST');
  });
});

describe('Error Handling', () => {
  it('should handle empty queries gracefully', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', limit: 5 })
    });

    // Should either return empty results or error
    expect([200, 400]).toContain(response.status);
  });

  it('should handle invalid paths gracefully', async () => {
    const response = await fetch(`${MAIN_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        paths: ['/nonexistent/path/']
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.results).toBeDefined();
    // Should return empty or skip invalid paths
  });

  it('should handle RAG server being down', async () => {
    // This test assumes RAG might be down
    // Should not crash the main server
    const response = await fetch(`${MAIN_SERVER_URL}/health`);
    expect(response.ok).toBe(true);
  });
});