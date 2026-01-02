/**
 * RAG Server Functional Tests
 * Tests indexing, file watching, and semantic search
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAG_SERVER_URL = 'http://localhost:3002';
const TEST_PROJECT_DIR = path.join(__dirname, '../fixtures/test-project');

describe('RAG Server Functional Tests', () => {
  beforeAll(async () => {
    // Create test project directory structure
    await fs.mkdir(TEST_PROJECT_DIR, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(TEST_PROJECT_DIR, 'auth.ts'),
      `
export async function authenticateUser(username: string, password: string) {
  const user = await database.findUser(username);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}
      `.trim()
    );

    await fs.writeFile(
      path.join(TEST_PROJECT_DIR, 'database.ts'),
      `
export class DatabaseService {
  async findUser(username: string) {
    return this.users.find(u => u.username === username);
  }

  async saveUser(user: User) {
    this.users.push(user);
  }
}
      `.trim()
    );

    await fs.writeFile(
      path.join(TEST_PROJECT_DIR, 'utils.ts'),
      `
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function validateEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}
      `.trim()
    );
  });

  afterAll(async () => {
    // Cleanup test project
    await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
  });

  describe('1.1 Indexing Tests', () => {
    it('should index a project directory', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: TEST_PROJECT_DIR })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result).toHaveProperty('status', 'indexing_started');
    });

    it('should complete indexing and return status', async () => {
      // Wait for indexing to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      const response = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      expect(response.ok).toBe(true);

      const status = await response.json();
      expect(status.isIndexing).toBe(false);
      expect(status.fileCount).toBeGreaterThan(0);
      expect(status.totalChunks).toBeGreaterThan(0);
    });

    it('should index all supported file types', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      const status = await response.json();

      // Should have indexed .ts files
      expect(status.fileCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('1.2 File Watcher Tests', () => {
    it('should detect new file creation', async () => {
      const newFilePath = path.join(TEST_PROJECT_DIR, 'newfile.ts');
      await fs.writeFile(newFilePath, 'export const NEW_CONST = 42;');

      // Wait for file watcher to detect and reindex
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      const status = await response.json();

      // File count should have increased
      expect(status.fileCount).toBeGreaterThanOrEqual(4);
    });

    it('should detect file modifications', async () => {
      const filePath = path.join(TEST_PROJECT_DIR, 'auth.ts');
      await fs.appendFile(filePath, '\n\nexport const AUTH_VERSION = "2.0";');

      // Wait for reindexing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Search for the new content
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'AUTH_VERSION' })
      });

      const results = await response.json();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should detect file deletion', async () => {
      const statusBefore = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      const beforeData = await statusBefore.json();
      const fileCountBefore = beforeData.fileCount;

      await fs.unlink(path.join(TEST_PROJECT_DIR, 'newfile.ts'));

      // Wait for file watcher
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusAfter = await fetch(`${RAG_SERVER_URL}/api/rag/status`);
      const afterData = await statusAfter.json();

      expect(afterData.fileCount).toBeLessThan(fileCountBefore);
    });
  });

  describe('1.3 Semantic Search Tests', () => {
    it('should find authentication-related code', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'how does authentication work',
          limit: 5
        })
      });

      expect(response.ok).toBe(true);
      const results = await response.json();

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('filePath');
      expect(results[0]).toHaveProperty('score');

      // Should find auth.ts file
      const hasAuthFile = results.some(r => r.filePath.includes('auth.ts'));
      expect(hasAuthFile).toBe(true);
    });

    it('should find database-related code', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'database user lookup',
          limit: 5
        })
      });

      const results = await response.json();
      expect(results.length).toBeGreaterThan(0);

      const hasDatabaseFile = results.some(r => r.filePath.includes('database.ts'));
      expect(hasDatabaseFile).toBe(true);
    });

    it('should rank results by relevance', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'validateEmail function',
          limit: 5
        })
      });

      const results = await response.json();
      expect(results.length).toBeGreaterThan(0);

      // First result should be most relevant
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);

      // Should find the validateEmail function
      const hasValidateEmail = results.some(r => r.content.includes('validateEmail'));
      expect(hasValidateEmail).toBe(true);
    });

    it('should handle empty queries gracefully', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '' })
      });

      expect(response.status).toBe(400);
    });

    it('should support file type filters', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'function',
          fileTypes: ['ts'],
          limit: 10
        })
      });

      const results = await response.json();

      // All results should be .ts files
      results.forEach(result => {
        expect(result.filePath).toMatch(/\.ts$/);
      });
    });
  });

  describe('1.4 Symbol Search Tests', () => {
    it('should find function symbols', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/nav/symbols?name=authenticateUser`);
      expect(response.ok).toBe(true);

      const symbols = await response.json();
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0]).toHaveProperty('name', 'authenticateUser');
      expect(symbols[0]).toHaveProperty('type', 'function');
    });

    it('should find class symbols', async () => {
      const response = await fetch(`${RAG_SERVER_URL}/api/nav/symbols?name=DatabaseService`);

      const symbols = await response.json();
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0]).toHaveProperty('name', 'DatabaseService');
      expect(symbols[0]).toHaveProperty('type', 'class');
    });
  });
});
