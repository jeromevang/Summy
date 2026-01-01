import { RAGQueryResult } from './types.js';

export class RAGClient {
  private serverProcess: ChildProcess | null = null;

  constructor(private _serverPath: string, private httpUrl: string) {}

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
      const data = await res.json();
      return { results: data.results || [], latency: Date.now() - startTime };
    } catch { return { results: [], latency: Date.now() - startTime }; }
  }
}

export const ragClient = new RAGClient('', 'http://localhost:3002');
