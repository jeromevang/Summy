import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs/promises';
import { RAGConfig, defaultConfig } from '../config.js';
import { getIndexer, Indexer } from '../services/indexer.js';
import { getLMStudioEmbedder, LMStudioEmbedder } from '../embeddings/lmstudio.js';
import { getGeminiEmbedder, GeminiEmbedder } from '../embeddings/gemini.js';
import { getLanceDBStore } from '../storage/lancedb-store.js';
import { getRAGDatabase, RAGDatabase } from '../services/database.js';

export class RAGServer {
  private app = express();
  private config: RAGConfig = { ...defaultConfig };
  private indexer!: Indexer;
  private ragDb!: RAGDatabase;
  private wsClients: Set<WebSocket> = new Set();
  private embedder!: any;

  constructor() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
  }

  async start(port: number) {
    await this.loadConfig();
    await this.initializeServices();
    this.setupRoutes();
    const server = this.app.listen(port, () => console.log(`[RAG Server] Running on port \${port}`));
    this.setupWebSocket(server);
  }

  private async loadConfig() {
    try {
      const data = await fs.readFile('./data/rag-config.json', 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch { console.log('[RAG Server] Using default config'); }
  }

  private async initializeServices() {
    // Determine which embedder to use based on config
    const embedderType = (this.config as any).embedder?.type || 'lmstudio';
    
    if (embedderType === 'gemini') {
      const apiKey = (this.config as any).embedder?.apiKey || process.env.GEMINI_API_KEY;
      this.embedder = getGeminiEmbedder(apiKey);
      console.log('[RAG Server] Using Gemini Embedder');
    } else {
      this.embedder = getLMStudioEmbedder();
      console.log('[RAG Server] Using LM Studio Embedder');
    }

    this.indexer = getIndexer(this.config);
    // Inject the selected embedder into the indexer
    (this.indexer as any).embedder = this.embedder;
    
    this.indexer.onProgress((p) => this.broadcast('indexProgress', p));
    this.ragDb = getRAGDatabase(this.config.storage.dataPath);

    // Start file watcher if enabled
    if (this.config.watcher.enabled && this.config.project.path) {
      console.log(`[RAG Server] Starting file watcher for: \${this.config.project.path}`);
      this.indexer.startWatcher(this.config.project.path);
    } else {
      console.log(`[RAG Server] File watcher disabled or no project path set`);
    }
  }

  private setupRoutes() {
    this.app.get('/api/rag/health', (req, res) => res.json({ status: 'ok', indexStatus: this.indexer.getProgress().status }));
    this.app.get('/api/rag/stats', async (req, res) => {
      try {
        const progress = this.indexer.getProgress();
        res.json({
          projectPath: this.config.project?.path || null,
          status: progress.status,
          totalFiles: progress.totalFiles,
          processedFiles: progress.processedFiles,
          chunksCreated: progress.chunksCreated,
          embeddingsGenerated: progress.embeddingsGenerated,
          fileWatcherActive: this.indexer ? (this.indexer as any).fileWatcher !== null : false,
          embeddingModel: 'LMStudio',
          embeddingModelLoaded: false
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/rag/query', async (req, res) => {
      try {
        const { query, limit = 5 } = req.body;
        if (!query) return res.status(400).json({ error: 'query is required' });

        const results = await this.indexer.query(query, limit);
        res.json({ results, query });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/nav/symbols', async (req, res) => {
      try {
        const query = req.query.query as string;
        const limit = parseInt(req.query.limit as string || '10');
        if (!query) return res.status(400).json({ error: 'query is required' });

        const symbols = this.ragDb.symbols.searchSymbols(query, { limit });
        res.json({ symbols });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/rag/index', async (req, res) => {
      try {
        const { projectPath } = req.body;
        if (!projectPath) return res.status(400).json({ error: 'projectPath is required' });

        // Start indexing in background
        this.indexer.indexProject(projectPath);
        res.json({ success: true, message: 'Indexing started' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
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
