import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ChunkRepository } from './ChunkRepository.js';
import { SymbolRepository } from './SymbolRepository.js';
import { RelationshipRepository } from './RelationshipRepository.js';
import { IndexStatus, IndexMetric } from './types.js';

export class RAGDatabase {
  private db: Database.Database;
  public chunks: ChunkRepository;
  public symbols: SymbolRepository;
  public relationships: RelationshipRepository;

  constructor(dataDir: string = './data') {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'rag.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.chunks = new ChunkRepository(this.db);
    this.symbols = new SymbolRepository(this.db);
    this.relationships = new RelationshipRepository(this.db);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, file_path TEXT, vector_id INTEGER, content TEXT, content_hash TEXT, tokens INTEGER, start_line INTEGER, end_line INTEGER, symbol_name TEXT, symbol_type TEXT, language TEXT, imports TEXT, signature TEXT, summary TEXT, purpose TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS file_summaries (file_path TEXT PRIMARY KEY, summary TEXT, responsibility TEXT, exports TEXT, imports TEXT, chunk_ids TEXT, chunk_count INTEGER, last_updated TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS index_status (id TEXT PRIMARY KEY DEFAULT 'main', project_path TEXT, project_hash TEXT, embedding_model TEXT, embedding_dimensions INTEGER, status TEXT, total_files INTEGER, total_chunks INTEGER, total_vectors INTEGER, storage_size INTEGER, last_indexed TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, files_processed INTEGER, chunks_created INTEGER, embeddings_generated INTEGER, duration_ms INTEGER, timestamp TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, name TEXT, path TEXT UNIQUE, parent_path TEXT, file_count INTEGER, total_lines INTEGER, main_language TEXT, description TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS symbols (id TEXT PRIMARY KEY, name TEXT, qualified_name TEXT, type TEXT, file_path TEXT, start_line INTEGER, end_line INTEGER, signature TEXT, doc_comment TEXT, visibility TEXT, is_exported INTEGER, is_async INTEGER, is_static INTEGER, parent_symbol_id TEXT, chunk_id TEXT, language TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT, source_id TEXT, target_type TEXT, target_id TEXT, relation_type TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS file_dependencies (id INTEGER PRIMARY KEY AUTOINCREMENT, from_file TEXT, to_file TEXT, import_type TEXT, imported_symbols TEXT, is_external INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(from_file, to_file));
    `);
  }

  getIndexStatus(): IndexStatus | null {
    const row = this.db.prepare('SELECT * FROM index_status WHERE id = ?').get('main') as any;
    return row ? { ...row, projectPath: row.project_path, projectHash: row.project_hash, embeddingModel: row.embedding_model, embeddingDimensions: row.embedding_dimensions, totalFiles: row.total_files, totalChunks: row.total_chunks, totalVectors: row.total_vectors, storageSize: row.storage_size, lastIndexed: row.last_indexed, createdAt: row.created_at } : null;
  }

  addMetric(metric: IndexMetric): void {
    this.db.prepare(`INSERT INTO metrics (type, files_processed, chunks_created, embeddings_generated, duration_ms) VALUES (?, ?, ?, ?, ?)`).run(metric.type, metric.filesProcessed, metric.chunksCreated, metric.embeddingsGenerated, metric.durationMs);
  }

  clearAll(): void {
    this.db.exec('DELETE FROM chunks; DELETE FROM file_summaries; DELETE FROM metrics; DELETE FROM index_status; DELETE FROM modules; DELETE FROM symbols; DELETE FROM relationships; DELETE FROM file_dependencies;');
  }

  close(): void { this.db.close(); }
}

let ragDb: RAGDatabase | null = null;
export function getRAGDatabase(dataDir?: string): RAGDatabase {
  if (!ragDb) ragDb = new RAGDatabase(dataDir);
  return ragDb;
}
