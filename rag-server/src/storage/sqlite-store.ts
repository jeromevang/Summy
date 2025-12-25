/**
 * SQLite Vector Store
 * 
 * SQLite-based vector storage - no JSON files, no corruption issues.
 * Uses better-sqlite3 for fast, synchronous SQLite operations.
 * 
 * Features:
 * - ACID-compliant transactions
 * - No JSON corruption issues
 * - Stores vectors as efficient BLOBs
 * - Fast cosine similarity search
 * - Project-independent (just point to any SQLite database)
 */

import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { VectorStore, VectorSearchResult } from './base.js';

// Chunk metadata stored with vectors
export interface ChunkMetadata {
  content?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
  symbolType?: string;
  language?: string;
  signature?: string;
  summary?: string;
  purpose?: string;
  isSummaryVector?: boolean;
  originalChunkId?: string;
}

const SCHEMA = `
-- Vector storage table
CREATE TABLE IF NOT EXISTS vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id TEXT UNIQUE NOT NULL,
  vector BLOB NOT NULL,
  dimensions INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vectors_chunk_id ON vectors(chunk_id);

-- Store metadata
CREATE TABLE IF NOT EXISTS store_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export class SQLiteVectorStore implements VectorStore {
  name = 'sqlite';
  dimensions = 0;
  size = 0;
  isReady = false;
  
  private db: Database.Database | null = null;
  private dbPath: string;
  private vectorCache: Map<number, number[]> = new Map(); // Cache for search performance
  private cacheLoaded = false;
  
  constructor(dbPath: string = './data/indices/vectors.db') {
    this.dbPath = dbPath;
  }
  
  /**
   * Convert float array to Buffer for efficient BLOB storage
   */
  private vectorToBlob(vector: number[]): Buffer {
    const buffer = Buffer.alloc(vector.length * 4); // 4 bytes per float32
    for (let i = 0; i < vector.length; i++) {
      buffer.writeFloatLE(vector[i], i * 4);
    }
    return buffer;
  }
  
  /**
   * Convert BLOB back to float array
   */
  private blobToVector(blob: Buffer): number[] {
    const vector: number[] = [];
    for (let i = 0; i < blob.length; i += 4) {
      vector.push(blob.readFloatLE(i));
    }
    return vector;
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    
    return dotProduct / denominator;
  }
  
  /**
   * Load all vectors into cache for fast search
   */
  private loadVectorCache(): void {
    if (!this.db || this.cacheLoaded) return;
    
    const rows = this.db.prepare('SELECT id, vector FROM vectors').all() as { id: number; vector: Buffer }[];
    this.vectorCache.clear();
    
    for (const row of rows) {
      this.vectorCache.set(row.id, this.blobToVector(row.vector));
    }
    
    this.cacheLoaded = true;
    console.log(`[SQLiteVectorStore] Loaded ${this.vectorCache.size} vectors into cache`);
  }
  
  /**
   * Initialize the store
   */
  async initialize(dimensions: number, maxElements?: number): Promise<void> {
    this.dimensions = dimensions;
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Open database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
    
    // Save dimensions
    this.db.prepare('INSERT OR REPLACE INTO store_meta (key, value) VALUES (?, ?)').run('dimensions', String(dimensions));
    
    // Get current size
    const result = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    this.size = result.count;
    
    this.isReady = true;
    console.log(`[SQLiteVectorStore] Initialized at ${this.dbPath} (${this.size} vectors, ${dimensions}D)`);
  }
  
  /**
   * Add a vector to the store
   */
  async add(vector: number[], chunkId: string, metadata?: Partial<ChunkMetadata>): Promise<number> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    // Update dimensions on first vector if not set
    if (this.dimensions === 0) {
      this.dimensions = vector.length;
      this.db.prepare('INSERT OR REPLACE INTO store_meta (key, value) VALUES (?, ?)').run('dimensions', String(this.dimensions));
    }
    
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
    }
    
    const blob = this.vectorToBlob(vector);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    
    // Upsert: insert or replace if chunk_id exists
    const stmt = this.db.prepare(`
      INSERT INTO vectors (chunk_id, vector, dimensions, metadata)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        vector = excluded.vector,
        dimensions = excluded.dimensions,
        metadata = excluded.metadata,
        created_at = CURRENT_TIMESTAMP
    `);
    
    const result = stmt.run(chunkId, blob, this.dimensions, metadataJson);
    const vectorId = Number(result.lastInsertRowid);
    
    // Update cache
    this.vectorCache.set(vectorId, vector);
    
    // Update size
    const countResult = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    this.size = countResult.count;
    
    return vectorId;
  }
  
  /**
   * Add multiple vectors in batch
   */
  async addBatch(vectors: number[][], chunkIds: string[], metadataList?: Partial<ChunkMetadata>[]): Promise<number[]> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    if (vectors.length !== chunkIds.length) {
      throw new Error('Vectors and chunkIds arrays must have same length');
    }
    
    const ids: number[] = [];
    
    // Use transaction for batch insert
    const insertStmt = this.db.prepare(`
      INSERT INTO vectors (chunk_id, vector, dimensions, metadata)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        vector = excluded.vector,
        dimensions = excluded.dimensions,
        metadata = excluded.metadata,
        created_at = CURRENT_TIMESTAMP
    `);
    
    const transaction = this.db.transaction(() => {
      for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i];
        const chunkId = chunkIds[i];
        const metadata = metadataList?.[i];
        
        if (this.dimensions === 0) {
          this.dimensions = vector.length;
        }
        
        const blob = this.vectorToBlob(vector);
        const metadataJson = metadata ? JSON.stringify(metadata) : null;
        
        const result = insertStmt.run(chunkId, blob, this.dimensions, metadataJson);
        const vectorId = Number(result.lastInsertRowid);
        ids.push(vectorId);
        
        // Update cache
        this.vectorCache.set(vectorId, vector);
      }
    });
    
    transaction();
    
    // Update size
    const countResult = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    this.size = countResult.count;
    
    return ids;
  }
  
  /**
   * Search for similar vectors using cosine similarity
   */
  async search(queryVector: number[], k: number): Promise<VectorSearchResult[]> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    if (this.size === 0) {
      return [];
    }
    
    // Ensure cache is loaded
    if (!this.cacheLoaded) {
      this.loadVectorCache();
    }
    
    // Get all vectors with their metadata
    const rows = this.db.prepare(`
      SELECT id, chunk_id, vector, metadata 
      FROM vectors
    `).all() as { id: number; chunk_id: string; vector: Buffer; metadata: string | null }[];
    
    // Calculate similarity scores
    const scored: { row: typeof rows[0]; score: number }[] = [];
    
    for (const row of rows) {
      const vector = this.vectorCache.get(row.id) || this.blobToVector(row.vector);
      const score = this.cosineSimilarity(queryVector, vector);
      scored.push({ row, score });
    }
    
    // Sort by score (descending) and take top k
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, k);
    
    // Convert to results
    return topK.map(({ row, score }) => {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      return {
        id: row.id,
        chunkId: row.chunk_id,
        score,
        distance: 1 - score,
        metadata: {
          content: metadata.content,
          filePath: metadata.filePath,
          startLine: metadata.startLine,
          endLine: metadata.endLine,
          symbolName: metadata.symbolName,
          symbolType: metadata.symbolType,
          language: metadata.language,
          signature: metadata.signature,
        }
      };
    });
  }
  
  /**
   * Remove a vector by ID
   */
  async remove(vectorId: number): Promise<void> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    this.db.prepare('DELETE FROM vectors WHERE id = ?').run(vectorId);
    this.vectorCache.delete(vectorId);
    this.size = Math.max(0, this.size - 1);
  }
  
  /**
   * Remove multiple vectors by IDs
   */
  async removeBatch(vectorIds: number[]): Promise<void> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    const placeholders = vectorIds.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM vectors WHERE id IN (${placeholders})`).run(...vectorIds);
    
    for (const id of vectorIds) {
      this.vectorCache.delete(id);
    }
    
    const countResult = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    this.size = countResult.count;
  }
  
  /**
   * Remove by chunk ID
   */
  async removeByChunkId(chunkId: string): Promise<void> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    // Get vector ID first to update cache
    const row = this.db.prepare('SELECT id FROM vectors WHERE chunk_id = ?').get(chunkId) as { id: number } | undefined;
    if (row) {
      this.vectorCache.delete(row.id);
    }
    
    this.db.prepare('DELETE FROM vectors WHERE chunk_id = ?').run(chunkId);
    
    const countResult = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    this.size = countResult.count;
  }
  
  /**
   * Get a vector by ID
   */
  async getVector(vectorId: number): Promise<number[] | null> {
    if (!this.isReady || !this.db) {
      return null;
    }
    
    // Check cache first
    if (this.vectorCache.has(vectorId)) {
      return this.vectorCache.get(vectorId)!;
    }
    
    const row = this.db.prepare('SELECT vector FROM vectors WHERE id = ?').get(vectorId) as { vector: Buffer } | undefined;
    if (!row) return null;
    
    return this.blobToVector(row.vector);
  }
  
  /**
   * Get vector ID by chunk ID
   */
  getVectorId(chunkId: string): number | undefined {
    if (!this.isReady || !this.db) {
      return undefined;
    }
    
    const row = this.db.prepare('SELECT id FROM vectors WHERE chunk_id = ?').get(chunkId) as { id: number } | undefined;
    return row?.id;
  }
  
  /**
   * Get chunk ID by vector ID
   */
  getChunkId(vectorId: number): string | undefined {
    if (!this.isReady || !this.db) {
      return undefined;
    }
    
    const row = this.db.prepare('SELECT chunk_id FROM vectors WHERE id = ?').get(vectorId) as { chunk_id: string } | undefined;
    return row?.chunk_id;
  }
  
  /**
   * Clear all vectors
   */
  async clear(): Promise<void> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    this.db.prepare('DELETE FROM vectors').run();
    this.vectorCache.clear();
    this.cacheLoaded = false;
    this.size = 0;
    
    console.log('[SQLiteVectorStore] Cleared all vectors');
  }
  
  /**
   * Save is a no-op for SQLite (auto-persisted)
   */
  async save(savePath?: string): Promise<void> {
    // SQLite auto-saves, nothing to do
    console.log('[SQLiteVectorStore] Save called (auto-persisted via SQLite)');
  }
  
  /**
   * Load from path (reopens database at new path if different)
   */
  async load(loadPath?: string): Promise<void> {
    const targetPath = loadPath || this.dbPath;
    
    // If path changed, close old db and open new one
    if (targetPath !== this.dbPath && this.db) {
      this.db.close();
      this.db = null;
    }
    
    this.dbPath = targetPath;
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Open database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
    
    // Load dimensions
    const dimRow = this.db.prepare('SELECT value FROM store_meta WHERE key = ?').get('dimensions') as { value: string } | undefined;
    this.dimensions = dimRow ? parseInt(dimRow.value, 10) : 0;
    
    // Get current size
    const result = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    this.size = result.count;
    
    // Reset cache
    this.vectorCache.clear();
    this.cacheLoaded = false;
    
    this.isReady = true;
    console.log(`[SQLiteVectorStore] Loaded from ${this.dbPath} (${this.size} vectors)`);
  }
  
  /**
   * Get disk usage in bytes
   */
  async getDiskUsage(): Promise<number> {
    try {
      const stats = await fs.stat(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }
  
  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isReady = false;
    }
  }
}

// Export factory function
let storeInstance: SQLiteVectorStore | null = null;

export function getSQLiteVectorStore(dbPath?: string): SQLiteVectorStore {
  if (!storeInstance) {
    storeInstance = new SQLiteVectorStore(dbPath);
  }
  return storeInstance;
}

