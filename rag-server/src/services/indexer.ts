/**
 * File Indexer Service
 * 
 * Orchestrates the RAG indexing pipeline:
 * 1. Scan directory for code files
 * 2. Parse and chunk files using tree-sitter
 * 3. Generate embeddings via LM Studio
 * 4. Store vectors in HNSWLib/Vectra
 * 5. Save metadata to SQLite
 * 
 * Features:
 * - Real-time progress via WebSocket
 * - Incremental updates (only re-index changed files)
 * - File watching for auto-reindex
 * - Cancellation support
 * - Hierarchical RAG: summaries, dependency graph, multi-vector
 */

import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { watch, FSWatcher } from 'chokidar';
import { v4 as uuidv4 } from 'uuid';

import { IndexProgress, CodeChunk, EnrichedChunk, FileSummary, defaultConfig, RAGConfig } from '../config.js';
import { Chunker, getChunker, detectLanguage } from './chunker.js';
import { getLMStudioEmbedder, LMStudioEmbedder } from '../embeddings/lmstudio.js';
import { getHNSWLibStore, HNSWLibStore } from '../storage/hnswlib.js';
import { 
  initializeSummarizer, 
  isSummarizerReady, 
  summarizeChunk, 
  summarizeFile,
  buildContextualContent 
} from './summarizer.js';
import { analyzeFile as analyzeFileDeps, serializeGraph, loadGraph } from './graph-builder.js';

// Progress callback type
export type ProgressCallback = (progress: IndexProgress) => void;

// Stored chunk info for browser
export interface StoredChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  tokens: number;
  content: string;
  signature: string | null;
  createdAt: string;
  // Hierarchical RAG additions
  summary?: string;
  purpose?: string;
}

export class Indexer {
  private config: RAGConfig;
  private chunker: Chunker;
  private embedder: LMStudioEmbedder;
  private vectorStore: HNSWLibStore;

  private progress: IndexProgress;
  private progressCallback: ProgressCallback | null = null;
  private isCancelled = false;

  private fileWatcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Set<string> = new Set();

  // Database reference (will be injected or imported)
  private db: any = null;
  
  // In-memory chunk storage for browser
  private storedChunks: Map<string, StoredChunk> = new Map();
  
  // File summaries storage
  private fileSummaries: Map<string, FileSummary> = new Map();
  
  // Pending summary generation (async mode)
  private pendingSummaries: Set<string> = new Set();
  
  constructor(config: Partial<RAGConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.chunker = getChunker({
      maxChunkTokens: this.config.indexing.chunkSize,
      minChunkTokens: 50
    });
    this.embedder = getLMStudioEmbedder();
    this.vectorStore = getHNSWLibStore(this.config.storage.dataPath);
    
    this.progress = {
      status: 'idle',
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      chunksCreated: 0,
      embeddingsGenerated: 0,
      eta: 0
    };
  }
  
  /**
   * Set database reference (for metadata storage)
   */
  setDatabase(db: any): void {
    this.db = db;
  }

  /**
   * Update config (for live updates)
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.lmstudio) {
      this.config.lmstudio = { ...this.config.lmstudio, ...config.lmstudio };
    }
    console.log('[Indexer] Config updated, model:', this.config.lmstudio.model);
  }

  /**
   * Set progress callback
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }
  
  /**
   * Emit progress update
   */
  private emitProgress(): void {
    if (this.progressCallback) {
      this.progressCallback({ ...this.progress });
    }
  }
  
  /**
   * Cancel ongoing indexing
   */
  cancel(): void {
    this.isCancelled = true;
    this.progress.status = 'idle';
    this.emitProgress();
  }
  
  /**
   * Get current progress
   */
  getProgress(): IndexProgress {
    return { ...this.progress };
  }

  /**
   * Store a chunk for browser access
   */
  private storeChunk(chunk: StoredChunk): void {
    this.storedChunks.set(chunk.id, chunk);
  }

