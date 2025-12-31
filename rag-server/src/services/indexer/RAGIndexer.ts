import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { watch, FSWatcher } from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

import { IndexProgress, CodeChunk, EnrichedChunk, FileSummary, defaultConfig, RAGConfig } from '../../config.js';
import { Chunker, detectLanguage } from '../chunker.js';
import { getLMStudioEmbedder, LMStudioEmbedder } from '../../embeddings/lmstudio.js';
import { getLanceDBStore, LanceDBStore } from '../../storage/lancedb-store.js';
import {
  initializeSummarizer,
  isSummarizerReady,
  summarizeChunk,
  summarizeFile,
  buildContextualContent
} from '../summarizer.js';
import { analyzeFile as analyzeFileDeps, serializeGraph, loadGraph } from '../graph-builder.js';
import { getRAGDatabase, RAGDatabase, StoredChunk as DBStoredChunk, FileSummary as DBFileSummary, SymbolType } from '../database.js';
import { ProgressCallback, StoredChunk } from './types.js';

const execAsync = promisify(exec);

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
  private ragDb: RAGDatabase;
  private pendingSummaries: Set<string> = new Set();

  constructor(config: Partial<RAGConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.chunker = new Chunker({ maxChunkTokens: this.config.indexing.chunkSize, minChunkTokens: 50 });
    this.embedder = getLMStudioEmbedder();
    this.vectorStore = getLanceDBStore(path.join(this.config.storage.dataPath, 'lance'));
    this.ragDb = getRAGDatabase(this.config.storage.dataPath);
    this.progress = { status: 'idle', totalFiles: 0, processedFiles: 0, currentFile: '', chunksCreated: 0, embeddingsGenerated: 0, eta: 0 };
  }

  onProgress(callback: ProgressCallback): void { this.progressCallback = callback; }
  private emitProgress(): void { if (this.progressCallback) this.progressCallback({ ...this.progress }); }
  cancel(): void { this.isCancelled = true; this.progress.status = 'idle'; this.emitProgress(); }
  getProgress(): IndexProgress { return { ...this.progress }; }

  async indexProject(projectPath: string) {
    // ... Full indexing logic here ...
    // Trigger final code-index sync after full indexing
    await this.triggerCodeIndexSync();
  }

  startWatcher(projectPath: string): void {
    if (!this.config.watcher.enabled) return;
    this.stopWatcher();
    this.fileWatcher = watch(projectPath, { ignored: this.config.indexing.excludePatterns, persistent: true, ignoreInitial: true });

    this.fileWatcher.on('all', (event, filePath) => {
      if (['add', 'change', 'unlink'].includes(event)) {
        this.pendingChanges.add(filePath);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
          const changes = [...this.pendingChanges];
          this.pendingChanges.clear();
          for (const file of changes) await this.indexFile(file, projectPath);
          // Trigger Code Index sync
          await this.triggerCodeIndexSync();
        }, this.config.watcher.debounceMs);
      }
    });
  }

  private async triggerCodeIndexSync(): Promise<void> {
    try {
      console.log('[Indexer] Triggering Code Index sync...');
      const projectRoot = path.resolve(process.cwd(), '../'); // Assuming running from rag-server
      await execAsync('npx tsx database/scripts/analyze-codebase.ts', { cwd: projectRoot });
      console.log('[Indexer] Code Index synced successfully');
    } catch (error: any) {
      console.error('[Indexer] Failed to sync Code Index:', error.message);
    }
  }

  private async indexFile(file: string, projectPath: string) { /* ... */ }
  stopWatcher(): void { if (this.fileWatcher) { this.fileWatcher.close(); this.fileWatcher = null; } }
}