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

import { defaultConfig, RAGConfig, IndexProgress, RAGResult, RAGMetrics, FileSummary } from './config.js';
import { getIndexer, Indexer } from './services/indexer.js';
import { getLMStudioEmbedder } from './embeddings/lmstudio.js';
import { getHNSWLibStore } from './storage/hnswlib.js';
import { initializeTokenizer } from './services/tokenizer.js';
import { initializeSummarizer, isSummarizerReady } from './services/summarizer.js';
import { getDependencyGraph, getGraphStats, serializeGraph, loadGraph } from './services/graph-builder.js';
import { createQueryPlan, buildQueryText, mergeAndRankResults, getContextExpansion, formatSearchResults } from './services/query-router.js';
import { getRAGDatabase } from './services/database.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Config file path
const CONFIG_FILE = './data/rag-config.json';

// Current configuration (loaded from file or defaults)
let config: RAGConfig = { ...defaultConfig };

// Services
let indexer: Indexer;

// Save config to disk and broadcast
async function saveConfig(): Promise<void> {
  try {
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('[RAG Server] Config saved to', CONFIG_FILE);
    // Broadcast config update to all connected clients
    broadcast('config', config);
  } catch (err) {
    console.error('[RAG Server] Failed to save config:', err);
  }
}

// Load config from disk
async function loadConfig(): Promise<void> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    const savedConfig = JSON.parse(data);
    config = {
      ...defaultConfig,
      ...savedConfig,
      lmstudio: { ...defaultConfig.lmstudio, ...savedConfig.lmstudio },
      storage: { ...defaultConfig.storage, ...savedConfig.storage },
      indexing: { ...defaultConfig.indexing, ...savedConfig.indexing },
      watcher: { ...defaultConfig.watcher, ...savedConfig.watcher },
      project: { ...defaultConfig.project, ...savedConfig.project },
      summarization: { ...defaultConfig.summarization, ...savedConfig.summarization },
      dependencyGraph: { ...defaultConfig.dependencyGraph, ...savedConfig.dependencyGraph },
      queryEnhancement: { ...defaultConfig.queryEnhancement, ...savedConfig.queryEnhancement },
      queryRouting: { ...defaultConfig.queryRouting, ...savedConfig.queryRouting }
    };
    console.log('[RAG Server] Loaded config from', CONFIG_FILE);
    console.log('[RAG Server] Embedding model:', config.lmstudio.model || 'not set');
    console.log('[RAG Server] Chat model:', config.lmstudio.chatModel || 'not set');
    console.log('[RAG Server] Project path:', config.project.path || 'not set');
    console.log('[RAG Server] Summarization:', config.summarization.enabled ? 'enabled' : 'disabled');
    console.log('[RAG Server] Query enhancement:', 
      `HyDE=${config.queryEnhancement.enableHyde}, Expansion=${config.queryEnhancement.enableQueryExpansion}`);
  } catch {
    console.log('[RAG Server] No saved config found, using defaults');
  }
}

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

