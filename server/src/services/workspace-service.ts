import path from 'path';
import fs from 'fs-extra';
import { mcpClient } from '../modules/tooly/mcp-client.js';
import axios from 'axios';

const WORKSPACE_CONFIG_FILE = path.join(process.cwd(), 'data', 'workspace.json');

export interface WorkspaceConfig {
  currentWorkspace: string;
  recentWorkspaces: string[];
  safeMode: boolean;
}

class WorkspaceService {
  private config: WorkspaceConfig;

  constructor() {
    this.config = this.loadConfig();
  }

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
    // Default to current project root (assuming we are in server/src/services)
    const defaultRoot = path.resolve(process.cwd(), '../');
    return {
      currentWorkspace: defaultRoot,
      recentWorkspaces: [defaultRoot],
      safeMode: true
    };
  }

  private saveConfig() {
    try {
      fs.ensureDirSync(path.dirname(WORKSPACE_CONFIG_FILE));
      fs.writeJsonSync(this.config, this.config, { spaces: 2 }); // BUG FIX: second param was this.config
    } catch (e) {
      console.error('[WorkspaceService] Failed to save config:', e);
    }
  }

  getCurrentWorkspace(): string {
    return this.config.currentWorkspace;
  }

  isSafeMode(): boolean {
    return this.config.safeMode;
  }

  setSafeMode(enabled: boolean) {
    this.config.safeMode = enabled;
    this.saveConfig();
  }

  getRecentWorkspaces(): string[] {
    return this.config.recentWorkspaces;
  }

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

export const workspaceService = new WorkspaceService();
