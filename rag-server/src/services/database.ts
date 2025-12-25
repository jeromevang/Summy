/**
 * RAG Server SQLite Database
 * 
 * Provides persistent storage for:
 * - Chunk metadata (content, symbols, summaries)
 * - File summaries
 * - 2D projections for visualization
 * - Indexing metrics
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Types
export interface StoredChunk {
  id: string;
  filePath: string;
  vectorId: number;
  content: string;
  contentHash: string;
  tokens: number;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  symbolType: string | null;
  language: string;
  imports: string[];
  signature: string | null;
  summary: string | null;
  purpose: string | null;
  createdAt: string;
}

export interface FileSummary {
  filePath: string;
  summary: string;
  responsibility: string;
  exports: string[];
  imports: { from: string; names: string[]; isExternal: boolean }[];
  chunkIds: string[];
  chunkCount: number;
  lastUpdated: string;
}

export interface ChunkProjection {
  chunkId: string;
  x: number;
  y: number;
  computedAt: string;
}

export interface IndexMetric {
  id?: number;
  type: string;
  filesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  durationMs: number;
  timestamp?: string;
}

export interface IndexStatus {
  id: string;
  projectPath: string;
  projectHash: string;
  embeddingModel: string;
  embeddingDimensions: number;
  status: 'idle' | 'indexing' | 'ready' | 'error';
  totalFiles: number;
  totalChunks: number;
  totalVectors: number;
  storageSize: number;
  lastIndexed: string | null;
  createdAt: string;
}

class RAGDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dataDir: string = './data') {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, 'rag.db');
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
    
    // Initialize schema
    this.initSchema();
    
    console.log(`[RAG DB] Initialized at ${this.dbPath}`);
  }

  private initSchema(): void {
    this.db.exec(`
      -- Chunks table (full metadata)
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        vector_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        start_line INTEGER DEFAULT 0,
        end_line INTEGER DEFAULT 0,
        symbol_name TEXT,
        symbol_type TEXT,
        language TEXT,
        imports TEXT,
        signature TEXT,
        summary TEXT,
        purpose TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_vector ON chunks(vector_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_symbol ON chunks(symbol_name);
      CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(symbol_type);

      -- File summaries table
      CREATE TABLE IF NOT EXISTS file_summaries (
        file_path TEXT PRIMARY KEY,
        summary TEXT,
        responsibility TEXT,
        exports TEXT,
        imports TEXT,
        chunk_ids TEXT,
        chunk_count INTEGER DEFAULT 0,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- 2D projections for visualization
      CREATE TABLE IF NOT EXISTS projections (
        chunk_id TEXT PRIMARY KEY,
        x REAL NOT NULL,
        y REAL NOT NULL,
        computed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Index status
      CREATE TABLE IF NOT EXISTS index_status (
        id TEXT PRIMARY KEY DEFAULT 'main',
        project_path TEXT,
        project_hash TEXT,
        embedding_model TEXT,
        embedding_dimensions INTEGER,
        status TEXT DEFAULT 'idle',
        total_files INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        total_vectors INTEGER DEFAULT 0,
        storage_size INTEGER DEFAULT 0,
        last_indexed TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Metrics/history
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        files_processed INTEGER DEFAULT 0,
        chunks_created INTEGER DEFAULT 0,
        embeddings_generated INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
    `);
  }

  // ============================================================
  // CHUNKS
  // ============================================================

  addChunk(chunk: StoredChunk): void {
    this.db.prepare(`
      INSERT INTO chunks 
      (id, file_path, vector_id, content, content_hash, tokens, start_line, end_line, 
       symbol_name, symbol_type, language, imports, signature, summary, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        vector_id = excluded.vector_id,
        content = excluded.content,
        content_hash = excluded.content_hash,
        tokens = excluded.tokens,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        symbol_name = excluded.symbol_name,
        symbol_type = excluded.symbol_type,
        language = excluded.language,
        imports = excluded.imports,
        signature = excluded.signature,
        summary = excluded.summary,
        purpose = excluded.purpose
    `).run(
      chunk.id,
      chunk.filePath,
      chunk.vectorId,
      chunk.content,
      chunk.contentHash,
      chunk.tokens,
      chunk.startLine,
      chunk.endLine,
      chunk.symbolName,
      chunk.symbolType,
      chunk.language,
      JSON.stringify(chunk.imports || []),
      chunk.signature,
      chunk.summary,
      chunk.purpose,
      chunk.createdAt
    );
  }

  getChunk(id: string): StoredChunk | null {
    const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToChunk(row);
  }

  getChunkByVectorId(vectorId: number): StoredChunk | null {
    const row = this.db.prepare('SELECT * FROM chunks WHERE vector_id = ?').get(vectorId) as any;
    if (!row) return null;
    return this.rowToChunk(row);
  }

  getChunks(options: {
    page?: number;
    limit?: number;
    fileType?: string;
    symbolType?: string;
    search?: string;
  } = {}): { chunks: StoredChunk[]; total: number } {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (options.fileType) {
      conditions.push('file_path LIKE ?');
      params.push(`%.${options.fileType}`);
    }

    if (options.symbolType) {
      conditions.push('symbol_type = ?');
      params.push(options.symbolType);
    }

    if (options.search) {
      conditions.push('(symbol_name LIKE ? OR content LIKE ? OR file_path LIKE ?)');
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM chunks WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(`
      SELECT * FROM chunks 
      WHERE ${whereClause}
      ORDER BY file_path, start_line
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    return {
      chunks: rows.map(r => this.rowToChunk(r)),
      total: countRow?.count || 0
    };
  }

  getChunksByFile(filePath: string): StoredChunk[] {
    const rows = this.db.prepare(
      'SELECT * FROM chunks WHERE file_path = ? ORDER BY start_line'
    ).all(filePath) as any[];
    return rows.map(r => this.rowToChunk(r));
  }

  deleteChunksByFile(filePath: string): number {
    const result = this.db.prepare('DELETE FROM chunks WHERE file_path = ?').run(filePath);
    return result.changes;
  }

  clearAllChunks(): number {
    const result = this.db.prepare('DELETE FROM chunks').run();
    return result.changes;
  }

  getChunkCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any;
    return row?.count || 0;
  }

  private rowToChunk(row: any): StoredChunk {
    return {
      id: row.id,
      filePath: row.file_path,
      vectorId: row.vector_id,
      content: row.content,
      contentHash: row.content_hash,
      tokens: row.tokens,
      startLine: row.start_line,
      endLine: row.end_line,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      language: row.language,
      imports: JSON.parse(row.imports || '[]'),
      signature: row.signature,
      summary: row.summary,
      purpose: row.purpose,
      createdAt: row.created_at
    };
  }

  // ============================================================
  // FILE SUMMARIES
  // ============================================================

  addFileSummary(summary: FileSummary): void {
    this.db.prepare(`
      INSERT INTO file_summaries 
      (file_path, summary, responsibility, exports, imports, chunk_ids, chunk_count, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        summary = excluded.summary,
        responsibility = excluded.responsibility,
        exports = excluded.exports,
        imports = excluded.imports,
        chunk_ids = excluded.chunk_ids,
        chunk_count = excluded.chunk_count,
        last_updated = excluded.last_updated
    `).run(
      summary.filePath,
      summary.summary,
      summary.responsibility,
      JSON.stringify(summary.exports || []),
      JSON.stringify(summary.imports || []),
      JSON.stringify(summary.chunkIds || []),
      summary.chunkCount,
      summary.lastUpdated
    );
  }

  getFileSummary(filePath: string): FileSummary | null {
    const row = this.db.prepare('SELECT * FROM file_summaries WHERE file_path = ?').get(filePath) as any;
    if (!row) return null;
    return this.rowToFileSummary(row);
  }

  getAllFileSummaries(): FileSummary[] {
    const rows = this.db.prepare('SELECT * FROM file_summaries ORDER BY file_path').all() as any[];
    return rows.map(r => this.rowToFileSummary(r));
  }

  searchFileSummaries(query: string): FileSummary[] {
    const pattern = `%${query.toLowerCase()}%`;
    const rows = this.db.prepare(`
      SELECT * FROM file_summaries 
      WHERE LOWER(summary) LIKE ? OR LOWER(responsibility) LIKE ? OR LOWER(file_path) LIKE ?
      ORDER BY file_path
    `).all(pattern, pattern, pattern) as any[];
    return rows.map(r => this.rowToFileSummary(r));
  }

  deleteFileSummary(filePath: string): boolean {
    const result = this.db.prepare('DELETE FROM file_summaries WHERE file_path = ?').run(filePath);
    return result.changes > 0;
  }

  clearAllFileSummaries(): number {
    const result = this.db.prepare('DELETE FROM file_summaries').run();
    return result.changes;
  }

  private rowToFileSummary(row: any): FileSummary {
    return {
      filePath: row.file_path,
      summary: row.summary,
      responsibility: row.responsibility,
      exports: JSON.parse(row.exports || '[]'),
      imports: JSON.parse(row.imports || '[]'),
      chunkIds: JSON.parse(row.chunk_ids || '[]'),
      chunkCount: row.chunk_count,
      lastUpdated: row.last_updated
    };
  }

  // ============================================================
  // PROJECTIONS (2D Visualization)
  // ============================================================

  saveProjection(projection: ChunkProjection): void {
    this.db.prepare(`
      INSERT INTO projections (chunk_id, x, y, computed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        x = excluded.x,
        y = excluded.y,
        computed_at = excluded.computed_at
    `).run(projection.chunkId, projection.x, projection.y, projection.computedAt);
  }

  saveProjections(projections: ChunkProjection[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO projections (chunk_id, x, y, computed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        x = excluded.x,
        y = excluded.y,
        computed_at = excluded.computed_at
    `);

    const insertMany = this.db.transaction((items: ChunkProjection[]) => {
      for (const p of items) {
        stmt.run(p.chunkId, p.x, p.y, p.computedAt);
      }
    });

    insertMany(projections);
  }

  getProjections(): Array<ChunkProjection & { filePath: string; symbolName: string | null; symbolType: string | null; language: string }> {
    const rows = this.db.prepare(`
      SELECT p.chunk_id, p.x, p.y, p.computed_at,
             c.file_path, c.symbol_name, c.symbol_type, c.language
      FROM projections p
      JOIN chunks c ON p.chunk_id = c.id
    `).all() as any[];

    return rows.map(row => ({
      chunkId: row.chunk_id,
      x: row.x,
      y: row.y,
      computedAt: row.computed_at,
      filePath: row.file_path,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      language: row.language
    }));
  }

  clearProjections(): number {
    const result = this.db.prepare('DELETE FROM projections').run();
    return result.changes;
  }

  // ============================================================
  // INDEX STATUS
  // ============================================================

  getIndexStatus(): IndexStatus | null {
    const row = this.db.prepare('SELECT * FROM index_status WHERE id = ?').get('main') as any;
    if (!row) return null;
    return {
      id: row.id,
      projectPath: row.project_path,
      projectHash: row.project_hash,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      status: row.status,
      totalFiles: row.total_files,
      totalChunks: row.total_chunks,
      totalVectors: row.total_vectors,
      storageSize: row.storage_size,
      lastIndexed: row.last_indexed,
      createdAt: row.created_at
    };
  }

  upsertIndexStatus(status: Partial<IndexStatus>): void {
    const existing = this.getIndexStatus();
    
    if (existing) {
      const updates: string[] = [];
      const params: any[] = [];
      
      if (status.projectPath !== undefined) { updates.push('project_path = ?'); params.push(status.projectPath); }
      if (status.projectHash !== undefined) { updates.push('project_hash = ?'); params.push(status.projectHash); }
      if (status.embeddingModel !== undefined) { updates.push('embedding_model = ?'); params.push(status.embeddingModel); }
      if (status.embeddingDimensions !== undefined) { updates.push('embedding_dimensions = ?'); params.push(status.embeddingDimensions); }
      if (status.status !== undefined) { updates.push('status = ?'); params.push(status.status); }
      if (status.totalFiles !== undefined) { updates.push('total_files = ?'); params.push(status.totalFiles); }
      if (status.totalChunks !== undefined) { updates.push('total_chunks = ?'); params.push(status.totalChunks); }
      if (status.totalVectors !== undefined) { updates.push('total_vectors = ?'); params.push(status.totalVectors); }
      if (status.storageSize !== undefined) { updates.push('storage_size = ?'); params.push(status.storageSize); }
      if (status.lastIndexed !== undefined) { updates.push('last_indexed = ?'); params.push(status.lastIndexed); }
      
      if (updates.length > 0) {
        params.push('main');
        this.db.prepare(`UPDATE index_status SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    } else {
      this.db.prepare(`
        INSERT INTO index_status (id, project_path, project_hash, embedding_model, embedding_dimensions, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'main',
        status.projectPath || '',
        status.projectHash || '',
        status.embeddingModel || '',
        status.embeddingDimensions || 0,
        status.status || 'idle'
      );
    }
  }

  // ============================================================
  // METRICS
  // ============================================================

  addMetric(metric: IndexMetric): void {
    this.db.prepare(`
      INSERT INTO metrics (type, files_processed, chunks_created, embeddings_generated, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      metric.type,
      metric.filesProcessed,
      metric.chunksCreated,
      metric.embeddingsGenerated,
      metric.durationMs
    );
  }

  getMetrics(limit: number = 100): IndexMetric[] {
    const rows = this.db.prepare(`
      SELECT * FROM metrics ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      filesProcessed: row.files_processed,
      chunksCreated: row.chunks_created,
      embeddingsGenerated: row.embeddings_generated,
      durationMs: row.duration_ms,
      timestamp: row.timestamp
    }));
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  clearAll(): void {
    this.db.exec(`
      DELETE FROM chunks;
      DELETE FROM file_summaries;
      DELETE FROM projections;
      DELETE FROM metrics;
      DELETE FROM index_status;
    `);
    console.log('[RAG DB] Cleared all data');
  }

  close(): void {
    this.db.close();
    console.log('[RAG DB] Closed');
  }

  getStats(): { chunks: number; files: number; projections: number } {
    const chunks = (this.db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any)?.c || 0;
    const files = (this.db.prepare('SELECT COUNT(*) as c FROM file_summaries').get() as any)?.c || 0;
    const projections = (this.db.prepare('SELECT COUNT(*) as c FROM projections').get() as any)?.c || 0;
    return { chunks, files, projections };
  }
}

// Singleton instance
let ragDb: RAGDatabase | null = null;

export function getRAGDatabase(dataDir?: string): RAGDatabase {
  if (!ragDb) {
    ragDb = new RAGDatabase(dataDir);
  }
  return ragDb;
}

export function closeRAGDatabase(): void {
  if (ragDb) {
    ragDb.close();
    ragDb = null;
  }
}

export { RAGDatabase };






