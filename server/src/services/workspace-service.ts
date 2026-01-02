import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url'; // Added missing import
import { mcpClient } from '../modules/tooly/mcp-client.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url); // Added missing variable initialization
const __dirname = path.dirname(__filename); // Added missing variable initialization
const WORKSPACE_CONFIG_FILE = path.join(__dirname, '../../data/workspace.json'); // Corrected path to use __dirname

/**
 * Represents the configuration structure for the workspace service.
 */
export interface WorkspaceConfig {
  /** The path to the currently active workspace directory. */
  currentWorkspace: string;
  /** A list of recently opened workspace paths. */
  recentWorkspaces: string[];
  /** Indicates whether safe mode is enabled for the workspace. */
  safeMode: boolean;
}

/**
 * Manages workspace-related operations, including loading and saving workspace configurations,
 * switching active workspaces, and interacting with other services like MCP and RAG.
 */
class WorkspaceService {
  private config: WorkspaceConfig;

  /**
   * Initializes the WorkspaceService and loads the workspace configuration.
   */
  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Loads the workspace configuration from a JSON file.
   * If the file does not exist or loading fails, it returns a default configuration.
   * @returns The loaded or default `WorkspaceConfig`.
   */
  private loadConfig(): WorkspaceConfig {
    try {
      if (fs.existsSync(WORKSPACE_CONFIG_FILE)) {
        const loaded = fs.readJsonSync(WORKSPACE_CONFIG_FILE);
        return {
          safeMode: true, // Default
          ...loaded
        };
      }
    } catch (e) {
      console.error('[WorkspaceService] Failed to load config:', e);
    }
    // Default to a sensible root (assuming server/src/services relative to project root)
    const defaultRoot = path.resolve(process.cwd()); // Use process.cwd() for current project root
    return {
      currentWorkspace: defaultRoot,
      recentWorkspaces: [defaultRoot],
      safeMode: true
    };
  }

  /**
   * Saves the current in-memory workspace configuration to the JSON file.
   */
  private saveConfig() {
    try {
      fs.ensureDirSync(path.dirname(WORKSPACE_CONFIG_FILE));
      fs.writeJsonSync(WORKSPACE_CONFIG_FILE, this.config, { spaces: 2 }); // BUG FIX: Corrected first argument
    } catch (e) {
      console.error('[WorkspaceService] Failed to save config:', e);
    }
  }

  /**
   * Retrieves the path to the currently active workspace.
   * @returns The absolute path of the current workspace.
   */
  getCurrentWorkspace(): string {
    return this.config.currentWorkspace;
  }

  /**
   * Checks if safe mode is currently enabled for the workspace.
   * @returns True if safe mode is enabled, false otherwise.
   */
  isSafeMode(): boolean {
    return this.config.safeMode;
  }

  /**
   * Sets the safe mode status for the workspace and saves the configuration.
   * @param enabled - True to enable safe mode, false to disable.
   */
  setSafeMode(enabled: boolean): void {
    this.config.safeMode = enabled;
    this.saveConfig();
  }

  /**
   * Retrieves a list of recently used workspace paths.
   * @returns An array of strings, where each string is a path to a recent workspace.
   */
  getRecentWorkspaces(): string[] {
    return this.config.recentWorkspaces;
  }

