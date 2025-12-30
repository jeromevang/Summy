/**
 * MCP Client - Hybrid HTTP + stdio
 * Connects to MCP server either via HTTP (if running) or spawns as child process
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { notifications } from '../../services/notifications.js';
import { errorHandler } from '../../services/error-handler.js';
import { capabilities, ALL_TOOLS } from './capabilities.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default MCP server path (relative to this file: server/src/modules/tooly -> mcp-server)
const DEFAULT_MCP_SERVER_PATH = path.resolve(__dirname, '../../../../mcp-server');

// ============================================================
// TYPES
// ============================================================

export type ConnectionMode = 'http' | 'stdio' | 'disconnected';

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
}

export interface MCPTool {
  name: string;
  description?: string;
  parameters?: any;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// ============================================================
// MCP CLIENT
// ============================================================

class MCPClient {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private httpBaseUrl: string | null = null;
  private connectionMode: ConnectionMode = 'disconnected';
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private requestId: number = 0;
  private reconnecting: boolean = false;

  private mcpServerPath: string;
  private mcpHttpUrl: string;
  private requestTimeout: number;

  constructor(
    mcpServerPath: string = DEFAULT_MCP_SERVER_PATH,
    mcpHttpUrl: string = 'http://localhost:3002',
    requestTimeout: number = 30000
  ) {
    this.mcpServerPath = mcpServerPath;
    this.mcpHttpUrl = mcpHttpUrl;
    this.requestTimeout = requestTimeout;
    console.log(`[MCP Client] MCP server path: ${this.mcpServerPath}`);
  }

  /**
   * Get current connection mode
   */
  getConnectionMode(): ConnectionMode {
    return this.connectionMode;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionMode !== 'disconnected';
  }

  /**
   * Connect to MCP server (try HTTP first, then spawn)
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      console.log('[MCP] Already connected via', this.connectionMode);
      return;
    }

    // Try HTTP first
    if (await this.tryHttpConnection()) {
      this.connectionMode = 'http';
      console.log('[MCP] Connected via HTTP');
      notifications.mcpConnected();
      return;
    }

    // Fall back to spawning child process
    console.log('[MCP] HTTP connection failed, spawning child process...');
    await this.spawnChildProcess();
    this.connectionMode = 'stdio';
    console.log('[MCP] Connected via stdio (child process)');
    notifications.mcpConnected();
  }

  /**
   * Try to connect via HTTP
   */
  private async tryHttpConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.mcpHttpUrl}/health`, {
        timeout: 2000
      });
      if (response.status === 200) {
        this.httpBaseUrl = this.mcpHttpUrl;
        return true;
      }
    } catch {
      // HTTP server not available
    }
    return false;
  }

  /**
   * Exponential backoff configuration
   */
  private backoffConfig = {
    initialDelay: 1000,
    maxDelay: 30000,
    factor: 1.5,
    maxRetries: 5
  };

  /**
   * Spawn MCP server as child process
   */
  private async spawnChildProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const isWindows = process.platform === 'win32';

        // Strategy 1: Try running compiled JS directly (Fastest, most stable)
        const distPath = path.join(this.mcpServerPath, 'dist', 'index.js');
        // Strategy 2: Fallback to TSX via node_modules (Dev mode)
        const tsxPath = path.join(this.mcpServerPath, 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx');
        const srcPath = path.join(this.mcpServerPath, 'src', 'server.ts');

        let cmd: string;
        let args: string[];

        // Check if dist exists, otherwise use TSX
        // Note: fs.existsSync is synchronous, but okay for startup
        if (require('fs').existsSync(distPath)) {
          cmd = 'node';
          args = [distPath];
          console.log('[MCP] Launching via node dist/index.js');
        } else {
          cmd = tsxPath;
          args = [srcPath];
          console.log('[MCP] Launching via tsx src/server.ts');
        }

        // Add model config path to args if it exists for the current model
        const activeModelId = process.env.MAIN_MODEL_ID || process.env.LMSTUDIO_MODEL;
        if (activeModelId) {
          const configPath = path.resolve(this.mcpServerPath, 'configs', 'models', `${activeModelId.replace(/[^a-zA-Z0-9-_.]/g, '_')}.json`);
          if (require('fs').existsSync(configPath)) {
            console.log(`[MCP] Found model-specific config: ${configPath}`);
            args.push('--config', configPath);
          }
        }

        console.log(`[MCP] Spawning: ${cmd} ${args.join(' ')}`);

        this.process = spawn(cmd, args, {
          cwd: this.mcpServerPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false, // Important: Don't use shell on Windows to avoid quoting issues with paths
          env: { ...process.env, FORCE_COLOR: '1' }
        });

        // Setup readline for JSON-RPC responses
        this.readline = createInterface({
          input: this.process.stdout!,
          crlfDelay: Infinity
        });

        this.readline.on('line', (line) => {
          this.handleStdioResponse(line);
        });

        // Handle stderr (logs from MCP server)
        this.process.stderr?.on('data', (data) => {
          const message = data.toString().trim();
          if (message) {
            console.log('[MCP stderr]', message);
          }
        });

        // Handle process exit
        this.process.on('exit', (code) => {
          console.log('[MCP] Process exited with code:', code);
          this.handleDisconnect();

          // Trigger autoreconnect if not intentional disconnect
          if (this.connectionMode !== 'disconnected') {
            this.attemptReconnectWithBackoff();
          }
        });

        this.process.on('error', (err) => {
          console.error('[MCP] Process error:', err);
          reject(err);
        });

        // Wait a bit to ensure it doesn't crash immediately
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            resolve();
          } else {
            reject(new Error('MCP process failed to start'));
          }
        }, 1000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private retryCount = 0;
  private retryTimer: NodeJS.Timeout | null = null;

  private async attemptReconnectWithBackoff() {
    if (this.retryCount >= this.backoffConfig.maxRetries) {
      console.error('[MCP] Max retries reached. Giving up.');
      notifications.error('MCP Connection Failed', 'Could not reconnect to MCP server after multiple attempts.');
      return;
    }

    const delay = Math.min(
      this.backoffConfig.maxDelay,
      this.backoffConfig.initialDelay * Math.pow(this.backoffConfig.factor, this.retryCount)
    );

    console.log(`[MCP] Reconnecting in ${delay}ms (Attempt ${this.retryCount + 1}/${this.backoffConfig.maxRetries})`);

    this.retryTimer = setTimeout(async () => {
      this.retryCount++;
      try {
        await this.reconnect();
        this.retryCount = 0; // Reset on success
      } catch (e) {
        console.error('[MCP] Reconnect attempt failed:', e);
        this.attemptReconnectWithBackoff(); // Retry again
      }
    }, delay);
  }

  /**
   * Handle JSON-RPC response from stdio
   */
  private handleStdioResponse(line: string): void {
    try {
      const response = JSON.parse(line);

      if (response.id !== undefined) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);

          if (response.error) {
            pending.reject(new Error(response.error.message || 'MCP error'));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch {
      // Not JSON, might be log output - ignore
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.connectionMode = 'disconnected';
    this.process = null;
    this.readline = null;
    this.httpBaseUrl = null;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP disconnected'));
    }
    this.pendingRequests.clear();

    notifications.mcpDisconnected();
  }

  /**
   * Disconnect from MCP server
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    this.connectionMode = 'disconnected';
    this.httpBaseUrl = null;
    console.log('[MCP] Disconnected');
  }

  /**
   * Reconnect to MCP server
   */
  async reconnect(): Promise<void> {
    if (this.reconnecting) return;

    this.reconnecting = true;
    console.log('[MCP] Attempting to reconnect...');

    try {
      this.disconnect();
      await this.connect();
      notifications.mcpReconnected();
    } finally {
      this.reconnecting = false;
    }
  }

  /**
   * Resolve a tool name alias to the actual MCP tool name
   * If the model called a native tool name, find the corresponding MCP tool
   */
  async resolveToolAlias(toolName: string, modelId?: string): Promise<string> {
    // If it's already a valid MCP tool, return as-is
    if (ALL_TOOLS.includes(toolName)) {
      return toolName;
    }

    // If no modelId provided, can't do alias lookup
    if (!modelId) {
      console.log(`[MCP] No model ID for alias resolution, using tool name as-is: ${toolName}`);
      return toolName;
    }

    try {
      const profile = await capabilities.getProfile(modelId);
      if (!profile) {
        console.log(`[MCP] No profile found for ${modelId}, using tool name as-is: ${toolName}`);
        return toolName;
      }

      // Search through capabilities to find which MCP tool has this as an alias
      for (const [mcpTool, cap] of Object.entries(profile.capabilities)) {
        if (cap.nativeAliases && cap.nativeAliases.includes(toolName)) {
          console.log(`[MCP] Resolved alias "${toolName}" -> "${mcpTool}" for model ${modelId}`);
          return mcpTool;
        }
      }

      console.log(`[MCP] No alias found for "${toolName}" in model ${modelId}, using as-is`);
      return toolName;
    } catch (error: any) {
      console.log(`[MCP] Error resolving alias: ${error.message}, using tool name as-is`);
      return toolName;
    }
  }

  /**
   * Execute a tool with automatic alias resolution
   */
  async executeToolWithAlias(name: string, args: Record<string, any> = {}, modelId?: string): Promise<MCPToolResult> {
    const resolvedName = await this.resolveToolAlias(name, modelId);
    return this.executeTool(resolvedName, args);
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    if (!this.isConnected()) {
      await this.connect();
    }

    const startTime = Date.now();

    try {
      let result: MCPToolResult;

      if (this.connectionMode === 'http') {
        result = await this.executeViaHttp(name, args);
      } else {
        result = await this.executeViaStdio(name, args);
      }

      const duration = Date.now() - startTime;
      console.log(`[MCP] Tool ${name} executed in ${duration}ms`);

      return result;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[MCP] Tool ${name} failed after ${duration}ms:`, error.message);

      // Try to reconnect on connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        await this.reconnect();
        // Retry once after reconnect
        return this.executeTool(name, args);
      }

      throw error;
    }
  }

  /**
   * Execute tool via HTTP
   */
  private async executeViaHttp(name: string, args: Record<string, any>): Promise<MCPToolResult> {
    const response = await axios.post(
      `${this.httpBaseUrl}/tools/${name}`,
      args,
      { timeout: this.requestTimeout }
    );
    return response.data;
  }

  /**
   * Execute tool via stdio (JSON-RPC)
   */
  private async executeViaStdio(name: string, args: Record<string, any>): Promise<MCPToolResult> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCP process not available');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP tool call timeout: ${name}`));
      }, this.requestTimeout);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request
      try {
        this.process!.stdin!.write(JSON.stringify(request) + '\n');
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.isConnected()) {
      await this.connect();
    }

    if (this.connectionMode === 'http') {
      const response = await axios.get(`${this.httpBaseUrl}/tools`, {
        timeout: this.requestTimeout
      });
      return response.data;
    } else {
      // stdio mode - use JSON-RPC
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/list',
        params: {}
      };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error('MCP tools/list timeout'));
        }, this.requestTimeout);

        this.pendingRequests.set(id, { resolve, reject, timeout });

        try {
          this.process!.stdin!.write(JSON.stringify(request) + '\n');
        } catch (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    mode: ConnectionMode;
    serverPath: string;
    httpUrl: string;
  } {
    return {
      connected: this.isConnected(),
      mode: this.connectionMode,
      serverPath: this.mcpServerPath,
      httpUrl: this.mcpHttpUrl
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    serverPath?: string;
    httpUrl?: string;
    timeout?: number;
  }): void {
    if (config.serverPath) this.mcpServerPath = config.serverPath;
    if (config.httpUrl) this.mcpHttpUrl = config.httpUrl;
    if (config.timeout) this.requestTimeout = config.timeout;
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();

// Export class for custom instances
export { MCPClient };

