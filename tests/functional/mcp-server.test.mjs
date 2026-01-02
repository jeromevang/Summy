/**
 * MCP Server Functional Tests
 * Tests all tool categories and execution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, '../fixtures/mcp-test');

class MCPClient {
  constructor() {
    this.process = null;
    this.messageId = 1;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', [
        path.join(__dirname, '../../mcp-server/dist/index.js')
      ], {
        cwd: TEST_DIR,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        const messages = data.toString().split('\n').filter(Boolean);
        messages.forEach(msg => {
          try {
            const parsed = JSON.parse(msg);
            if (parsed.id && this.pendingRequests.has(parsed.id)) {
              const { resolve } = this.pendingRequests.get(parsed.id);
              this.pendingRequests.delete(parsed.id);
              resolve(parsed);
            }
          } catch (e) {
            // Ignore non-JSON output
          }
        });
      });

      this.process.on('error', reject);

      // Wait for server to be ready
      setTimeout(resolve, 1000);
    });
  }

  async call(method, params = {}) {
    const id = this.messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

describe('MCP Server Functional Tests', () => {
  let client;

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(TEST_DIR, 'test.txt'),
      'Hello World'
    );

    await fs.writeFile(
      path.join(TEST_DIR, 'code.js'),
      'function hello() { console.log("hello"); }'
    );

    // Initialize git repo
    const { execSync } = await import('child_process');
    execSync('git init', { cwd: TEST_DIR });
    execSync('git config user.email "test@test.com"', { cwd: TEST_DIR });
    execSync('git config user.name "Test User"', { cwd: TEST_DIR });

    // Start MCP client
    client = new MCPClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('2.1 File Tools', () => {
    it('should read a file', async () => {
      const response = await client.call('tools/call', {
        name: 'read_file',
        arguments: {
          path: path.join(TEST_DIR, 'test.txt')
        }
      });

      expect(response.result).toHaveProperty('content');
      expect(response.result.content).toContain('Hello World');
    });

    it('should write a file', async () => {
      const testPath = path.join(TEST_DIR, 'written.txt');
      const response = await client.call('tools/call', {
        name: 'write_file',
        arguments: {
          path: testPath,
          content: 'Test content'
        }
      });

      expect(response.result).toHaveProperty('success', true);

      // Verify file was created
      const content = await fs.readFile(testPath, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('should edit a file', async () => {
      const testPath = path.join(TEST_DIR, 'test.txt');
      const response = await client.call('tools/call', {
        name: 'edit_file',
        arguments: {
          path: testPath,
          edits: [{
            oldText: 'Hello World',
            newText: 'Hello Universe'
          }]
        }
      });

      expect(response.result).toHaveProperty('success', true);

      // Verify edit
      const content = await fs.readFile(testPath, 'utf-8');
      expect(content).toContain('Hello Universe');
    });

    it('should list directory contents', async () => {
      const response = await client.call('tools/call', {
        name: 'list_directory',
        arguments: {
          path: TEST_DIR
        }
      });

      expect(response.result).toHaveProperty('files');
      expect(Array.isArray(response.result.files)).toBe(true);
      expect(response.result.files.length).toBeGreaterThan(0);
    });

    it('should search files by pattern', async () => {
      const response = await client.call('tools/call', {
        name: 'search_files',
        arguments: {
          directory: TEST_DIR,
          pattern: 'hello'
        }
      });

      expect(response.result).toHaveProperty('matches');
      expect(response.result.matches.length).toBeGreaterThan(0);
    });

    it('should get file info', async () => {
      const response = await client.call('tools/call', {
        name: 'get_file_info',
        arguments: {
          path: path.join(TEST_DIR, 'test.txt')
        }
      });

      expect(response.result).toHaveProperty('size');
      expect(response.result).toHaveProperty('modified');
      expect(response.result).toHaveProperty('isFile', true);
    });

    it('should delete a file', async () => {
      const testPath = path.join(TEST_DIR, 'to-delete.txt');
      await fs.writeFile(testPath, 'delete me');

      const response = await client.call('tools/call', {
        name: 'delete_file',
        arguments: { path: testPath }
      });

      expect(response.result).toHaveProperty('success', true);

      // Verify deletion
      const exists = await fs.access(testPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should copy a file', async () => {
      const source = path.join(TEST_DIR, 'test.txt');
      const dest = path.join(TEST_DIR, 'copied.txt');

      const response = await client.call('tools/call', {
        name: 'copy_file',
        arguments: { source, destination: dest }
      });

      expect(response.result).toHaveProperty('success', true);

      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toContain('Universe');
    });
  });

  describe('2.2 Git Tools', () => {
    it('should get git status', async () => {
      const response = await client.call('tools/call', {
        name: 'git_status',
        arguments: {}
      });

      expect(response.result).toHaveProperty('branch');
      expect(response.result).toHaveProperty('files');
    });

    it('should add files to git', async () => {
      const response = await client.call('tools/call', {
        name: 'git_add',
        arguments: { file: '.' }
      });

      expect(response.result).toHaveProperty('success', true);
    });

    it('should commit changes', async () => {
      const response = await client.call('tools/call', {
        name: 'git_commit',
        arguments: {
          message: 'Test commit'
        }
      });

      expect(response.result).toHaveProperty('success', true);
    });

    it('should show git log', async () => {
      const response = await client.call('tools/call', {
        name: 'git_log',
        arguments: { count: 5 }
      });

      expect(response.result).toHaveProperty('commits');
      expect(Array.isArray(response.result.commits)).toBe(true);
      expect(response.result.commits.length).toBeGreaterThan(0);
    });

    it('should create a git branch', async () => {
      const response = await client.call('tools/call', {
        name: 'git_branch_create',
        arguments: { name: 'test-branch' }
      });

      expect(response.result).toHaveProperty('success', true);
    });

    it('should list git branches', async () => {
      const response = await client.call('tools/call', {
        name: 'git_branch_list',
        arguments: {}
      });

      expect(response.result).toHaveProperty('branches');
      expect(response.result.branches.length).toBeGreaterThan(0);
    });
  });

  describe('2.3 NPM Tools', () => {
    beforeAll(async () => {
      // Create package.json
      await fs.writeFile(
        path.join(TEST_DIR, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          scripts: {
            test: 'echo "test passed"'
          }
        }, null, 2)
      );
    });

    it('should run npm scripts', async () => {
      const response = await client.call('tools/call', {
        name: 'npm_run',
        arguments: { script: 'test' }
      });

      expect(response.result).toHaveProperty('output');
      expect(response.result.output).toContain('test passed');
    });

    it('should list npm packages', async () => {
      const response = await client.call('tools/call', {
        name: 'npm_list',
        arguments: { depth: 0 }
      });

      expect(response.result).toHaveProperty('packages');
    });
  });

  describe('2.4 System Tools', () => {
    it('should execute shell commands', async () => {
      const response = await client.call('tools/call', {
        name: 'shell_exec',
        arguments: {
          command: 'echo "test"'
        }
      });

      expect(response.result).toHaveProperty('output');
      expect(response.result.output).toContain('test');
    });

    it('should list processes', async () => {
      const response = await client.call('tools/call', {
        name: 'process_list',
        arguments: {}
      });

      expect(response.result).toHaveProperty('processes');
      expect(Array.isArray(response.result.processes)).toBe(true);
    });
  });

  describe('2.5 Environment Variables', () => {
    it('should get environment variable', async () => {
      const response = await client.call('tools/call', {
        name: 'env_get',
        arguments: { name: 'PATH' }
      });

      expect(response.result).toHaveProperty('value');
      expect(response.result.value.length).toBeGreaterThan(0);
    });

    it('should set environment variable', async () => {
      const response = await client.call('tools/call', {
        name: 'env_set',
        arguments: {
          name: 'TEST_VAR',
          value: 'test_value'
        }
      });

      expect(response.result).toHaveProperty('success', true);

      // Verify it was set
      const getResponse = await client.call('tools/call', {
        name: 'env_get',
        arguments: { name: 'TEST_VAR' }
      });

      expect(getResponse.result.value).toBe('test_value');
    });
  });
});
