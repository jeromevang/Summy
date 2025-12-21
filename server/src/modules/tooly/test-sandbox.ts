/**
 * Test Sandbox
 * Provides isolated environment for model probing
 * - Separate RAG index for test project only
 * - Path-restricted file access
 * - No leakage from real codebase
 */

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// PATHS
// ============================================================

const TEST_PROJECT_DIR = path.join(__dirname, '../../../data/test-project');
const TEST_PROJECT_INDEX_DIR = path.join(__dirname, '../../../data/test-project-index');
const TEST_MANIFEST_PATH = path.join(TEST_PROJECT_DIR, '.test-manifest.json');

// ============================================================
// TYPES
// ============================================================

export interface TestManifest {
  project: string;
  version: string;
  indexPath: string;
  
  bugs: Record<string, {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    line: number;
    expectedFix: string;
  }>;
  
  architecture: {
    pattern: string;
    layers: string[];
    entryPoints: string[];
  };
  
  dependencies: Record<string, string[]>;
  
  tests: Record<string, {
    prompt: string;
    expectedTool?: string;
    expectedFiles?: string[];
    expectedBehavior?: string;
    variants?: Array<{
      id: string;
      prompt: string;
      difficulty: 'easy' | 'medium' | 'hard';
    }>;
  }>;
}

export interface SandboxConfig {
  ragIndexPath: string;
  allowedPaths: string[];
  blockedPaths: string[];
  testManifest: TestManifest | null;
}

export interface SandboxState {
  active: boolean;
  startedAt: string | null;
  originalRagIndex: string | null;
}

// ============================================================
// TEST SANDBOX CLASS
// ============================================================

class TestSandbox {
  private state: SandboxState = {
    active: false,
    startedAt: null,
    originalRagIndex: null,
  };
  
  private manifest: TestManifest | null = null;

  /**
   * Get test project directory path
   */
  getTestProjectPath(): string {
    return TEST_PROJECT_DIR;
  }

  /**
   * Get test project index path
   */
  getTestIndexPath(): string {
    return TEST_PROJECT_INDEX_DIR;
  }

  /**
   * Check if test project exists
   */
  async testProjectExists(): Promise<boolean> {
    return fs.pathExists(TEST_PROJECT_DIR);
  }

  /**
   * Load test manifest
   */
  async loadManifest(): Promise<TestManifest | null> {
    try {
      if (await fs.pathExists(TEST_MANIFEST_PATH)) {
        this.manifest = await fs.readJson(TEST_MANIFEST_PATH);
        return this.manifest;
      }
    } catch (error) {
      console.error('[TestSandbox] Failed to load manifest:', error);
    }
    return null;
  }

  /**
   * Get test manifest (loads if not cached)
   */
  async getManifest(): Promise<TestManifest | null> {
    if (!this.manifest) {
      await this.loadManifest();
    }
    return this.manifest;
  }

  /**
   * Get sandbox configuration
   */
  getConfig(): SandboxConfig {
    return {
      ragIndexPath: TEST_PROJECT_INDEX_DIR,
      allowedPaths: [TEST_PROJECT_DIR],
      blockedPaths: [
        path.join(__dirname, '../../../../server/src'),
        path.join(__dirname, '../../../../client'),
        path.join(__dirname, '../../../../mcp-server'),
        path.join(__dirname, '../../../../rag-server'),
      ],
      testManifest: this.manifest,
    };
  }

  /**
   * Check if a path is allowed in sandbox mode
   */
  isPathAllowed(targetPath: string): boolean {
    if (!this.state.active) return true;
    
    const normalizedPath = path.normalize(targetPath);
    const normalizedTestProject = path.normalize(TEST_PROJECT_DIR);
    
    // Must be within test project
    return normalizedPath.startsWith(normalizedTestProject);
  }

  /**
   * Filter a list of paths to only allowed ones
   */
  filterPaths(paths: string[]): string[] {
    if (!this.state.active) return paths;
    return paths.filter(p => this.isPathAllowed(p));
  }

  /**
   * Enter sandbox mode
   */
  async enter(): Promise<SandboxConfig> {
    if (this.state.active) {
      console.warn('[TestSandbox] Already in sandbox mode');
      return this.getConfig();
    }

    // Check test project exists
    if (!(await this.testProjectExists())) {
      throw new Error('Test project does not exist. Run test project setup first.');
    }

    // Load manifest
    await this.loadManifest();

    // Ensure test index directory exists
    await fs.ensureDir(TEST_PROJECT_INDEX_DIR);

    this.state = {
      active: true,
      startedAt: new Date().toISOString(),
      originalRagIndex: null, // Would store current RAG index if needed
    };

    console.log('[TestSandbox] Entered sandbox mode');
    console.log(`[TestSandbox] Allowed paths: ${TEST_PROJECT_DIR}`);
    console.log(`[TestSandbox] RAG index: ${TEST_PROJECT_INDEX_DIR}`);

    return this.getConfig();
  }

  /**
   * Exit sandbox mode
   */
  async exit(): Promise<void> {
    if (!this.state.active) {
      console.warn('[TestSandbox] Not in sandbox mode');
      return;
    }

    this.state = {
      active: false,
      startedAt: null,
      originalRagIndex: null,
    };

    console.log('[TestSandbox] Exited sandbox mode');
  }

  /**
   * Check if sandbox is active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get sandbox state
   */
  getState(): SandboxState {
    return { ...this.state };
  }

  /**
   * Get expected answer for a test
   */
  async getExpectedAnswer(testId: string): Promise<any | null> {
    const manifest = await this.getManifest();
    if (!manifest) return null;
    return manifest.tests[testId] || null;
  }

  /**
   * Get all bug locations for bug detection tests
   */
  async getBugs(): Promise<Record<string, any>> {
    const manifest = await this.getManifest();
    return manifest?.bugs || {};
  }

  /**
   * Get architecture info for architecture detection tests
   */
  async getArchitecture(): Promise<any | null> {
    const manifest = await this.getManifest();
    return manifest?.architecture || null;
  }

  /**
   * Get dependencies for navigation tests
   */
  async getDependencies(): Promise<Record<string, string[]>> {
    const manifest = await this.getManifest();
    return manifest?.dependencies || {};
  }

  /**
   * Index the test project (calls RAG server)
   */
  async indexTestProject(ragServerUrl: string = 'http://localhost:3002'): Promise<boolean> {
    try {
      const response = await fetch(`${ragServerUrl}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: TEST_PROJECT_DIR,
          indexPath: TEST_PROJECT_INDEX_DIR,
          isolated: true,
        }),
      });
      
      if (!response.ok) {
        console.error('[TestSandbox] Failed to index test project:', await response.text());
        return false;
      }
      
      console.log('[TestSandbox] Test project indexing started');
      return true;
    } catch (error) {
      console.error('[TestSandbox] Failed to call RAG server:', error);
      return false;
    }
  }

  /**
   * Check if test project is indexed
   */
  async isIndexed(): Promise<boolean> {
    const indexFile = path.join(TEST_PROJECT_INDEX_DIR, 'index.json');
    return fs.pathExists(indexFile);
  }
}

// Export singleton instance
export const testSandbox = new TestSandbox();

// Export class for testing
export { TestSandbox };

export default testSandbox;