  /**
   * Sets the active workspace to the specified target path.
   * This involves updating the configuration, restarting the MCP client with the new working directory,
   * and notifying the RAG server to re-index the new project path.
   * @param targetPath - The path to the directory to set as the new workspace.
   * @returns A promise that resolves with an object indicating success or failure and an optional error message.
   */
  async setWorkspace(targetPath: string): Promise<{ success: boolean; error?: string }> {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Directory not found: ${targetPath}` };
    }

    const resolvedPath = path.resolve(targetPath);
    console.log(`[WorkspaceService] Switching workspace to: ${resolvedPath}`);

    // 1. Update Config
    this.config.currentWorkspace = resolvedPath;
    if (!this.config.recentWorkspaces.includes(resolvedPath)) {
      this.config.recentWorkspaces.unshift(resolvedPath);
      this.config.recentWorkspaces = this.config.recentWorkspaces.slice(0, 10); // Keep last 10
    }
    this.saveConfig();

    // 2. Restart MCP Client with new CWD
    try {
      console.log('[WorkspaceService] Restarting MCP Client...');
      await mcpClient.restart(resolvedPath);
    } catch (e: any) {
      console.error('[WorkspaceService] MCP Restart Failed:', e);
      return { success: false, error: `MCP Restart Failed: ${e.message}` };
    }

    // 3. Notify RAG Server (if running)
    try {
      console.log('[WorkspaceService] Updating RAG Server...');
      // Assuming RAG server runs on localhost:3002 as per config
      await axios.post('http://localhost:3002/api/rag/index', { projectPath: resolvedPath });
    } catch (e: any) {
      console.warn('[WorkspaceService] RAG Update Failed (is it running?):', e.message);
      // Don't fail the whole switch if RAG is down, just warn
    }

    return { success: true };
  }

  /**
   * Get git repository status for current workspace
   */
  async getGitStatus(): Promise<{
    isClean: boolean;
    branch: string;
    hasUncommittedChanges: boolean;
    modifiedFiles: string[];
  }> {
    const { execSync } = await import('child_process');
    const cwd = this.getCurrentWorkspace();

    try {
      // Check if it's a git repo
      execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });

      // Get branch
      const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim();

      // Get status
      const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
      const modifiedFiles = status
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim());

      const hasChanges = modifiedFiles.length > 0;

      return {
        isClean: !hasChanges,
        branch,
        hasUncommittedChanges: hasChanges,
        modifiedFiles
      };
    } catch (e) {
      // Not a git repo or git not available
      return {
        isClean: true,
        branch: '',
        hasUncommittedChanges: false,
        modifiedFiles: []
      };
    }
  }

  /**
   * Generate project hash from path (for scoping data)
   */
  getProjectHash(projectPath: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 12);
  }

  /**
   * Validate if an operation is allowed (safe mode enforcement)
   */
  async validateOperation(operation: 'read' | 'write', filePath: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // Read operations always allowed
    if (operation === 'read') {
      return { allowed: true };
    }

    // Check safe mode
    if (!this.isSafeMode()) {
      return { allowed: true };
    }

    // In safe mode, check git status
    const gitStatus = await this.getGitStatus();

    if (gitStatus.hasUncommittedChanges) {
      return {
        allowed: false,
        reason: 'Safe mode is active: repository has uncommitted changes. Please commit or stash changes first.'
      };
    }

    return { allowed: true };
  }

  /**
   * Get project metadata for current workspace
   */
  getProjectMetadata(hash?: string): Record<string, any> {
    const projectHash = hash || this.getProjectHash(this.getCurrentWorkspace());
    const metadataPath = path.join(__dirname, `../../data/projects/${projectHash}/metadata.json`);

    try {
      if (fs.existsSync(metadataPath)) {
        return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }
    } catch (e) {
      console.error('[WorkspaceService] Failed to load metadata:', e);
    }

    return {};
  }

  /**
   * Set project metadata
   */
  setProjectMetadata(key: string, value: any, hash?: string): void {
    const projectHash = hash || this.getProjectHash(this.getCurrentWorkspace());
    const projectDir = path.join(__dirname, `../../data/projects/${projectHash}`);
    const metadataPath = path.join(projectDir, 'metadata.json');

    try {
      fs.ensureDirSync(projectDir);

      let metadata = {};
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }

      (metadata as any)[key] = value;

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (e) {
      console.error('[WorkspaceService] Failed to save metadata:', e);
    }
  }

  /**
   * Refresh workspace state (re-check git status, update safe mode)
   */
  async refreshWorkspace(): Promise<void> {
    const gitStatus = await this.getGitStatus();

    // Auto-enable safe mode if repo is dirty
    if (gitStatus.hasUncommittedChanges && !this.isSafeMode()) {
      console.log('[WorkspaceService] Uncommitted changes detected, enabling safe mode');
      this.setSafeMode(true);
    }
    // Auto-disable if repo is clean and safe mode is on
    else if (!gitStatus.hasUncommittedChanges && this.isSafeMode()) {
      console.log('[WorkspaceService] Repository clean, safe mode can be disabled');
      // Don't auto-disable - let user control this
    }
  }
}

/**
 * The singleton instance of the WorkspaceService.
 */
export const workspaceService = new WorkspaceService();