// Get current stats for broadcasting
async function getStats() {
  const vectorStore = getHNSWLibStore(config.storage.dataPath);
  const embedder = getLMStudioEmbedder();
  
  let diskUsage = 0;
  try {
    const indexPath = path.resolve(config.storage.dataPath);
    const files = await fs.readdir(indexPath);
    for (const file of files) {
      const stat = await fs.stat(path.join(indexPath, file));
      diskUsage += stat.size;
    }
  } catch {
    // Ignore if path doesn't exist
  }
  
  return {
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
}

// Broadcast stats to all clients
async function broadcastStats(): Promise<void> {
  try {
    const stats = await getStats();
    broadcast('stats', stats);
  } catch (error) {
    console.error('[RAG Server] Failed to broadcast stats:', error);
  }
}

// Broadcast config to all clients
function broadcastConfig(): void {
  broadcast('config', config);
}

// Initialize services
async function initializeServices(): Promise<void> {
  // Load saved config first
  await loadConfig();
  
  // Initialize tokenizer for accurate token counting
  console.log('[RAG Server] Initializing tokenizer...');
  try {
    await initializeTokenizer();
    console.log('[RAG Server] Tokenizer ready');
  } catch (error) {
    console.warn('[RAG Server] Tokenizer initialization failed, using estimates:', error);
  }
  
  // Set embedding model if configured
  if (config.lmstudio.model) {
    const embedder = getLMStudioEmbedder();
    await embedder.setModel(config.lmstudio.model);
  }
  
  // === HIERARCHICAL RAG: Initialize summarizer ===
  if (config.summarization?.enabled && config.lmstudio.chatModel) {
    console.log('[RAG Server] Initializing summarizer...');
    const summarizerReady = await initializeSummarizer(config.lmstudio.chatModel);
    if (summarizerReady) {
      console.log('[RAG Server] Summarizer ready');
    } else {
      console.warn('[RAG Server] Summarizer not available (no chat model)');
    }
  }
  
  // === HIERARCHICAL RAG: Load dependency graph ===
  if (config.dependencyGraph?.enabled) {
    try {
      const graphData = await fs.readFile('./data/dependency-graph.json', 'utf-8');
      loadGraph(graphData);
      console.log('[RAG Server] Loaded dependency graph');
    } catch {
      console.log('[RAG Server] No existing dependency graph');
    }
  }
  
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
    
    console.log('[RAG Server] Updating config:', JSON.stringify(updates));
    
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
      console.log('[RAG Server] Setting embedding model:', updates.lmstudio.model);
      const embedder = getLMStudioEmbedder();
      await embedder.setModel(updates.lmstudio.model);
    }
    
    // Update the indexer with new config (important for the model!)
    indexer = getIndexer(config);
    indexer.onProgress(broadcastProgress);
    
    // Restart file watcher if project changed
    if (updates.project?.path) {
      indexer.stopWatcher();
      if (config.watcher.enabled) {
        indexer.startWatcher(updates.project.path);
      }
    }
    
    // Save config to file
    await saveConfig();
    
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
    await saveConfig();
    
    // Start indexing in background
    res.json({ success: true, message: 'Indexing started' });
    
    // Run indexing asynchronously
    indexer.indexProject(projectPath).then(async result => {
      console.log('[RAG Server] Indexing completed:', result);
      
      // Broadcast updated stats
      await broadcastStats();
      
      // Start file watcher
      if (config.watcher.enabled) {
        indexer.startWatcher(projectPath);
      }
    }).catch(async error => {
      console.error('[RAG Server] Indexing failed:', error);
      // Broadcast stats even on failure
      await broadcastStats();
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

// Query the index with hierarchical RAG support
app.post('/api/rag/query', async (req: Request, res: Response) => {
  try {
    const { query, limit = 5, filter, strategy } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    console.log(`[Query] Searching for: "${query}" (limit: ${limit})`);
    const startTime = Date.now();
    const timings = { planning: 0, hyde: 0, expansion: 0, search: 0, total: 0 };
    
    // === QUERY PLANNING ===
    // Create query plan with optional HyDE and expansion
    const planStart = Date.now();
    const queryPlan = await createQueryPlan(query, config, limit);
    timings.planning = Date.now() - planStart;
    
    if (queryPlan.hydeCode) {
      console.log(`[Query] HyDE generated ${queryPlan.hydeCode.length} chars of hypothetical code`);
      timings.hyde = timings.planning; // Included in planning
    }
    if (queryPlan.processedQueries.length > 1) {
      console.log(`[Query] Expanded to ${queryPlan.processedQueries.length} queries:`, queryPlan.processedQueries);
      timings.expansion = timings.planning; // Included in planning
    }
    
    // === SEARCH ===
    const searchStart = Date.now();
    
    // Build the query text (may include HyDE code)
    const queryText = buildQueryText(queryPlan);
    
    // Search with enhanced query
    const results = await indexer.query(queryText, limit * 2); // Get more for re-ranking
    
    timings.search = Date.now() - searchStart;
    
    console.log(`[Query] Got ${results.length} results from indexer (strategy: ${queryPlan.strategy})`);
    results.slice(0, 5).forEach((r, i) => {
      console.log(`[Query] Result ${i}: chunk=${r.chunk ? 'yes' : 'null'}, score=${r.score.toFixed(4)}, file=${r.chunk?.filePath || 'N/A'}`);
    });
    
    // Transform to RAGResult format with optional summaries
    const formattedResults: (RAGResult & { summary?: string })[] = results
      .filter(r => r.chunk !== null)
      .slice(0, limit)
      .map(r => ({
        filePath: r.chunk!.filePath,
        startLine: r.chunk!.startLine,
        endLine: r.chunk!.endLine,
        snippet: r.chunk!.content,
        symbolName: r.chunk!.name || null,
        symbolType: r.chunk!.type || null,
        language: r.chunk!.language,
        score: r.score,
        summary: (r.chunk as any)?.summary || undefined
      }));
    
    console.log(`[Query] Formatted ${formattedResults.length} results after filtering null chunks`);
    
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
    
    // === CONTEXT EXPANSION (for graph strategy) ===
    let relatedFiles: string[] = [];
    if (queryPlan.expandContext && config.dependencyGraph.enabled) {
      const initialFiles = [...new Set(filteredResults.map(r => r.filePath))];
      relatedFiles = getContextExpansion(initialFiles, queryPlan.strategy, 3);
    }
    
    // === FILE SUMMARIES (for summary strategy) ===
    let fileSummaries: FileSummary[] = [];
    if (queryPlan.strategy === 'summary' || queryPlan.strategy === 'file') {
      const matchedFiles = [...new Set(filteredResults.map(r => r.filePath))];
      fileSummaries = matchedFiles
        .map(f => indexer.getFileSummary(f))
        .filter((s): s is FileSummary => s !== null);
    }
    
    timings.total = Date.now() - startTime;
    
    res.json({ 
      results: filteredResults, 
      query,
      queryPlan: {
        strategy: queryPlan.strategy,
        hydeUsed: !!queryPlan.hydeCode,
        expansionUsed: queryPlan.processedQueries.length > 1,
        expandedQueries: queryPlan.processedQueries
      },
      fileSummaries: fileSummaries.length > 0 ? fileSummaries : undefined,
      relatedFiles: relatedFiles.length > 0 ? relatedFiles : undefined,
      latency: timings.total,
      timings,
      totalResults: filteredResults.length
    });
    
  } catch (error: any) {
    console.error('[Query] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get visualization data (2D projections)
app.get('/api/rag/visualization', async (req: Request, res: Response) => {
  try {
    const ragDb = getRAGDatabase(config.storage.dataPath);
    const projections = ragDb.getProjections();
    
    // Return in the format expected by the client
    res.json(projections.map(p => ({
      id: p.chunkId,
      x: p.x,
      y: p.y,
      filePath: p.filePath,
      symbolName: p.symbolName,
      symbolType: p.symbolType,
      language: p.language
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get chunks with pagination and filters
app.get('/api/rag/chunks', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '50', fileType, symbolType, search } = req.query;
    
    const result = indexer.getChunks({
      page: Number(page),
      limit: Number(limit),
      fileType: fileType as string,
      symbolType: symbolType as string,
      search: search as string
    });
    
    // Map to format expected by frontend (preview instead of full content)
    const chunks = result.chunks.map(c => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      language: c.language,
      tokens: c.tokens,
      preview: c.content.substring(0, 200)
    }));
    
    res.json({
      chunks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total,
        pages: Math.ceil(result.total / Number(limit))
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
    
    const chunk = indexer.getChunk(id);
    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }
    
    res.json(chunk);
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

// =============================================================================
// Hierarchical RAG Endpoints
// =============================================================================

// Get all file summaries
app.get('/api/rag/file-summaries', async (req: Request, res: Response) => {
  try {
    const summaries = indexer.getFileSummaries();
    res.json({
      summaries,
      total: summaries.length,
      enabled: config.summarization?.fileSummaries || false
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single file summary
app.get('/api/rag/file-summaries/:filePath(*)', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.params;
    const summary = indexer.getFileSummary(filePath);
    
    if (!summary) {
      return res.status(404).json({ error: 'File summary not found' });
    }
    
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Search file summaries
app.get('/api/rag/file-summaries/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = '5' } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const results = indexer.searchFileSummaries(query as string, Number(limit));
    res.json({ results, query, total: results.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get dependency graph stats
app.get('/api/rag/graph/stats', async (req: Request, res: Response) => {
  try {
    if (!config.dependencyGraph?.enabled) {
      return res.json({ enabled: false, message: 'Dependency graph is disabled' });
    }
    
    const stats = getGraphStats();
    res.json({ enabled: true, ...stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get dependency graph for a file
app.get('/api/rag/graph/:filePath(*)', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.params;
    const { depth = '2' } = req.query;
    
    if (!config.dependencyGraph?.enabled) {
      return res.json({ enabled: false, message: 'Dependency graph is disabled' });
    }
    
    const graph = getDependencyGraph();
    const node = graph.nodes.get(filePath);
    
    if (!node) {
      return res.status(404).json({ error: 'File not found in graph' });
    }
    
    // Get related files
    const related = getContextExpansion([filePath], 'graph', Number(depth));
    
    res.json({
      file: filePath,
      node,
      imports: node.imports,
      related,
      edges: graph.edges.filter(e => e.from === filePath || e.to === filePath)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get hierarchical RAG status
app.get('/api/rag/hierarchical/status', async (req: Request, res: Response) => {
  try {
    const graphStats = config.dependencyGraph?.enabled ? getGraphStats() : null;
    
    res.json({
      summarization: {
        enabled: config.summarization?.enabled || false,
        chunkSummaries: config.summarization?.chunkSummaries || false,
        fileSummaries: config.summarization?.fileSummaries || false,
        asyncGeneration: config.summarization?.asyncGeneration || false,
        summarizerReady: isSummarizerReady(),
        fileSummaryCount: indexer.getFileSummaries().length
      },
      dependencyGraph: {
        enabled: config.dependencyGraph?.enabled || false,
        nodeCount: graphStats?.nodeCount || 0,
        edgeCount: graphStats?.edgeCount || 0
      },
      queryEnhancement: {
        hyde: config.queryEnhancement?.enableHyde || false,
        queryExpansion: config.queryEnhancement?.enableQueryExpansion || false,
        contextualChunks: config.queryEnhancement?.enableContextualChunks || false,
        multiVector: config.queryEnhancement?.enableMultiVector || false
      },
      queryRouting: {
        enabled: config.queryRouting?.enabled || false,
        defaultStrategy: config.queryRouting?.defaultStrategy || 'code'
      }
    });
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

  wss.on('connection', async (ws: WebSocket) => {
    console.log('[RAG Server] WebSocket client connected');
    wsClients.add(ws);
    
    // Send current state on connection
    ws.send(JSON.stringify({ type: 'indexProgress', data: indexer.getProgress() }));
    ws.send(JSON.stringify({ type: 'config', data: config }));
    
    try {
      const stats = await getStats();
      ws.send(JSON.stringify({ type: 'stats', data: stats }));
    } catch (error) {
      console.error('[RAG Server] Failed to send initial stats:', error);
    }
    
    // Handle client messages (requests for data refresh)
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'getStats') {
          const stats = await getStats();
          ws.send(JSON.stringify({ type: 'stats', data: stats }));
        } else if (message.type === 'getConfig') {
          ws.send(JSON.stringify({ type: 'config', data: config }));
        } else if (message.type === 'getProgress') {
          ws.send(JSON.stringify({ type: 'indexProgress', data: indexer.getProgress() }));
        } else if (message.type === 'getModels') {
          const embedder = getLMStudioEmbedder();
          const models = await embedder.listModels();
          ws.send(JSON.stringify({ type: 'models', data: models }));
        }
      } catch (error) {
        console.error('[RAG Server] Failed to handle WS message:', error);
      }
    });
    
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
