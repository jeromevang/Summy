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
}

/**
 * The singleton instance of the WorkspaceService.
 */
export const workspaceService = new WorkspaceService();
