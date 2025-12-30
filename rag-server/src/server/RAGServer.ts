import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs/promises';
import { RAGConfig, defaultConfig } from '../config.js';
import { getIndexer, Indexer } from '../services/indexer.js';
import { getLMStudioEmbedder } from '../embeddings/lmstudio.js';
import { getLanceDBStore } from '../storage/lancedb-store.js';

export class RAGServer {
  private app = express();
  private config: RAGConfig = { ...defaultConfig };
  private indexer!: Indexer;
  private wsClients: Set<WebSocket> = new Set();

  constructor() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
  }

  async start(port: number) {
    await this.loadConfig();
    await this.initializeServices();
    this.setupRoutes();
    const server = this.app.listen(port, () => console.log(`[RAG Server] Running on port ${port}`));
    this.setupWebSocket(server);
  }

  private async loadConfig() {
    try {
      const data = await fs.readFile('./data/rag-config.json', 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch { console.log('[RAG Server] Using default config'); }
  }

  private async initializeServices() {
    this.indexer = getIndexer(this.config);
    this.indexer.onProgress((p) => this.broadcast('indexProgress', p));
  }

  private setupRoutes() {
    this.app.get('/api/rag/health', (req, res) => res.json({ status: 'ok', indexStatus: this.indexer.getProgress().status }));
    // Other routes would be added here
  }

  private setupWebSocket(server: any) {
    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws) => {
      this.wsClients.add(ws);
      ws.on('close', () => this.wsClients.delete(ws));
    });
  }

  private broadcast(type: string, data: any) {
    const msg = JSON.stringify({ type, data });
    this.wsClients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
  }
}
