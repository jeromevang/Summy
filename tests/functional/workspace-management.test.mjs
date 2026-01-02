/**
 * Workspace Management & Project Switching Tests
 * Tests dynamic project switching, RAG reindexing, MCP restart
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = 'http://localhost:3001';
const RAG_SERVER_URL = 'http://localhost:3002';

const PROJECT_A = path.join(__dirname, '../fixtures/project-a');
const PROJECT_B = path.join(__dirname, '../fixtures/project-b');

describe('Workspace Management Tests', () => {
  beforeAll(async () => {
    // Create two test projects
    await fs.mkdir(PROJECT_A, { recursive: true });
    await fs.mkdir(PROJECT_B, { recursive: true });

    // Project A files
    await fs.writeFile(
      path.join(PROJECT_A, 'auth.ts'),
      'export const AUTH_MODULE = "project-a";'
    );

    await fs.writeFile(
      path.join(PROJECT_A, 'config.json'),
      JSON.stringify({ project: 'A', version: '1.0' })
    );

    // Project B files
    await fs.writeFile(
      path.join(PROJECT_B, 'database.ts'),
      'export const DB_MODULE = "project-b";'
    );

    await fs.writeFile(
      path.join(PROJECT_B, 'config.json'),
      JSON.stringify({ project: 'B', version: '2.0' })
    );

    // Initialize git repos
    try {
      execSync('git init', { cwd: PROJECT_A, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: PROJECT_A, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: PROJECT_A, stdio: 'ignore' });
      execSync('git add .', { cwd: PROJECT_A, stdio: 'ignore' });
      execSync('git commit -m "initial"', { cwd: PROJECT_A, stdio: 'ignore' });

      execSync('git init', { cwd: PROJECT_B, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: PROJECT_B, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: PROJECT_B, stdio: 'ignore' });
      execSync('git add .', { cwd: PROJECT_B, stdio: 'ignore' });
      execSync('git commit -m "initial"', { cwd: PROJECT_B, stdio: 'ignore' });
    } catch (e) {
      console.warn('Git setup warning:', e.message);
    }
  });

  afterAll(async () => {
    await fs.rm(PROJECT_A, { recursive: true, force: true });
    await fs.rm(PROJECT_B, { recursive: true, force: true });
  });

  describe('3.1 Project Switching', () => {
    it('should get current workspace', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/current`);
      expect(response.ok).toBe(true);

      const workspace = await response.json();
      expect(workspace).toHaveProperty('path');
      expect(workspace).toHaveProperty('projectHash');
    });

    it('should switch to Project A', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_A })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('path', PROJECT_A);
      expect(result).toHaveProperty('projectHash');
    });

    it('should verify RAG reindexed for Project A', async () => {
      // Wait for reindexing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const ragStatus = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      const status = await ragStatus.json();

      expect(status.projectPath).toBe(PROJECT_A);
      expect(status.fileCount).toBeGreaterThan(0);

      // Search for Project A specific content
      const searchResponse = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'project-a' })
      });

      const results = await searchResponse.json();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('project-a');
    });

    it('should switch to Project B', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_B })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();

      expect(result.path).toBe(PROJECT_B);
      expect(result.projectHash).not.toBe(undefined);
    });

    it('should verify RAG reindexed for Project B', async () => {
      // Wait for reindexing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const ragStatus = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      const status = await ragStatus.json();

      expect(status.projectPath).toBe(PROJECT_B);

      // Search for Project B specific content
      const searchResponse = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'project-b' })
      });

      const results = await searchResponse.json();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('project-b');
    });

    it('should not find Project A content in Project B index', async () => {
      const searchResponse = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'AUTH_MODULE project-a' })
      });

      const results = await searchResponse.json();

      // Should either have no results or very low relevance
      if (results.length > 0) {
        expect(results[0].score).toBeLessThan(0.5);
      }
    });

    it('should get list of recent projects', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/recent`);
      expect(response.ok).toBe(true);

      const recent = await response.json();
      expect(Array.isArray(recent)).toBe(true);
      expect(recent.length).toBeGreaterThanOrEqual(2);

      // Should include both projects
      const paths = recent.map(p => p.path);
      expect(paths).toContain(PROJECT_A);
      expect(paths).toContain(PROJECT_B);
    });

    it('should persist project-scoped data separately', async () => {
      // Switch to Project A and save some data
      await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_A })
      });

      await fetch(`${SERVER_URL}/api/workspace/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'test', value: 'project-a-data' })
      });

      // Switch to Project B
      await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_B })
      });

      // Metadata should be different
      const metadataB = await fetch(`${SERVER_URL}/api/workspace/metadata`);
      const dataB = await metadataB.json();

      expect(dataB.test).not.toBe('project-a-data');

      // Switch back to A
      await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_A })
      });

      // Should retrieve original data
      const metadataA = await fetch(`${SERVER_URL}/api/workspace/metadata`);
      const dataA = await metadataA.json();

      expect(dataA.test).toBe('project-a-data');
    });
  });

  describe('3.2 Git Integration & Safe Mode', () => {
    it('should detect clean git repository', async () => {
      await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_A })
      });

      const response = await fetch(`${SERVER_URL}/api/workspace/git-status`);
      expect(response.ok).toBe(true);

      const gitStatus = await response.json();
      expect(gitStatus).toHaveProperty('isClean', true);
      expect(gitStatus).toHaveProperty('branch');
      expect(gitStatus).toHaveProperty('hasUncommittedChanges', false);
    });

    it('should detect dirty repository after file modification', async () => {
      // Modify a file
      await fs.appendFile(
        path.join(PROJECT_A, 'auth.ts'),
        '\n// Modified'
      );

      const response = await fetch(`${SERVER_URL}/api/workspace/git-status`);
      const gitStatus = await response.json();

      expect(gitStatus.isClean).toBe(false);
      expect(gitStatus.hasUncommittedChanges).toBe(true);
      expect(gitStatus.modifiedFiles).toContain('auth.ts');
    });

    it('should activate safe mode on dirty repository', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/safe-mode`);
      const safeModeStatus = await response.json();

      expect(safeModeStatus.enabled).toBe(true);
      expect(safeModeStatus.reason).toContain('uncommitted');
    });

    it('should block file modifications in safe mode', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/validate-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'write',
          path: path.join(PROJECT_A, 'newfile.ts')
        })
      });

      expect(response.status).toBe(403);
      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('safe mode');
    });

    it('should allow read operations in safe mode', async () => {
      const response = await fetch(`${SERVER_URL}/api/workspace/validate-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'read',
          path: path.join(PROJECT_A, 'auth.ts')
        })
      });

      expect(response.ok).toBe(true);
    });

    it('should deactivate safe mode after commit', async () => {
      // Commit changes
      execSync('git add .', { cwd: PROJECT_A, stdio: 'ignore' });
      execSync('git commit -m "test commit"', { cwd: PROJECT_A, stdio: 'ignore' });

      // Refresh git status
      await fetch(`${SERVER_URL}/api/workspace/refresh`, { method: 'POST' });

      const response = await fetch(`${SERVER_URL}/api/workspace/safe-mode`);
      const safeModeStatus = await response.json();

      expect(safeModeStatus.enabled).toBe(false);
    });
  });

  describe('3.3 MCP Server Integration', () => {
    it('should verify MCP server working directory changes', async () => {
      // Switch to Project A
      await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_A })
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check MCP status
      const mcpStatus = await fetch(`${SERVER_URL}/api/tooly/mcp/status`);
      const status = await mcpStatus.json();

      expect(status).toHaveProperty('connected', true);
      expect(status).toHaveProperty('workingDirectory');
      expect(status.workingDirectory).toBe(PROJECT_A);
    });

    it('should restart MCP server on project switch', async () => {
      const statusBefore = await fetch(`${SERVER_URL}/api/tooly/mcp/status`);
      const beforeData = await statusBefore.json();
      const pidBefore = beforeData.processId;

      // Switch project
      await fetch(`${SERVER_URL}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: PROJECT_B })
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusAfter = await fetch(`${SERVER_URL}/api/tooly/mcp/status`);
      const afterData = await statusAfter.json();

      expect(afterData.processId).not.toBe(pidBefore);
      expect(afterData.workingDirectory).toBe(PROJECT_B);
    });
  });
});
