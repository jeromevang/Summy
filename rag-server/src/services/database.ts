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

// ============================================================
// CODE-AWARE TYPES
// ============================================================

export type SymbolType = 
  | 'function' | 'class' | 'interface' | 'type' | 'enum' 
  | 'variable' | 'constant' | 'method' | 'property' | 'constructor'
  | 'module' | 'namespace' | 'export' | 'import';

export type RelationType = 
  | 'imports' | 'exports' | 'calls' | 'extends' | 'implements'
  | 'uses' | 'defines' | 'contains' | 'references' | 'depends_on';

export interface CodeModule {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  fileCount: number;
  totalLines: number;
  mainLanguage: string | null;
  description: string | null;
  createdAt: string;
}

export interface CodeSymbol {
  id: string;
  name: string;
  qualifiedName: string | null;
  type: SymbolType;
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  docComment: string | null;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  isExported: boolean;
  isAsync: boolean;
  isStatic: boolean;
  parentSymbolId: string | null;
  chunkId: string | null;
  language: string | null;
  createdAt: string;
}

export interface CodeRelationship {
  id: number;
  sourceType: 'file' | 'symbol' | 'module';
  sourceId: string;
  targetType: 'file' | 'symbol' | 'module';
  targetId: string;
  relationType: RelationType;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface FileDependency {
  id: number;
  fromFile: string;
  toFile: string;
  importType: 'import' | 'require' | 'dynamic';
  importedSymbols: string[];
  isExternal: boolean;
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

      -- ============================================================
      -- CODE-AWARE TABLES (Symbols, Modules, Relationships)
      -- ============================================================

      -- Modules (directories with code files)
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT UNIQUE NOT NULL,
        parent_path TEXT,
        file_count INTEGER DEFAULT 0,
        total_lines INTEGER DEFAULT 0,
        main_language TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_modules_parent ON modules(parent_path);
      CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name);