  /**
   * Get all stored chunks with pagination and filters
   */
  getChunks(options: {
    page?: number;
    limit?: number;
    fileType?: string;
    symbolType?: string;
    search?: string;
  } = {}): { chunks: StoredChunk[]; total: number } {
    const page = options.page || 1;
    const limit = options.limit || 50;
    
    let chunks = Array.from(this.storedChunks.values());
    
    // Apply filters
    if (options.fileType) {
      chunks = chunks.filter(c => c.language.toLowerCase() === options.fileType?.toLowerCase());
    }
    if (options.symbolType) {
      chunks = chunks.filter(c => c.symbolType?.toLowerCase() === options.symbolType?.toLowerCase());
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      chunks = chunks.filter(c => 
        c.content.toLowerCase().includes(search) ||
        c.filePath.toLowerCase().includes(search) ||
        (c.symbolName?.toLowerCase().includes(search) ?? false)
      );
    }
    
    // Sort by file path and line number
    chunks.sort((a, b) => {
      const pathCompare = a.filePath.localeCompare(b.filePath);
      if (pathCompare !== 0) return pathCompare;
      return a.startLine - b.startLine;
    });
    
    const total = chunks.length;
    const offset = (page - 1) * limit;
    const paginatedChunks = chunks.slice(offset, offset + limit);
    
    return { chunks: paginatedChunks, total };
  }

  /**
   * Get a single chunk by ID
   */
  getChunk(id: string): StoredChunk | null {
    return this.storedChunks.get(id) || null;
  }

  /**
   * Clear all stored chunks
   */
  clearStoredChunks(): void {
    this.storedChunks.clear();
  }

  /**
   * Get total stored chunk count
   */
  getStoredChunkCount(): number {
    return this.storedChunks.size;
  }

  /**
   * Get all file summaries
   */
  getFileSummaries(): FileSummary[] {
    return Array.from(this.fileSummaries.values());
  }

  /**
   * Get a single file summary
   */
  getFileSummary(filePath: string): FileSummary | null {
    return this.fileSummaries.get(filePath) || null;
  }

  /**
   * Search file summaries by keyword
   */
  searchFileSummaries(query: string, limit: number = 5): FileSummary[] {
    const lower = query.toLowerCase();
    return Array.from(this.fileSummaries.values())
      .filter(f => 
        f.summary.toLowerCase().includes(lower) ||
        f.responsibility.toLowerCase().includes(lower) ||
        f.filePath.toLowerCase().includes(lower)
      )
      .slice(0, limit);
  }

