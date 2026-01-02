import { ChildProcess } from 'child_process';
import { RAGQueryResult } from './types.js';

export class RAGClient {
  private serverProcess: ChildProcess | null = null;

  constructor(private httpUrl: string) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.httpUrl}/api/rag/health`);
      return res.ok;
    } catch { return false; }
  }

  async query(query: string, options: any = {}): Promise<{ results: RAGQueryResult[]; latency: number }> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${this.httpUrl}/api/rag/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, ...options }) });
      const data = (await res.json()) as { results: RAGQueryResult[] };
      return { results: data.results || [], latency: Date.now() - startTime };
    } catch { return { results: [], latency: Date.now() - startTime }; }
  }

  async getMetrics(): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/metrics`);
    return res.json();
  }

  async getStats(): Promise<any> {
    console.log('[RAGClient] Fetching stats from', `${this.httpUrl}/api/rag/stats`);
    try {
      const res = await fetch(`${this.httpUrl}/api/rag/stats`);
      console.log('[RAGClient] Stats fetch response status:', res.status);

      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.statusText}`);
      }

      const data = await res.json();
      console.log('[RAGClient] Successfully fetched stats:', data);
      return data;
    } catch (error: any) {
      console.error('[RAGClient] Failed to fetch stats:', error);
      throw error;
    }
  }

  async getVisualization(): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/visualization`);
    return res.json();
  }

  async getChunks(query: any): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    return res.json();
  }

  async getChunk(id: string): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/chunks/${id}`);
    return res.json();
  }

  async getSimilarChunks(id: string, limit: number): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/similar-chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, limit }),
    });
    return res.json();
  }

  async ensureRunning(): Promise<boolean> {
    const res = await fetch(`${this.httpUrl}/api/rag/ensure-running`);
    return res.ok;
  }

  getStatus(): string {
    return this.serverProcess ? 'running' : 'stopped';
  }

  stop(): void {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  async getConfig(): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/config`);
    return res.json();
  }

  async updateConfig(config: any): Promise<void> {
    await fetch(`${this.httpUrl}/api/rag/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  async listModels(): Promise<any[]> {
    const res = await fetch(`${this.httpUrl}/api/rag/models`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async startIndexing(projectPath: string): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    return res.json();
  }

  async clearIndex(): Promise<boolean> {
    const res = await fetch(`${this.httpUrl}/api/rag/index`, { method: 'DELETE' });
    return res.ok;
  }

  async getIndexStatus(): Promise<any> {
    const res = await fetch(`${this.httpUrl}/api/rag/index/status`);
    return res.json();
  }

  async cancelIndexing(): Promise<boolean> {
    const res = await fetch(`${this.httpUrl}/api/rag/index/cancel`, { method: 'POST' });
    return res.ok;
  }
}

export const ragClient = new RAGClient('http://localhost:3002');
