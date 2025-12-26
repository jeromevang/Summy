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
import { getLanceDBStore, LanceDBStore } from '../storage/lancedb-store.js';
import { 
  initializeSummarizer, 
  isSummarizerReady, 
  summarizeChunk, 
  summarizeFile,
  buildContextualContent 
} from './summarizer.js';
import { analyzeFile as analyzeFileDeps, serializeGraph, loadGraph } from './graph-builder.js';
import { getRAGDatabase, RAGDatabase, StoredChunk as DBStoredChunk, FileSummary as DBFileSummary, SymbolType } from './database.js';

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
  private vectorStore: LanceDBStore;

  private progress: IndexProgress;
  private progressCallback: ProgressCallback | null = null;
  private isCancelled = false;

  private fileWatcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Set<string> = new Set();

  // SQLite database for persistent storage
  private ragDb: RAGDatabase;
  
  // Pending summary generation (async mode)
  private pendingSummaries: Set<string> = new Set();
  
  constructor(config: Partial<RAGConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.chunker = getChunker({
      maxChunkTokens: this.config.indexing.chunkSize,
      minChunkTokens: 50
    });
    this.embedder = getLMStudioEmbedder();
    this.vectorStore = getLanceDBStore(path.join(this.config.storage.dataPath, 'lance'));
    
    // Initialize SQLite database for persistent storage
    this.ragDb = getRAGDatabase(this.config.storage.dataPath);
    
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
   * Set database reference (legacy - no longer used, kept for API compatibility)
   * @deprecated Use the internal SQLite database instead
   */
  setDatabase(_db: any): void {
    // No longer used - RAG server now has its own SQLite database
    console.log('[Indexer] setDatabase() is deprecated - RAG server uses internal SQLite');
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
   * Store a chunk to SQLite database
   */
  private storeChunk(chunk: StoredChunk): void {
    // Convert to database format
    const dbChunk: DBStoredChunk = {
      id: chunk.id,
      filePath: chunk.filePath,
      vectorId: 0, // Will be set later when embedding is stored
      content: chunk.content,
      contentHash: this.hashContent(chunk.content),
      tokens: chunk.tokens,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      symbolName: chunk.symbolName,
      symbolType: chunk.symbolType,
      language: chunk.language,
      imports: [],
      signature: chunk.signature,
      summary: chunk.summary || null,
      purpose: chunk.purpose || null,
      createdAt: chunk.createdAt
    };
    this.ragDb.addChunk(dbChunk);
  }

  /**
   * Get all stored chunks with pagination and filters (from SQLite)
   */
  getChunks(options: {
    page?: number;
    limit?: number;
    fileType?: string;
    symbolType?: string;
    search?: string;
  } = {}): { chunks: StoredChunk[]; total: number } {
    const result = this.ragDb.getChunks(options);
    // Convert from DB format to StoredChunk format
    const chunks: StoredChunk[] = result.chunks.map(c => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      language: c.language,
      tokens: c.tokens,
      content: c.content,
      signature: c.signature,
      createdAt: c.createdAt,
      summary: c.summary || undefined,
      purpose: c.purpose || undefined
    }));
    return { chunks, total: result.total };
  }

  /**
   * Get a single chunk by ID (from SQLite)
   */
  getChunk(id: string): StoredChunk | null {
    const c = this.ragDb.getChunk(id);
    if (!c) return null;
    return {
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      language: c.language,
      tokens: c.tokens,
      content: c.content,
      signature: c.signature,
      createdAt: c.createdAt,
      summary: c.summary || undefined,
      purpose: c.purpose || undefined
    };
  }

  /**
   * Clear all stored chunks (in SQLite)
   */
  clearStoredChunks(): void {
    this.ragDb.clearAllChunks();
  }

  /**
   * Get total stored chunk count (from SQLite)
   */
  getStoredChunkCount(): number {
    return this.ragDb.getChunkCount();
  }

  /**
   * Get all file summaries (from SQLite)
   */
  getFileSummaries(): FileSummary[] {
    return this.ragDb.getAllFileSummaries();
  }

  /**
   * Get a single file summary (from SQLite)
   */
  getFileSummary(filePath: string): FileSummary | null {
    return this.ragDb.getFileSummary(filePath);
  }

  /**
   * Search file summaries by keyword (from SQLite)
   */
  searchFileSummaries(query: string, limit: number = 5): FileSummary[] {
    return this.ragDb.searchFileSummaries(query).slice(0, limit);
  }

  /**
   * Hash file content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
  
  /**
   * Map chunk type to symbol type for the symbols table
   */
  private mapChunkTypeToSymbolType(chunkType: string): 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable' | 'constant' | 'property' | 'module' {
    const typeMap: Record<string, 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable' | 'constant' | 'property' | 'module'> = {
      'function': 'function',
      'arrow_function': 'function',
      'method': 'method',
      'method_definition': 'method',
      'class': 'class',
      'class_declaration': 'class',
      'interface': 'interface',
      'interface_declaration': 'interface',
      'type_alias': 'type',
      'type': 'type',
      'const': 'constant',
      'let': 'variable',
      'var': 'variable',
      'variable': 'variable',
      'property': 'property',
      'module': 'module',
      'namespace': 'module'
    };
    return typeMap[chunkType.toLowerCase()] || 'function';
  }
  
  /**
   * Extract doc comment from code content
   */
  private extractDocComment(content: string): string | null {
    // Look for JSDoc-style comments /** ... */
    const jsDocMatch = content.match(/\/\*\*[\s\S]*?\*\//);
    if (jsDocMatch) {
      return jsDocMatch[0]
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .trim();
    }
    
    // Look for leading // comments
    const lines = content.split('\n');
    const comments: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        comments.push(trimmed.replace(/^\/\/\s?/, ''));
      } else if (trimmed.length > 0) {
        break; // Stop at first non-comment line
      }
    }
    
    return comments.length > 0 ? comments.join('\n') : null;
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
    
    // Check if file has changed by comparing existing chunks' hashes
    const existingChunks = this.ragDb.getChunksByFile(relativePath);
    if (existingChunks.length > 0) {
      // If the first chunk's content hash matches, file probably hasn't changed much
      // For a proper check, we'd need file-level hash tracking
      // For now, always re-index (can be optimized later)
      this.ragDb.deleteChunksByFile(relativePath);
      this.ragDb.deleteSymbolsByFile(relativePath);
      this.ragDb.deleteFileDependencies(relativePath);
    }
    
    // Chunk the file
    const chunks = await this.chunker.chunkFile(relativePath, content);
    
    // === DEPENDENCY GRAPH ===
    // Analyze imports/exports for dependency graph
    let imports: { from: string; names: string[]; isExternal: boolean }[] = [];
    if (this.config.dependencyGraph?.enabled) {
      const analysis = analyzeFileDeps(relativePath, content, language);
      imports = analysis.imports;
      
      // Store file dependencies in SQLite
      this.ragDb.deleteFileDependencies(relativePath);
      const deps = imports.map(imp => ({
        fromFile: relativePath,
        toFile: imp.from,
        importType: 'import' as const,
        importedSymbols: imp.names,
        isExternal: imp.isExternal
      }));
      if (deps.length > 0) {
        this.ragDb.addFileDependencies(deps);
      }
    }
    
    // === BATCH EMBEDDING FOR SPEED ===
    // Collect all content to embed first, then batch embed
    const textsToEmbed: string[] = [];
    const enrichedChunks: EnrichedChunk[] = [];
    
    // Phase 1: Prepare content and summaries (no embedding yet)
    for (const chunk of chunks) {
      if (this.isCancelled) break;
      
      // === CONTEXTUAL CHUNK AUGMENTATION ===
      let contentToEmbed = chunk.content;
      if (this.config.queryEnhancement?.enableContextualChunks) {
        contentToEmbed = buildContextualContent(chunk);
      }
      textsToEmbed.push(contentToEmbed);
      
      // === SUMMARY GENERATION ===
      let enrichedChunk: EnrichedChunk = { ...chunk };
      if (this.config.summarization?.enabled && this.config.summarization?.chunkSummaries) {
        if (this.config.summarization.asyncGeneration) {
          // Queue for async generation (non-blocking)
          this.pendingSummaries.add(chunk.id);
        } else if (isSummarizerReady()) {
          // Generate summary synchronously (blocking - avoid if possible)
          enrichedChunk = await summarizeChunk(chunk);
        }
      }
      enrichedChunks.push(enrichedChunk);
    }
    
    if (this.isCancelled) {
      return chunks;
    }
    
    // Phase 2: Batch embed all chunks at once (parallel processing inside)
    let embeddings: number[][] = [];
    try {
      embeddings = await this.embedder.embed(textsToEmbed);
      this.progress.embeddingsGenerated += embeddings.length;
      this.emitProgress();
    } catch (error) {
      console.error(`[Indexer] Failed to batch embed chunks in ${relativePath}:`, error);
      embeddings = textsToEmbed.map(() => []); // Empty embeddings as fallback
    }
    
    // Phase 3: Batch embed summaries if multi-vector is enabled
    let summaryEmbeddings: number[][] = [];
    if (this.config.queryEnhancement?.enableMultiVector) {
      const summaryTexts = enrichedChunks
        .map(c => c.summary || '')
        .filter(s => s.length > 0);
      
      if (summaryTexts.length > 0) {
        try {
          const summaryEmbs = await this.embedder.embed(summaryTexts);
          // Map back to full array with empty arrays for chunks without summaries
          let summaryIdx = 0;
          summaryEmbeddings = enrichedChunks.map(c => {
            if (c.summary && c.summary.length > 0) {
              return summaryEmbs[summaryIdx++] || [];
            }
            return [];
          });
        } catch {
          summaryEmbeddings = enrichedChunks.map(() => []);
        }
      } else {
        summaryEmbeddings = enrichedChunks.map(() => []);
      }
    } else {
      summaryEmbeddings = enrichedChunks.map(() => []);
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
      
      // Save metadata to SQLite database
      this.ragDb.addChunk({
        id: chunk.id,
        filePath: relativePath,
        vectorId,
        content: chunk.content,
        contentHash: this.hashContent(chunk.content),
        tokens: chunk.tokens,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: chunk.name,
        symbolType: chunk.type,
        language: chunk.language,
        imports: chunk.imports || [],
        signature: chunk.signature || null,
        summary: enriched.summary || null,
        purpose: enriched.purpose || null,
        createdAt: new Date().toISOString()
      });
      
      // === SYMBOL EXTRACTION ===
      // Store symbol information for code-aware queries
      if (chunk.name && chunk.type) {
        const symbolId = `${relativePath}:${chunk.name}:${chunk.startLine}`;
        const symbolType = this.mapChunkTypeToSymbolType(chunk.type);
        
        // Extract doc comment from content (look for /** ... */ or // comments above)
        const docComment = this.extractDocComment(chunk.content);
        
        // Detect visibility and modifiers from content
        const isExported = /^export\s/m.test(chunk.content) || content.includes(`export ${chunk.name}`);
        const isAsync = /^async\s/m.test(chunk.content) || (chunk.signature?.includes('async') ?? false);
        const isStatic = /static\s/.test(chunk.content);
        
        this.ragDb.addSymbol({
          id: symbolId,
          name: chunk.name,
          qualifiedName: `${relativePath}#${chunk.name}`,
          type: symbolType,
          filePath: relativePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          signature: chunk.signature || null,
          docComment,
          visibility: isExported ? 'public' : 'private',
          isExported,
          isAsync,
          isStatic,
          parentSymbolId: null, // TODO: track parent class/module
          chunkId: chunk.id,
          language: chunk.language
        });
      }
      
      this.progress.chunksCreated++;
    }
    
    // === FILE SUMMARY ===
    if (this.config.summarization?.enabled && this.config.summarization?.fileSummaries) {
      if (!this.config.summarization.asyncGeneration && isSummarizerReady()) {
        const fileSummary = await summarizeFile(relativePath, enrichedChunks, imports);
        this.ragDb.addFileSummary(fileSummary);
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
      
      // Update index status in SQLite
      this.ragDb.upsertIndexStatus({
        projectPath,
        projectHash: this.hashContent(projectPath),
        embeddingModel: this.config.lmstudio.model,
        embeddingDimensions: this.embedder.dimensions,
        status: 'indexing'
      });
      
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
      
      // Update index status in SQLite
      const diskUsage = await this.vectorStore.getDiskUsage();
      this.ragDb.upsertIndexStatus({
        status: 'ready',
        totalFiles: this.progress.processedFiles,
        totalChunks: this.progress.chunksCreated,
        totalVectors: this.vectorStore.size,
        storageSize: diskUsage,
        lastIndexed: new Date().toISOString()
      });
      
      // Record metric
      this.ragDb.addMetric({
        type: 'indexing',
        filesProcessed: this.progress.processedFiles,
        chunksCreated: this.progress.chunksCreated,
        embeddingsGenerated: this.progress.embeddingsGenerated,
        durationMs: Date.now() - startTime
      });
      
      // Save dependency graph to JSON file
      if (this.config.dependencyGraph?.enabled) {
        try {
          const graphJson = serializeGraph();
          const graphPath = path.join(this.config.storage.dataPath, 'dependency-graph.json');
          await fs.writeFile(graphPath, graphJson, 'utf-8');
          console.log(`[Indexer] Saved dependency graph to ${graphPath}`);
        } catch (graphError) {
          console.error('[Indexer] Failed to save dependency graph:', graphError);
        }
      }
      
      // Done
      this.progress.status = 'complete';
      this.progress.currentFile = '';
      this.progress.eta = 0;
      this.emitProgress();
      
      const duration = Date.now() - startTime;
      console.log(`[Indexer] Completed in ${duration}ms: ${this.progress.processedFiles} files, ${this.progress.chunksCreated} chunks`);
      
      // Only clear embedder reference if NOT keeping loaded
      // (Model stays loaded in LM Studio for quick reuse)
      if (!this.config.lmstudio.keepLoaded) {
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
      
      this.ragDb.upsertIndexStatus({ status: 'error' });
      
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
        
        // Ensure vector store is initialized before re-indexing
        if (!this.vectorStore.isReady) {
          console.log(`[Indexer] Initializing vector store for re-indexing...`);
          try {
            // Initialize embedder if needed
            if (this.config.lmstudio.model) {
              await this.embedder.setModel(this.config.lmstudio.model);
              const healthy = await this.embedder.healthCheck();
              if (!healthy) {
                console.error(`[Indexer] LM Studio not available, skipping re-index`);
                return;
              }
            }
            await this.vectorStore.initialize(this.embedder.dimensions, 100000);
          } catch (initError) {
            console.error(`[Indexer] Failed to initialize vector store:`, initError);
            return;
          }
        }
        
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
      this.ragDb.deleteChunksByFile(relativePath);
      this.ragDb.deleteFileSummary(relativePath);
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
    
    // Get chunk metadata from SQLite or vector store metadata
    const response = results.map(result => {
      let chunk: CodeChunk | null = null;
      
      // Try SQLite database first (has more complete metadata)
      const dbChunk = this.ragDb.getChunk(result.chunkId);
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
          signature: dbChunk.signature || undefined,
          tokens: dbChunk.tokens
        };
      }
      
      // Fall back to vector store metadata if DB entry not found
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
    
    // Record query metric
    this.ragDb.addMetric({
      type: 'query',
      filesProcessed: 0,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      durationMs: Date.now() - startTime
    });
    
    // Only clear embedder reference if NOT keeping loaded
    // (Model stays loaded in LM Studio for quick reuse)
    if (!this.config.lmstudio.keepLoaded) {
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
    this.ragDb.clearAllFileSummaries();
    this.ragDb.clearProjections();
    this.ragDb.upsertIndexStatus({ status: 'idle', totalFiles: 0, totalChunks: 0, totalVectors: 0 });

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