  /**
   * Hash file content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
  
  /**
   * Check if file should be included
   */
  private shouldIncludeFile(filePath: string): boolean {
    const relativePath = filePath.replace(/\\/g, '/');
    
    // Check exclude patterns
    for (const pattern of this.config.indexing.excludePatterns) {
      if (this.matchPattern(relativePath, pattern)) {
        return false;
      }
    }
    
    // Check include patterns
    for (const pattern of this.config.indexing.includePatterns) {
      if (this.matchPattern(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Simple glob pattern matching
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(regexPattern);
    return regex.test(filePath);
  }
  
  /**
   * Scan directory for code files
   */
  private async scanDirectory(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    
    for (const pattern of this.config.indexing.includePatterns) {
      const matches = await glob(pattern, {
        cwd: projectPath,
        absolute: true,
        ignore: this.config.indexing.excludePatterns,
        nodir: true
      });
      
      for (const file of matches) {
        if (!files.includes(file)) {
          files.push(file);
        }
      }
    }
    
    return files;
  }
  
  /**
   * Index a single file with hierarchical RAG support
   */
  private async indexFile(filePath: string, projectPath: string): Promise<CodeChunk[]> {
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');
    const fileHash = this.hashContent(content);
    const language = detectLanguage(filePath);
    
    // Check if file has changed (if we have DB)
    if (this.db) {
      const existingFile = this.db.getRAGFile(relativePath);
      if (existingFile && existingFile.fileHash === fileHash) {
        // File hasn't changed, skip
        return [];
      }
      
      // Remove old chunks for this file
      if (existingFile) {
        this.db.deleteRAGFile(relativePath);
      }
    }
    
    // Chunk the file
    const chunks = await this.chunker.chunkFile(relativePath, content);
    
    // === DEPENDENCY GRAPH ===
    // Analyze imports/exports for dependency graph
    let imports: { from: string; names: string[]; isExternal: boolean }[] = [];
    if (this.config.dependencyGraph?.enabled) {
      const analysis = analyzeFileDeps(relativePath, content, language);
      imports = analysis.imports;
    }
    
    // Generate embeddings (with optional contextual augmentation)
    const embeddings: number[][] = [];
    const summaryEmbeddings: number[][] = [];
    const enrichedChunks: EnrichedChunk[] = [];
    
    for (const chunk of chunks) {
      if (this.isCancelled) break;
      
      try {
        // === CONTEXTUAL CHUNK AUGMENTATION ===
        // Embed metadata + code instead of just code
        let contentToEmbed = chunk.content;
        if (this.config.queryEnhancement?.enableContextualChunks) {
          contentToEmbed = buildContextualContent(chunk);
        }
        
        const embedding = await this.embedder.embedSingle(contentToEmbed);
        embeddings.push(embedding);
        this.progress.embeddingsGenerated++;
        this.emitProgress();
        
        // === SUMMARY GENERATION ===
        let enrichedChunk: EnrichedChunk = { ...chunk };
        if (this.config.summarization?.enabled && this.config.summarization?.chunkSummaries) {
          if (this.config.summarization.asyncGeneration) {
            // Queue for async generation
            this.pendingSummaries.add(chunk.id);
            enrichedChunk = { ...chunk };
          } else if (isSummarizerReady()) {
            // Generate summary synchronously
            enrichedChunk = await summarizeChunk(chunk);
          }
        }
        enrichedChunks.push(enrichedChunk);
        
        // === MULTI-VECTOR: Generate summary embedding ===
        if (this.config.queryEnhancement?.enableMultiVector && enrichedChunk.summary) {
          try {
            const summaryEmb = await this.embedder.embedSingle(enrichedChunk.summary);
            summaryEmbeddings.push(summaryEmb);
          } catch {
            summaryEmbeddings.push([]);
          }
        } else {
          summaryEmbeddings.push([]);
        }
        
      } catch (error) {
        console.error(`[Indexer] Failed to embed chunk in ${relativePath}:`, error);
        embeddings.push([]); // Empty embedding as placeholder
        summaryEmbeddings.push([]);
        enrichedChunks.push({ ...chunk });
      }
    }
    
    // Store in vector store
    const fileId = uuidv4();
    for (let i = 0; i < chunks.length; i++) {
      if (this.isCancelled) break;
      if (embeddings[i].length === 0) continue;
      
      const chunk = chunks[i];
      const enriched = enrichedChunks[i];
      
      // Store with chunk metadata in vector store (so we don't need DB for queries)
      const vectorId = await this.vectorStore.add(embeddings[i], chunk.id, {
        content: chunk.content,
        filePath: relativePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: chunk.name,
        symbolType: chunk.type,
        language: chunk.language,
        signature: chunk.signature,
        summary: enriched.summary,
        purpose: enriched.purpose
      });
      
      // === MULTI-VECTOR: Store summary embedding with different ID ===
      if (summaryEmbeddings[i]?.length > 0) {
        await this.vectorStore.add(summaryEmbeddings[i], `${chunk.id}_summary`, {
          content: enriched.summary || '',
          filePath: relativePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          symbolName: chunk.name,
          symbolType: chunk.type,
          language: chunk.language,
          signature: chunk.signature,
          isSummaryVector: true,
          originalChunkId: chunk.id
        });
      }
      
      // Store chunk for browser access
      this.storeChunk({
        id: chunk.id,
        filePath: relativePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: chunk.name || null,
        symbolType: chunk.type || null,
        language: chunk.language,
        tokens: chunk.tokens,
        content: chunk.content,
        signature: chunk.signature || null,
        createdAt: new Date().toISOString(),
        summary: enriched.summary,
        purpose: enriched.purpose
      });
      
      // Save metadata to DB (optional, for richer querying)
      if (this.db) {
        this.db.addRAGChunk({
          id: chunk.id,
          fileId,
          vectorId,
          content: chunk.content,
          contentHash: this.hashContent(chunk.content),
          tokens: chunk.tokens,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          symbolName: chunk.name,
          symbolType: chunk.type,
          language: chunk.language,
          imports: chunk.imports,
          signature: chunk.signature,
          summary: enriched.summary,
          purpose: enriched.purpose
        });
      }
      
      this.progress.chunksCreated++;
    }
    
    // Save file metadata to DB
    if (this.db) {
      this.db.upsertRAGFile({
        id: fileId,
        filePath: relativePath,
        fileHash,
        fileSize: content.length,
        chunkCount: chunks.length,
        language
      });
    }
    
    // === FILE SUMMARY ===
    if (this.config.summarization?.enabled && this.config.summarization?.fileSummaries) {
      if (!this.config.summarization.asyncGeneration && isSummarizerReady()) {
        const fileSummary = await summarizeFile(relativePath, enrichedChunks, imports);
        this.fileSummaries.set(relativePath, fileSummary);
      }
    }
    
    return chunks;
  }
  
  /**
   * Index entire project
   */
  async indexProject(projectPath: string): Promise<{
    totalFiles: number;
    totalChunks: number;
    duration: number;
  }> {
    const startTime = Date.now();
    this.isCancelled = false;
    
    try {
      // Initialize
      this.progress = {
        status: 'scanning',
        totalFiles: 0,
        processedFiles: 0,
        currentFile: '',
        chunksCreated: 0,
        embeddingsGenerated: 0,
        eta: 0
      };
      this.emitProgress();
      
      // Ensure embedder is ready
      if (this.config.lmstudio.model) {
        await this.embedder.setModel(this.config.lmstudio.model);
      }
      
      // Check embedder health
      const healthy = await this.embedder.healthCheck();
      if (!healthy) {
        throw new Error('LM Studio is not available');
      }
      
      // Initialize vector store
      if (!this.vectorStore.isReady) {
        await this.vectorStore.initialize(this.embedder.dimensions, 100000);
      }
      
      // Try to load existing index
      try {
        await this.vectorStore.load();
      } catch {
        // No existing index, that's fine
      }
      
      // Scan for files
      console.log(`[Indexer] Scanning ${projectPath}...`);
      const files = await this.scanDirectory(projectPath);
      
      this.progress.totalFiles = files.length;
      this.progress.status = 'chunking';
      this.emitProgress();
      
      console.log(`[Indexer] Found ${files.length} files to index`);
      
      // Update DB with project info
      if (this.db) {
        this.db.upsertRAGIndex({
          name: path.basename(projectPath),
          projectPath,
          projectHash: this.hashContent(projectPath),
          embeddingModel: this.config.lmstudio.model,
          embeddingDimensions: this.embedder.dimensions,
          status: 'indexing'
        });
      }
      
      // Process files
      for (let i = 0; i < files.length; i++) {
        if (this.isCancelled) {
          console.log('[Indexer] Indexing cancelled');
          break;
        }
        
        const file = files[i];
        this.progress.currentFile = path.relative(projectPath, file);
        this.progress.status = i < files.length / 2 ? 'chunking' : 'embedding';
        
        // Estimate ETA
        const elapsed = Date.now() - startTime;
        const rate = (i + 1) / (elapsed / 1000);
        const remaining = files.length - i - 1;
        this.progress.eta = remaining / rate;
        
        this.emitProgress();
        
        try {
          await this.indexFile(file, projectPath);
        } catch (error) {
          console.error(`[Indexer] Failed to index ${file}:`, error);
        }
        
        this.progress.processedFiles = i + 1;
      }
      
      // Save index
      this.progress.status = 'storing';
      this.emitProgress();
      
      await this.vectorStore.save();
      
      // Update DB status
      if (this.db) {
        const diskUsage = await this.vectorStore.getDiskUsage();
        this.db.updateRAGIndexStatus('ready', {
          totalFiles: this.progress.processedFiles,
          totalChunks: this.progress.chunksCreated,
          totalVectors: this.vectorStore.size,
          storageSize: diskUsage
        });
        
        // Record metric
        this.db.addRAGMetric({
          type: 'indexing',
          filesProcessed: this.progress.processedFiles,
          chunksCreated: this.progress.chunksCreated,
          embeddingsGenerated: this.progress.embeddingsGenerated,
          durationMs: Date.now() - startTime
        });
      }
      
      // Done
      this.progress.status = 'complete';
      this.progress.currentFile = '';
      this.progress.eta = 0;
      this.emitProgress();
      
      const duration = Date.now() - startTime;
      console.log(`[Indexer] Completed in ${duration}ms: ${this.progress.processedFiles} files, ${this.progress.chunksCreated} chunks`);
      
      // Unload embedder if configured
      if (this.config.lmstudio.loadOnDemand) {
        await this.embedder.unload();
      }
      
      return {
        totalFiles: this.progress.processedFiles,
        totalChunks: this.progress.chunksCreated,
        duration
      };
      
    } catch (error: any) {
      console.error('[Indexer] Indexing failed:', error);
      
      this.progress.status = 'error';
      this.progress.error = error.message;
      this.emitProgress();
      
      if (this.db) {
        this.db.updateRAGIndexStatus('error');
      }
      
      throw error;
    }
  }
  
  /**
   * Start file watcher for auto-reindex
   */
  startWatcher(projectPath: string): void {
    if (!this.config.watcher.enabled) {
      return;
    }
    
    this.stopWatcher();
    
    // Use specific watch paths if configured, otherwise watch project root
    // Watching specific subdirs is much more memory-efficient than root + ignore
    const watchPaths = this.config.watcher.paths?.length 
      ? this.config.watcher.paths.map(p => path.join(projectPath, p))
      : [projectPath];
    
    console.log(`[Indexer] Starting file watcher on: ${watchPaths.join(', ')}`);
    
    this.fileWatcher = watch(watchPaths, {
      ignored: this.config.indexing.excludePatterns,
      persistent: true,
      ignoreInitial: true,
      // Use polling only if needed (less memory than fsevents on some systems)
      usePolling: false,
      // Limit depth to avoid deep traversal
      depth: 10
    });
    
    const queueChange = (filePath: string, eventType: string = 'change') => {
      // Log every file change detected
      const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');
      console.log(`[Watcher] ${eventType}: ${relativePath}`);
      
      if (!this.shouldIncludeFile(filePath)) {
        console.log(`[Watcher] Skipped (not included): ${relativePath}`);
        return;
      }
      
      this.pendingChanges.add(filePath);
      console.log(`[Watcher] Queued: ${relativePath} (pending: ${this.pendingChanges.size})`);
      
      // Debounce
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(async () => {
        const changes = [...this.pendingChanges];
        this.pendingChanges.clear();
        
        console.log(`[Indexer] Re-indexing ${changes.length} changed files:`);
        changes.forEach(f => console.log(`  - ${path.relative(projectPath, f).replace(/\\/g, '/')}`))
        
        for (const file of changes) {
          try {
            await this.indexFile(file, projectPath);
          } catch (error) {
            console.error(`[Indexer] Failed to re-index ${file}:`, error);
          }
        }
        
        // Save after changes
        await this.vectorStore.save();
        
      }, this.config.watcher.debounceMs);
    };
    
    this.fileWatcher.on('change', (fp) => queueChange(fp, 'change'));
    this.fileWatcher.on('add', (fp) => queueChange(fp, 'add'));
    this.fileWatcher.on('unlink', async (filePath) => {
      // Remove from index
      const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');
      if (this.db) {
        this.db.deleteRAGFile(relativePath);
      }
    });
  }
  
  /**
   * Stop file watcher
   */
  stopWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.pendingChanges.clear();
  }
  
  /**
   * Query the index
   */
  async query(queryText: string, limit: number = 5): Promise<Array<{
    chunk: CodeChunk | null;
    score: number;
  }>> {
    const startTime = Date.now();
    
    // Ensure embedder is loaded
    if (this.config.lmstudio.model) {
      await this.embedder.setModel(this.config.lmstudio.model);
    }
    
    if (!this.embedder.isLoaded) {
      await this.embedder.load();
    }
    
    // Embed query
    const queryVector = await this.embedder.embedSingle(queryText);
    
    // Search
    const results = await this.vectorStore.search(queryVector, limit);
    
    // Get chunk metadata from DB or from vector store metadata
    const response = results.map(result => {
      let chunk: CodeChunk | null = null;
      
      // Try database first (has more complete metadata)
      if (this.db) {
        const dbChunk = this.db.getRAGChunk(result.chunkId);
        if (dbChunk) {
          chunk = {
            id: dbChunk.id,
            content: dbChunk.content,
            type: dbChunk.symbolType as CodeChunk['type'],
            name: dbChunk.symbolName || 'unknown',
            filePath: dbChunk.filePath || '',
            startLine: dbChunk.startLine,
            endLine: dbChunk.endLine,
            language: dbChunk.language,
            imports: dbChunk.imports || [],
            signature: dbChunk.signature,
            tokens: dbChunk.tokens
          };
        }
      }
      
      // Fall back to vector store metadata if DB not available
      if (!chunk && result.metadata) {
        chunk = {
          id: result.chunkId,
          content: result.metadata.content || '',
          type: (result.metadata.symbolType as CodeChunk['type']) || 'code',
          name: result.metadata.symbolName || 'unknown',
          filePath: result.metadata.filePath || '',
          startLine: result.metadata.startLine || 0,
          endLine: result.metadata.endLine || 0,
          language: result.metadata.language || 'unknown',
          imports: [],
          signature: result.metadata.signature,
          tokens: 0
        };
      }
      
      return {
        chunk,
        score: result.score
      };
    });
    
    // Record metric
    if (this.db) {
      this.db.addRAGMetric({
        type: 'query',
        query: queryText,
        resultsCount: results.length,
        topScore: results[0]?.score || 0,
        latencyMs: Date.now() - startTime
      });
    }
    
    // Unload embedder if configured
    if (this.config.lmstudio.loadOnDemand) {
      await this.embedder.unload();
    }
    
    return response;
  }
  
  /**
   * Clear all indexed data
   */
  async clear(): Promise<void> {
    await this.vectorStore.clear();
    this.clearStoredChunks();

    if (this.db) {
      this.db.clearAllRAGData();
    }

    this.progress = {
      status: 'idle',
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      chunksCreated: 0,
      embeddingsGenerated: 0,
      eta: 0
    };
    
    this.emitProgress();
  }
}

// Export singleton
let indexerInstance: Indexer | null = null;

export function getIndexer(config?: Partial<RAGConfig>): Indexer {
  if (!indexerInstance) {
    indexerInstance = new Indexer(config);
  } else if (config) {
    // Update existing instance config
    indexerInstance.updateConfig(config);
  }
  return indexerInstance;
}