      -- Symbols (functions, classes, interfaces, types, variables)
      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        qualified_name TEXT,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        signature TEXT,
        doc_comment TEXT,
        visibility TEXT DEFAULT 'public',
        is_exported INTEGER DEFAULT 0,
        is_async INTEGER DEFAULT 0,
        is_static INTEGER DEFAULT 0,
        parent_symbol_id TEXT,
        chunk_id TEXT,
        language TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_symbol_id) REFERENCES symbols(id),
        FOREIGN KEY (chunk_id) REFERENCES chunks(id)
      );
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_parent ON symbols(parent_symbol_id);
      CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(is_exported);

      -- Relationships between code entities
      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relation_type);

      -- File dependencies (imports/exports at file level)
      CREATE TABLE IF NOT EXISTS file_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_file TEXT NOT NULL,
        to_file TEXT NOT NULL,
        import_type TEXT DEFAULT 'import',
        imported_symbols TEXT,
        is_external INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_file, to_file)
      );
      CREATE INDEX IF NOT EXISTS idx_deps_from ON file_dependencies(from_file);
      CREATE INDEX IF NOT EXISTS idx_deps_to ON file_dependencies(to_file);
      CREATE INDEX IF NOT EXISTS idx_deps_external ON file_dependencies(is_external);
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
  // MODULES
  // ============================================================

  addModule(module: Omit<CodeModule, 'createdAt'>): void {
    this.db.prepare(`
      INSERT INTO modules (id, name, path, parent_path, file_count, total_lines, main_language, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        parent_path = excluded.parent_path,
        file_count = excluded.file_count,
        total_lines = excluded.total_lines,
        main_language = excluded.main_language,
        description = excluded.description
    `).run(
      module.id, module.name, module.path, module.parentPath,
      module.fileCount, module.totalLines, module.mainLanguage, module.description
    );
  }

  getModule(path: string): CodeModule | null {
    const row = this.db.prepare('SELECT * FROM modules WHERE path = ?').get(path) as any;
    if (!row) return null;
    return this.rowToModule(row);
  }

  getModulesByParent(parentPath: string | null): CodeModule[] {
    const rows = parentPath
      ? this.db.prepare('SELECT * FROM modules WHERE parent_path = ?').all(parentPath) as any[]
      : this.db.prepare('SELECT * FROM modules WHERE parent_path IS NULL').all() as any[];
    return rows.map(r => this.rowToModule(r));
  }

  getAllModules(): CodeModule[] {
    const rows = this.db.prepare('SELECT * FROM modules ORDER BY path').all() as any[];
    return rows.map(r => this.rowToModule(r));
  }

  private rowToModule(row: any): CodeModule {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      parentPath: row.parent_path,
      fileCount: row.file_count,
      totalLines: row.total_lines,
      mainLanguage: row.main_language,
      description: row.description,
      createdAt: row.created_at
    };
  }

  // ============================================================
  // SYMBOLS
  // ============================================================

  addSymbol(symbol: Omit<CodeSymbol, 'createdAt'>): void {
    this.db.prepare(`
      INSERT INTO symbols 
      (id, name, qualified_name, type, file_path, start_line, end_line, signature, doc_comment,
       visibility, is_exported, is_async, is_static, parent_symbol_id, chunk_id, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        qualified_name = excluded.qualified_name,
        type = excluded.type,
        file_path = excluded.file_path,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        signature = excluded.signature,
        doc_comment = excluded.doc_comment,
        visibility = excluded.visibility,
        is_exported = excluded.is_exported,
        is_async = excluded.is_async,
        is_static = excluded.is_static,
        parent_symbol_id = excluded.parent_symbol_id,
        chunk_id = excluded.chunk_id,
        language = excluded.language
    `).run(
      symbol.id, symbol.name, symbol.qualifiedName, symbol.type, symbol.filePath,
      symbol.startLine, symbol.endLine, symbol.signature, symbol.docComment,
      symbol.visibility, symbol.isExported ? 1 : 0, symbol.isAsync ? 1 : 0, symbol.isStatic ? 1 : 0,
      symbol.parentSymbolId, symbol.chunkId, symbol.language
    );
  }

  addSymbols(symbols: Omit<CodeSymbol, 'createdAt'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO symbols 
      (id, name, qualified_name, type, file_path, start_line, end_line, signature, doc_comment,
       visibility, is_exported, is_async, is_static, parent_symbol_id, chunk_id, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, qualified_name = excluded.qualified_name, type = excluded.type,
        file_path = excluded.file_path, start_line = excluded.start_line, end_line = excluded.end_line,
        signature = excluded.signature, doc_comment = excluded.doc_comment, visibility = excluded.visibility,
        is_exported = excluded.is_exported, is_async = excluded.is_async, is_static = excluded.is_static,
        parent_symbol_id = excluded.parent_symbol_id, chunk_id = excluded.chunk_id, language = excluded.language
    `);
    
    const insertMany = this.db.transaction((items: Omit<CodeSymbol, 'createdAt'>[]) => {
      for (const s of items) {
        stmt.run(s.id, s.name, s.qualifiedName, s.type, s.filePath, s.startLine, s.endLine,
                 s.signature, s.docComment, s.visibility, s.isExported ? 1 : 0, s.isAsync ? 1 : 0,
                 s.isStatic ? 1 : 0, s.parentSymbolId, s.chunkId, s.language);
      }
    });
    insertMany(symbols);
  }

  getSymbol(id: string): CodeSymbol | null {
    const row = this.db.prepare('SELECT * FROM symbols WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToSymbol(row);
  }

  getSymbolsByFile(filePath: string): CodeSymbol[] {
    const rows = this.db.prepare('SELECT * FROM symbols WHERE file_path = ? ORDER BY start_line').all(filePath) as any[];
    return rows.map(r => this.rowToSymbol(r));
  }

  getSymbolsByType(type: SymbolType): CodeSymbol[] {
    const rows = this.db.prepare('SELECT * FROM symbols WHERE type = ?').all(type) as any[];
    return rows.map(r => this.rowToSymbol(r));
  }

  searchSymbols(query: string, options?: { type?: SymbolType; exported?: boolean; limit?: number }): CodeSymbol[] {
    let sql = 'SELECT * FROM symbols WHERE name LIKE ?';
    const params: any[] = [`%${query}%`];
    
    if (options?.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    if (options?.exported !== undefined) {
      sql += ' AND is_exported = ?';
      params.push(options.exported ? 1 : 0);
    }
    
    sql += ' ORDER BY name';
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToSymbol(r));
  }

  getExportedSymbols(filePath: string): CodeSymbol[] {
    const rows = this.db.prepare(
      'SELECT * FROM symbols WHERE file_path = ? AND is_exported = 1 ORDER BY name'
    ).all(filePath) as any[];
    return rows.map(r => this.rowToSymbol(r));
  }

  deleteSymbolsByFile(filePath: string): number {
    const result = this.db.prepare('DELETE FROM symbols WHERE file_path = ?').run(filePath);
    return result.changes;
  }

  private rowToSymbol(row: any): CodeSymbol {
    return {
      id: row.id,
      name: row.name,
      qualifiedName: row.qualified_name,
      type: row.type,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      signature: row.signature,
      docComment: row.doc_comment,
      visibility: row.visibility || 'public',
      isExported: row.is_exported === 1,
      isAsync: row.is_async === 1,
      isStatic: row.is_static === 1,
      parentSymbolId: row.parent_symbol_id,
      chunkId: row.chunk_id,
      language: row.language,
      createdAt: row.created_at
    };
  }

  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  addRelationship(rel: Omit<CodeRelationship, 'id' | 'createdAt'>): number {
    const result = this.db.prepare(`
      INSERT INTO relationships (source_type, source_id, target_type, target_id, relation_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(rel.sourceType, rel.sourceId, rel.targetType, rel.targetId, rel.relationType, 
           rel.metadata ? JSON.stringify(rel.metadata) : null);
    return Number(result.lastInsertRowid);
  }

  addRelationships(rels: Omit<CodeRelationship, 'id' | 'createdAt'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO relationships (source_type, source_id, target_type, target_id, relation_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const insertMany = this.db.transaction((items: Omit<CodeRelationship, 'id' | 'createdAt'>[]) => {
      for (const r of items) {
        stmt.run(r.sourceType, r.sourceId, r.targetType, r.targetId, r.relationType,
                 r.metadata ? JSON.stringify(r.metadata) : null);
      }
    });
    insertMany(rels);
  }

  getRelationshipsFrom(sourceType: string, sourceId: string): CodeRelationship[] {
    const rows = this.db.prepare(
      'SELECT * FROM relationships WHERE source_type = ? AND source_id = ?'
    ).all(sourceType, sourceId) as any[];
    return rows.map(r => this.rowToRelationship(r));
  }

  getRelationshipsTo(targetType: string, targetId: string): CodeRelationship[] {
    const rows = this.db.prepare(
      'SELECT * FROM relationships WHERE target_type = ? AND target_id = ?'
    ).all(targetType, targetId) as any[];
    return rows.map(r => this.rowToRelationship(r));
  }

  getRelationshipsByType(relationType: RelationType): CodeRelationship[] {
    const rows = this.db.prepare('SELECT * FROM relationships WHERE relation_type = ?').all(relationType) as any[];
    return rows.map(r => this.rowToRelationship(r));
  }

  clearRelationshipsForFile(filePath: string): number {
    // Clear relationships where the source or target is a symbol from this file
    const result = this.db.prepare(`
      DELETE FROM relationships 
      WHERE (source_type = 'file' AND source_id = ?)
         OR (target_type = 'file' AND target_id = ?)
         OR source_id IN (SELECT id FROM symbols WHERE file_path = ?)
         OR target_id IN (SELECT id FROM symbols WHERE file_path = ?)
    `).run(filePath, filePath, filePath, filePath);
    return result.changes;
  }

  private rowToRelationship(row: any): CodeRelationship {
    return {
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      targetType: row.target_type,
      targetId: row.target_id,
      relationType: row.relation_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at
    };
  }

  // ============================================================
  // FILE DEPENDENCIES
  // ============================================================

  addFileDependency(dep: Omit<FileDependency, 'id' | 'createdAt'>): void {
    this.db.prepare(`
      INSERT INTO file_dependencies (from_file, to_file, import_type, imported_symbols, is_external)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(from_file, to_file) DO UPDATE SET
        import_type = excluded.import_type,
        imported_symbols = excluded.imported_symbols,
        is_external = excluded.is_external
    `).run(dep.fromFile, dep.toFile, dep.importType, JSON.stringify(dep.importedSymbols), dep.isExternal ? 1 : 0);
  }

  addFileDependencies(deps: Omit<FileDependency, 'id' | 'createdAt'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_dependencies (from_file, to_file, import_type, imported_symbols, is_external)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(from_file, to_file) DO UPDATE SET
        import_type = excluded.import_type,
        imported_symbols = excluded.imported_symbols,
        is_external = excluded.is_external
    `);
    
    const insertMany = this.db.transaction((items: Omit<FileDependency, 'id' | 'createdAt'>[]) => {
      for (const d of items) {
        stmt.run(d.fromFile, d.toFile, d.importType, JSON.stringify(d.importedSymbols), d.isExternal ? 1 : 0);
      }
    });
    insertMany(deps);
  }

  getFileDependencies(fromFile: string): FileDependency[] {
    const rows = this.db.prepare('SELECT * FROM file_dependencies WHERE from_file = ?').all(fromFile) as any[];
    return rows.map(r => this.rowToFileDependency(r));
  }

  getFileDependents(toFile: string): FileDependency[] {
    const rows = this.db.prepare('SELECT * FROM file_dependencies WHERE to_file = ?').all(toFile) as any[];
    return rows.map(r => this.rowToFileDependency(r));
  }

  getInternalDependencies(): FileDependency[] {
    const rows = this.db.prepare('SELECT * FROM file_dependencies WHERE is_external = 0').all() as any[];
    return rows.map(r => this.rowToFileDependency(r));
  }

  deleteFileDependencies(filePath: string): number {
    const result = this.db.prepare('DELETE FROM file_dependencies WHERE from_file = ?').run(filePath);
    return result.changes;
  }

  private rowToFileDependency(row: any): FileDependency {
    return {
      id: row.id,
      fromFile: row.from_file,
      toFile: row.to_file,
      importType: row.import_type || 'import',
      importedSymbols: JSON.parse(row.imported_symbols || '[]'),
      isExternal: row.is_external === 1,
      createdAt: row.created_at
    };
  }

  // ============================================================
  // CODE GRAPH QUERIES
  // ============================================================

  /**
   * Get the call graph for a function (who calls it, what it calls)
   */
  getCallGraph(symbolId: string): { callers: CodeSymbol[]; callees: CodeSymbol[] } {
    const callersRels = this.getRelationshipsTo('symbol', symbolId).filter(r => r.relationType === 'calls');
    const calleesRels = this.getRelationshipsFrom('symbol', symbolId).filter(r => r.relationType === 'calls');
    
    const callers = callersRels.map(r => this.getSymbol(r.sourceId)).filter((s): s is CodeSymbol => s !== null);
    const callees = calleesRels.map(r => this.getSymbol(r.targetId)).filter((s): s is CodeSymbol => s !== null);
    
    return { callers, callees };
  }

  /**
   * Get symbols that a file exports and imports
   */
  getFileInterface(filePath: string): { exports: CodeSymbol[]; imports: { from: string; symbols: string[] }[] } {
    const exports = this.getExportedSymbols(filePath);
    const deps = this.getFileDependencies(filePath);
    const imports = deps.map(d => ({ from: d.toFile, symbols: d.importedSymbols }));
    return { exports, imports };
  }

  /**
   * Get code statistics
   */
  getCodeStats(): { 
    modules: number; 
    symbols: number; 
    functions: number; 
    classes: number;
    relationships: number;
    dependencies: number;
  } {
    const modules = (this.db.prepare('SELECT COUNT(*) as c FROM modules').get() as any)?.c || 0;
    const symbols = (this.db.prepare('SELECT COUNT(*) as c FROM symbols').get() as any)?.c || 0;
    const functions = (this.db.prepare("SELECT COUNT(*) as c FROM symbols WHERE type = 'function' OR type = 'method'").get() as any)?.c || 0;
    const classes = (this.db.prepare("SELECT COUNT(*) as c FROM symbols WHERE type = 'class'").get() as any)?.c || 0;
    const relationships = (this.db.prepare('SELECT COUNT(*) as c FROM relationships').get() as any)?.c || 0;
    const dependencies = (this.db.prepare('SELECT COUNT(*) as c FROM file_dependencies').get() as any)?.c || 0;
    
    return { modules, symbols, functions, classes, relationships, dependencies };
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
      DELETE FROM modules;
      DELETE FROM symbols;
      DELETE FROM relationships;
      DELETE FROM file_dependencies;
    `);
    console.log('[RAG DB] Cleared all data');
  }

  close(): void {
    this.db.close();
    console.log('[RAG DB] Closed');
  }

  getStats(): { 
    chunks: number; 
    files: number; 
    projections: number;
    modules: number;
    symbols: number;
    relationships: number;
    dependencies: number;
  } {
    const chunks = (this.db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any)?.c || 0;
    const files = (this.db.prepare('SELECT COUNT(*) as c FROM file_summaries').get() as any)?.c || 0;
    const projections = (this.db.prepare('SELECT COUNT(*) as c FROM projections').get() as any)?.c || 0;
    const modules = (this.db.prepare('SELECT COUNT(*) as c FROM modules').get() as any)?.c || 0;
    const symbols = (this.db.prepare('SELECT COUNT(*) as c FROM symbols').get() as any)?.c || 0;
    const relationships = (this.db.prepare('SELECT COUNT(*) as c FROM relationships').get() as any)?.c || 0;
    const dependencies = (this.db.prepare('SELECT COUNT(*) as c FROM file_dependencies').get() as any)?.c || 0;
    return { chunks, files, projections, modules, symbols, relationships, dependencies };
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






