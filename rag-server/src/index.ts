/**
 * RAG Server - Semantic Code Search Service
 * 
 * Provides:
 * - Code indexing with tree-sitter AST parsing
 * - Vector embeddings via LM Studio
 * - Semantic search via HNSWLib
 * - Real-time indexing progress via WebSocket
 * - File watching for auto-reindex
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs/promises';

import { defaultConfig, RAGConfig, IndexProgress, RAGResult, RAGMetrics } from './config.js';
import { getIndexer, Indexer } from './services/indexer.js';
import { getLMStudioEmbedder } from './embeddings/lmstudio.js';
import { getHNSWLibStore } from './storage/hnswlib.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Current configuration (loaded from file or defaults)
let config: RAGConfig = { ...defaultConfig };

// Services
let indexer: Indexer;

// WebSocket clients for progress updates
const wsClients: Set<WebSocket> = new Set();

// Broadcast progress to all connected clients
function broadcastProgress(progress: IndexProgress): void {
  const message = JSON.stringify({ type: 'indexProgress', data: progress });
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Broadcast general message
function broadcast(type: string, data: any): void {
  const message = JSON.stringify({ type, data });
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Initialize services
async function initializeServices(): Promise<void> {
  indexer = getIndexer(config);
  indexer.onProgress(broadcastProgress);
  
  // Try to load existing index
  const vectorStore = getHNSWLibStore(config.storage.dataPath);
  try {
    await vectorStore.load();
    console.log('[RAG Server] Loaded existing vector index');
  } catch {
    console.log('[RAG Server] No existing index found');
  }
  
  // Start file watcher if project is configured
  if (config.project.path && config.watcher.enabled) {
    indexer.startWatcher(config.project.path);
  }
}

// =============================================================================
// API Routes
// =============================================================================

// Health check
app.get('/api/rag/health', async (req: Request, res: Response) => {
  const embedder = getLMStudioEmbedder();
  const healthy = await embedder.healthCheck();
  
  res.json({ 
    status: healthy ? 'ok' : 'degraded',
    version: '1.0.0',
    indexStatus: indexer?.getProgress().status || 'idle',
    lmstudioConnected: healthy
  });
});

// Get current configuration
app.get('/api/rag/config', (req: Request, res: Response) => {
  res.json(config);
});

// Update configuration
app.put('/api/rag/config', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    // Update config
    config = { 
      ...config, 
      ...updates,
      lmstudio: { ...config.lmstudio, ...updates.lmstudio },
      storage: { ...config.storage, ...updates.storage },
      indexing: { ...config.indexing, ...updates.indexing },
      watcher: { ...config.watcher, ...updates.watcher },
      project: { ...config.project, ...updates.project }
    };
    
    // Update embedder model if changed
    if (updates.lmstudio?.model) {
      const embedder = getLMStudioEmbedder();
      await embedder.setModel(updates.lmstudio.model);
    }
    
    // Restart file watcher if project changed
    if (updates.project?.path) {
      indexer.stopWatcher();
      if (config.watcher.enabled) {
        indexer.startWatcher(updates.project.path);
      }
    }
    
    // TODO: Save config to file
    
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get index statistics
app.get('/api/rag/stats', async (req: Request, res: Response) => {
  try {
    const vectorStore = getHNSWLibStore(config.storage.dataPath);
    const embedder = getLMStudioEmbedder();
    const diskUsage = await vectorStore.getDiskUsage();
    
    const stats = {
      projectPath: config.project.path,
      status: indexer.getProgress().status,
      totalFiles: indexer.getProgress().processedFiles,
      totalChunks: indexer.getProgress().chunksCreated,
      totalVectors: vectorStore.size,
      dimensions: vectorStore.dimensions,
      storageSize: diskUsage,
      embeddingModel: config.lmstudio.model,
      embeddingModelLoaded: embedder.isLoaded,
      fileWatcherActive: config.watcher.enabled && !!config.project.path
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List available embedding models from LM Studio
app.get('/api/rag/models', async (req: Request, res: Response) => {
  try {
    const embedder = getLMStudioEmbedder();
    const models = await embedder.listModels();
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start indexing a directory
app.post('/api/rag/index', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;
    
    if (!projectPath) {
      return res.status(400).json({ error: 'projectPath is required' });
    }
    
    // Check if directory exists
    try {
      await fs.access(projectPath);
    } catch {
      return res.status(400).json({ error: 'Directory does not exist' });
    }
    
    const currentProgress = indexer.getProgress();
    if (currentProgress.status !== 'idle' && currentProgress.status !== 'complete' && currentProgress.status !== 'error') {
      return res.status(409).json({ error: 'Indexing already in progress' });
    }
    
    // Update config with new project path
    config.project.path = projectPath;
    
    // Start indexing in background
    res.json({ success: true, message: 'Indexing started' });
    
    // Run indexing asynchronously
    indexer.indexProject(projectPath).then(result => {
      console.log('[RAG Server] Indexing completed:', result);
      
      // Start file watcher
      if (config.watcher.enabled) {
        indexer.startWatcher(projectPath);
      }
    }).catch(error => {
      console.error('[RAG Server] Indexing failed:', error);
    });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all RAG data
app.delete('/api/rag/index', async (req: Request, res: Response) => {
  try {
    // Stop file watcher
    indexer.stopWatcher();
    
    // Clear index
    await indexer.clear();
    
    // Delete files on disk
    const indexPath = path.resolve(config.storage.dataPath);
    try {
      await fs.rm(indexPath, { recursive: true, force: true });
      await fs.mkdir(indexPath, { recursive: true });
    } catch {
      // Ignore if doesn't exist
    }
    
    broadcast('indexCleared', { success: true });
    
    res.json({ success: true, message: 'All RAG data cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get indexing status
app.get('/api/rag/index/status', (req: Request, res: Response) => {
  res.json(indexer.getProgress());
});

// Cancel ongoing indexing
app.post('/api/rag/index/cancel', async (req: Request, res: Response) => {
  try {
    indexer.cancel();
    res.json({ success: true, message: 'Indexing cancelled' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Query the index
app.post('/api/rag/query', async (req: Request, res: Response) => {
  try {
    const { query, limit = 5, filter } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const startTime = Date.now();
    
    const results = await indexer.query(query, limit);
    
    // Transform to RAGResult format
    const formattedResults: RAGResult[] = results
      .filter(r => r.chunk !== null)
      .map(r => ({
        filePath: r.chunk!.filePath,
        startLine: r.chunk!.startLine,
        endLine: r.chunk!.endLine,
        snippet: r.chunk!.content,
        symbolName: r.chunk!.name || null,
        symbolType: r.chunk!.type || null,
        language: r.chunk!.language,
        score: r.score
      }));
    
    // Apply filters if provided
    let filteredResults = formattedResults;
    if (filter?.fileTypes?.length) {
      filteredResults = filteredResults.filter(r => 
        filter.fileTypes.some((t: string) => r.language === t || r.filePath.endsWith(`.${t}`))
      );
    }
    if (filter?.paths?.length) {
      filteredResults = filteredResults.filter(r =>
        filter.paths.some((p: string) => r.filePath.includes(p))
      );
    }
    
    const latency = Date.now() - startTime;
    
    res.json({ 
      results: filteredResults, 
      query, 
      latency,
      totalResults: filteredResults.length
    });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get visualization data (2D projections)
app.get('/api/rag/visualization', async (req: Request, res: Response) => {
  try {
    // TODO: Implement UMAP projection
    // For now, return empty array
    const visualizations: any[] = [];
    res.json(visualizations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get chunks with pagination and filters
app.get('/api/rag/chunks', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '50', fileType, symbolType, search } = req.query;
    
    // TODO: Get from database when connected
    // For now, return empty
    const chunks: any[] = [];
    const total = 0;
    
    res.json({
      chunks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single chunk details
app.get('/api/rag/chunks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // TODO: Fetch chunk from database
    res.status(404).json({ error: 'Chunk not found' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Find similar chunks
app.get('/api/rag/chunks/:id/similar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '5' } = req.query;
    
    // TODO: Get chunk vector and search for similar
    const similar: any[] = [];
    res.json(similar);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get metrics for analytics dashboard
app.get('/api/rag/metrics', async (req: Request, res: Response) => {
  try {
    const embedder = getLMStudioEmbedder();
    
    // TODO: Get from database
    const metrics: RAGMetrics = {
      indexingHistory: [],
      queryHistory: [],
      embeddingStats: {
        totalEmbeddings: 0,
        avgGenerationTime: 0,
        modelLoaded: embedder.isLoaded,
        modelName: config.lmstudio.model
      }
    };
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[RAG Server Error]', err);
  res.status(500).json({ error: err.message });
});

// =============================================================================
// Server Startup
// =============================================================================

const PORT = config.port;
const WS_PORT = config.wsPort;

// Initialize services before starting
initializeServices().then(() => {
  // Start HTTP server
  const server = app.listen(PORT, () => {
    console.log(`[RAG Server] HTTP server running on port ${PORT}`);
  });

  // Start WebSocket server
  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[RAG Server] WebSocket client connected');
    wsClients.add(ws);
    
    // Send current status on connection
    ws.send(JSON.stringify({ type: 'indexProgress', data: indexer.getProgress() }));
    
    ws.on('close', () => {
      console.log('[RAG Server] WebSocket client disconnected');
      wsClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('[RAG Server] WebSocket error:', error);
      wsClients.delete(ws);
    });
  });

  console.log(`[RAG Server] WebSocket server running on port ${WS_PORT}`);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[RAG Server] Shutting down...');
    indexer.stopWatcher();
    wss.close();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[RAG Server] Shutting down...');
    indexer.stopWatcher();
    wss.close();
    server.close();
    process.exit(0);
  });
}).catch(error => {
  console.error('[RAG Server] Failed to initialize:', error);
  process.exit(1);
});

export { app, broadcastProgress, broadcast };
