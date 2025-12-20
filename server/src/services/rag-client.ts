/**
 * RAG Client - HTTP Client for RAG Server
 * 
 * Provides an interface to communicate with the RAG server.
 * Can optionally spawn the RAG server as a child process if not running.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default RAG server path
const DEFAULT_RAG_SERVER_PATH = path.resolve(__dirname, '../../../rag-server');
const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://localhost:3002';
const RAG_WS_URL = process.env.RAG_WS_URL || 'ws://localhost:3003';

// ============================================================
// TYPES
// ============================================================

export interface RAGConfig {
  lmstudio: {
    model: string;
    loadOnDemand: boolean;
  };
  storage: {
    dataPath: string;
  };
  indexing: {
    chunkSize: number;
    chunkOverlap: number;
    includePatterns: string[];
    excludePatterns: string[];
  };
  watcher: {
    enabled: boolean;
    debounceMs: number;
  };
  project: {
    path: string | null;
    autoDetect: boolean;
  };
}

export interface RAGStats {
  projectPath: string | null;
  status: string;
  totalFiles: number;
  totalChunks: number;
  totalVectors: number;
  dimensions: number;
  storageSize: number;
  embeddingModel: string;
  embeddingModelLoaded: boolean;
  fileWatcherActive: boolean;
}

export interface RAGQueryResult {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  score: number;
}

export interface EmbeddingModel {
  id: string;
  name: string;
  path?: string;
  loaded?: boolean;
  size?: number;
}

// ============================================================
// RAG CLIENT
// ============================================================

class RAGClient {
  private serverProcess: ChildProcess | null = null;
  private serverPath: string;
  private httpUrl: string;
  private wsUrl: string;
  private isConnected: boolean = false;
  
  constructor(
    serverPath: string = DEFAULT_RAG_SERVER_PATH,
    httpUrl: string = RAG_SERVER_URL,
    wsUrl: string = RAG_WS_URL
  ) {
    this.serverPath = serverPath;
    this.httpUrl = httpUrl;
    this.wsUrl = wsUrl;
    console.log(`[RAG Client] RAG server path: ${this.serverPath}`);
  }
  
  /**
   * Check if RAG server is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/health`, {
        signal: AbortSignal.timeout(2000)
      });
      this.isConnected = response.ok;
      return response.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }
  
  /**
   * Start RAG server as child process if not running
   */
  async ensureRunning(): Promise<boolean> {
    if (await this.healthCheck()) {
      return true;
    }
    
    // Try to spawn the server
    return this.spawnServer();
  }
  
  /**
   * Spawn RAG server as child process
   */
  private async spawnServer(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log('[RAG Client] Spawning RAG server...');
        
        this.serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
          cwd: this.serverPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          detached: false
        });
        
        // Log server output
        this.serverProcess.stdout?.on('data', (data) => {
          console.log(`[RAG Server] ${data.toString().trim()}`);
        });
        
        this.serverProcess.stderr?.on('data', (data) => {
          console.error(`[RAG Server Error] ${data.toString().trim()}`);
        });
        
        this.serverProcess.on('exit', (code) => {
          console.log(`[RAG Client] Server exited with code ${code}`);
          this.serverProcess = null;
          this.isConnected = false;
        });
        
        // Wait for server to be ready
        let attempts = 0;
        const checkInterval = setInterval(async () => {
          attempts++;
          if (await this.healthCheck()) {
            clearInterval(checkInterval);
            console.log('[RAG Client] Server is ready');
            resolve(true);
          } else if (attempts > 30) { // 15 seconds timeout
            clearInterval(checkInterval);
            console.error('[RAG Client] Server failed to start');
            resolve(false);
          }
        }, 500);
        
      } catch (error) {
        console.error('[RAG Client] Failed to spawn server:', error);
        resolve(false);
      }
    });
  }
  
  /**
   * Stop the RAG server
   */
  stop(): void {
    if (this.serverProcess) {
      console.log('[RAG Client] Stopping RAG server...');
      this.serverProcess.kill();
      this.serverProcess = null;
      this.isConnected = false;
    }
  }
  
  /**
   * Get RAG configuration
   */
  async getConfig(): Promise<RAGConfig | null> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/config`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * Update RAG configuration
   */
  async updateConfig(config: Partial<RAGConfig>): Promise<boolean> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Get RAG statistics
   */
  async getStats(): Promise<RAGStats | null> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/stats`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * List available embedding models
   */
  async listModels(): Promise<EmbeddingModel[]> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/models`);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }
  
  /**
   * Start indexing a project
   */
  async startIndexing(projectPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Get indexing status
   */
  async getIndexStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/index/status`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * Cancel ongoing indexing
   */
  async cancelIndexing(): Promise<boolean> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/index/cancel`, {
        method: 'POST'
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Delete all RAG data
   */
  async clearIndex(): Promise<boolean> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/index`, {
        method: 'DELETE'
      });
      
      // Also clear from local database
      if (response.ok) {
        db.clearAllRAGData();
      }
      
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Query the RAG index
   */
  async query(
    queryText: string, 
    options: { limit?: number; fileTypes?: string[]; paths?: string[] } = {}
  ): Promise<{ results: RAGQueryResult[]; latency: number } | null> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          limit: options.limit || 5,
          filter: {
            fileTypes: options.fileTypes,
            paths: options.paths
          }
        })
      });
      
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * Get metrics for analytics
   */
  async getMetrics(): Promise<any> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/metrics`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * Get visualization data
   */
  async getVisualization(): Promise<any[]> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/visualization`);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }
  
  /**
   * Get chunks with pagination
   */
  async getChunks(options: {
    page?: number;
    limit?: number;
    fileType?: string;
    symbolType?: string;
    search?: string;
  } = {}): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (options.page) params.set('page', String(options.page));
      if (options.limit) params.set('limit', String(options.limit));
      if (options.fileType) params.set('fileType', options.fileType);
      if (options.symbolType) params.set('symbolType', options.symbolType);
      if (options.search) params.set('search', options.search);
      
      const response = await fetch(`${this.httpUrl}/api/rag/chunks?${params}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * Get a single chunk by ID
   */
  async getChunk(id: string): Promise<any> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/chunks/${id}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
  
  /**
   * Get similar chunks
   */
  async getSimilarChunks(chunkId: string, limit: number = 5): Promise<any[]> {
    try {
      const response = await fetch(`${this.httpUrl}/api/rag/chunks/${chunkId}/similar?limit=${limit}`);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }
  
  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; serverUrl: string; wsUrl: string } {
    return {
      connected: this.isConnected,
      serverUrl: this.httpUrl,
      wsUrl: this.wsUrl
    };
  }
}

// Export singleton instance
export const ragClient = new RAGClient();

// Export class for custom instances
export { RAGClient };
