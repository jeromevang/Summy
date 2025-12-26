/**
 * LanceDB Vector Store
 * 
 * High-performance vector storage using LanceDB.
 * Uses HNSW/IVF indexing for fast approximate nearest neighbor search.
 * 
 * Features:
 * - O(log n) search instead of O(n) brute-force
 * - Embedded/serverless - runs in-process
 * - Stores metadata alongside vectors
 * - Auto-persists to disk
 * - Cross-platform (Windows, Linux, Mac)
 */

import * as lancedb from '@lancedb/lancedb';
import { makeArrowTable } from '@lancedb/lancedb';
import { Float32 } from 'apache-arrow';
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

// LanceDB record schema - use index signature for compatibility
// Use empty strings/0 instead of null to help LanceDB infer types
// Use number[] for vector column - LanceDB will convert to fixed-size list
interface VectorRecord {
  [key: string]: unknown;
  id: number;
  chunk_id: string;
  vector: number[];  // Use regular array - LanceDB auto-detects 'vector' column
  content: string;
  file_path: string;
  start_line: number;
  end_line: number;
  symbol_name: string;
  symbol_type: string;
  language: string;
  signature: string;
  summary: string;
  purpose: string;
  is_summary_vector: boolean;
  original_chunk_id: string;
}

export class LanceDBStore implements VectorStore {
  name = 'lancedb';
  dimensions = 0;
  size = 0;
  isReady = false;
  
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;
  private tableName = 'vectors';
  private nextId = 0;
  
  // Mappings for compatibility with existing API
  private chunkIdToVectorId: Map<string, number> = new Map();
  private vectorIdToChunkId: Map<number, string> = new Map();
  
  constructor(dbPath: string = './data/indices/lance') {
    this.dbPath = dbPath;
  }
  
  /**
   * Initialize the store
   */
  async initialize(dimensions: number, maxElements?: number): Promise<void> {
    this.dimensions = dimensions;
    
    // Ensure directory exists
    await fs.mkdir(this.dbPath, { recursive: true });
    
    // Connect to LanceDB
    this.db = await lancedb.connect(this.dbPath);
    
    // Check if table exists
    const tableNames = await this.db.tableNames();
    
    if (tableNames.includes(this.tableName)) {
      // Load existing table
      this.table = await this.db.openTable(this.tableName);
      
      // Count existing records and rebuild mappings
      const count = await this.table.countRows();
      this.size = count;
      
      // Rebuild ID mappings from existing data
      if (count > 0) {
        const allRows = await this.table.query().limit(count).toArray();
        for (const row of allRows) {
          const record = row as unknown as VectorRecord;
          this.chunkIdToVectorId.set(record.chunk_id, record.id);
          this.vectorIdToChunkId.set(record.id, record.chunk_id);
          if (record.id >= this.nextId) {
            this.nextId = record.id + 1;
          }
        }
      }
      
      console.log(`[LanceDB] Loaded existing table with ${this.size} vectors`);
    } else {
      // Table will be created on first insert
      this.table = null;
      console.log(`[LanceDB] Initialized at ${this.dbPath} (empty, will create on first insert)`);
    }
    
    this.isReady = true;
  }
  
  /**
   * Create table with explicit schema that defines vector column
   */
  private async createTableWithSchema(records: VectorRecord[]): Promise<lancedb.Table> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    // Use makeArrowTable with vectorColumns to properly define the vector column
    const arrowTable = makeArrowTable(records as unknown as Record<string, unknown>[], {
      vectorColumns: {
        vector: { type: new Float32() }
      }
    });
    
    return await this.db.createTable(this.tableName, arrowTable);
  }
  
  /**
   * Create a record from vector and metadata
   * Note: Use empty strings instead of null for string fields to help LanceDB infer types
   */
  private createRecord(
    vectorId: number,
    vector: number[],
    chunkId: string,
    metadata?: Partial<ChunkMetadata>
  ): VectorRecord {
    return {
      id: vectorId,
      chunk_id: chunkId,
      vector: vector,  // Use regular array - LanceDB auto-detects 'vector' column
      content: metadata?.content ?? '',
      file_path: metadata?.filePath ?? '',
      start_line: metadata?.startLine ?? 0,
      end_line: metadata?.endLine ?? 0,
      symbol_name: metadata?.symbolName ?? '',
      symbol_type: metadata?.symbolType ?? '',
      language: metadata?.language ?? '',
      signature: metadata?.signature ?? '',
      summary: metadata?.summary ?? '',
      purpose: metadata?.purpose ?? '',
      is_summary_vector: metadata?.isSummaryVector ?? false,
      original_chunk_id: metadata?.originalChunkId ?? ''
    };
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
    }
    
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
    }
    
    // Check if chunk already exists
    if (this.chunkIdToVectorId.has(chunkId)) {
      const existingId = this.chunkIdToVectorId.get(chunkId)!;
      // Delete old entry
      if (this.table) {
        await this.table.delete(`chunk_id = '${chunkId}'`);
      }
      // Add new entry with same ID
      const record = this.createRecord(existingId, vector, chunkId, metadata);
      
      if (this.table) {
        await this.table.add([record]);
      } else {
        // Create table with first record and proper schema
        this.table = await this.createTableWithSchema([record]);
      }
      
      return existingId;
    }
    
    // Create new record
    const vectorId = this.nextId++;
    const record = this.createRecord(vectorId, vector, chunkId, metadata);
    
    if (this.table) {
      await this.table.add([record]);
    } else {
      // Create table with first record and proper schema
      this.table = await this.createTableWithSchema([record]);
    }
    
    // Update mappings
    this.chunkIdToVectorId.set(chunkId, vectorId);
    this.vectorIdToChunkId.set(vectorId, chunkId);
    this.size++;
    
    return vectorId;
  }
  
  /**
   * Add multiple vectors in batch (much faster than individual adds)
   */
  async addBatch(
    vectors: number[][],
    chunkIds: string[],
    metadataList?: Partial<ChunkMetadata>[]
  ): Promise<number[]> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    if (vectors.length !== chunkIds.length) {
      throw new Error('Vectors and chunkIds arrays must have same length');
    }
    
    if (vectors.length === 0) {
      return [];
    }
    
    // Update dimensions on first vector if not set
    if (this.dimensions === 0) {
      this.dimensions = vectors[0].length;
    }
    
    const records: VectorRecord[] = [];
    const ids: number[] = [];
    
    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const chunkId = chunkIds[i];
      const metadata = metadataList?.[i];
      
      // Handle existing entries
      let vectorId: number;
      if (this.chunkIdToVectorId.has(chunkId)) {
        vectorId = this.chunkIdToVectorId.get(chunkId)!;
      } else {
        vectorId = this.nextId++;
        this.chunkIdToVectorId.set(chunkId, vectorId);
        this.vectorIdToChunkId.set(vectorId, chunkId);
        this.size++;
      }
      
      records.push(this.createRecord(vectorId, vector, chunkId, metadata));
      ids.push(vectorId);
    }
    
    // Delete existing entries that we're updating
    const existingChunkIds = chunkIds.filter(id => this.chunkIdToVectorId.has(id));
    if (existingChunkIds.length > 0 && this.table) {
      const whereClause = existingChunkIds.map(id => `chunk_id = '${id}'`).join(' OR ');
      await this.table.delete(whereClause);
    }
    
    // Batch add all records
    if (this.table) {
      await this.table.add(records);
    } else {
      // Create table with first batch and proper schema
      this.table = await this.createTableWithSchema(records);
    }
    
    return ids;
  }
  
  /**
   * Search for similar vectors using LanceDB's native ANN search
   */
  async search(queryVector: number[], k: number): Promise<VectorSearchResult[]> {
    if (!this.isReady || !this.table) {
      if (this.size === 0) {
        return [];
      }
      throw new Error('Store not initialized or empty');
    }
    
    if (this.size === 0) {
      return [];
    }
    
    // Limit k to available vectors
    const actualK = Math.min(k, this.size);
    
    // LanceDB native vector search (uses HNSW/IVF under the hood)
    // Use vectorSearch() which explicitly targets the vector column
    const results = await this.table
      .vectorSearch(Float32Array.from(queryVector))
      .limit(actualK)
      .toArray();
    
    // Convert to our result format
    // Convert empty strings back to undefined for API compatibility
    return results.map(row => {
      const record = row as unknown as VectorRecord & { _distance?: number };
      const distance = record._distance ?? 0;
      
      return {
        id: record.id,
        chunkId: record.chunk_id,
        score: 1 / (1 + distance), // Convert distance to similarity score
        distance,
        metadata: {
          content: record.content || undefined,
          filePath: record.file_path || undefined,
          startLine: record.start_line || undefined,
          endLine: record.end_line || undefined,
          symbolName: record.symbol_name || undefined,
          symbolType: record.symbol_type || undefined,
          language: record.language || undefined,
          signature: record.signature || undefined
        }
      };
    });
  }
  
  /**
   * Remove a vector by ID
   */
  async remove(vectorId: number): Promise<void> {
    if (!this.isReady || !this.table) {
      throw new Error('Store not initialized');
    }
    
    const chunkId = this.vectorIdToChunkId.get(vectorId);
    if (chunkId) {
      await this.table.delete(`id = ${vectorId}`);
      this.chunkIdToVectorId.delete(chunkId);
      this.vectorIdToChunkId.delete(vectorId);
      this.size = Math.max(0, this.size - 1);
    }
  }
  
  /**
   * Remove multiple vectors by IDs
   */
  async removeBatch(vectorIds: number[]): Promise<void> {
    if (!this.isReady || !this.table) {
      throw new Error('Store not initialized');
    }
    
    if (vectorIds.length === 0) return;
    
    const whereClause = vectorIds.map(id => `id = ${id}`).join(' OR ');
    await this.table.delete(whereClause);
    
    for (const vectorId of vectorIds) {
      const chunkId = this.vectorIdToChunkId.get(vectorId);
      if (chunkId) {
        this.chunkIdToVectorId.delete(chunkId);
        this.vectorIdToChunkId.delete(vectorId);
      }
    }
    
    this.size = Math.max(0, this.size - vectorIds.length);
  }
  
  /**
   * Remove by chunk ID
   */
  async removeByChunkId(chunkId: string): Promise<void> {
    if (!this.isReady || !this.table) {
      throw new Error('Store not initialized');
    }
    
    const vectorId = this.chunkIdToVectorId.get(chunkId);
    if (vectorId !== undefined) {
      await this.table.delete(`chunk_id = '${chunkId}'`);
      this.chunkIdToVectorId.delete(chunkId);
      this.vectorIdToChunkId.delete(vectorId);
      this.size = Math.max(0, this.size - 1);
    }
  }
  
  /**
   * Get a vector by ID
   */
  async getVector(vectorId: number): Promise<number[] | null> {
    if (!this.isReady || !this.table) {
      return null;
    }
    
    const results = await this.table
      .query()
      .where(`id = ${vectorId}`)
      .limit(1)
      .toArray();
    
    if (results.length === 0) return null;
    
    const record = results[0] as unknown as VectorRecord;
    return Array.from(record.vector);
  }
  
  /**
   * Get chunk ID by vector ID
   */
  getChunkId(vectorId: number): string | undefined {
    return this.vectorIdToChunkId.get(vectorId);
  }
  
  /**
   * Get vector ID by chunk ID
   */
  getVectorId(chunkId: string): number | undefined {
    return this.chunkIdToVectorId.get(chunkId);
  }
  
  /**
   * Clear all vectors
   */
  async clear(): Promise<void> {
    if (!this.isReady || !this.db) {
      throw new Error('Store not initialized');
    }
    
    // Drop and recreate table
    if (this.table) {
      await this.db.dropTable(this.tableName);
      this.table = null;
    }
    
    this.chunkIdToVectorId.clear();
    this.vectorIdToChunkId.clear();
    this.nextId = 0;
    this.size = 0;
    
    console.log('[LanceDB] Cleared all vectors');
  }
  
  /**
   * Save is a no-op for LanceDB (auto-persisted)
   */
  async save(savePath?: string): Promise<void> {
    // LanceDB auto-saves, nothing to do
    console.log('[LanceDB] Save called (auto-persisted)');
  }
  
  /**
   * Load from path (reopens database at new path if different)
   */
  async load(loadPath?: string): Promise<void> {
    const targetPath = loadPath || this.dbPath;
    
    // If path changed, close and reopen
    if (targetPath !== this.dbPath) {
      this.db = null;
      this.table = null;
    }
    
    this.dbPath = targetPath;
    
    // Reinitialize
    await this.initialize(this.dimensions || 768);
    
    console.log(`[LanceDB] Loaded from ${this.dbPath} (${this.size} vectors)`);
  }
  
  /**
   * Get disk usage in bytes
   */
  async getDiskUsage(): Promise<number> {
    let totalSize = 0;
    
    try {
      const files = await fs.readdir(this.dbPath, { recursive: true });
      for (const file of files) {
        const filePath = path.join(this.dbPath, file.toString());
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            totalSize += stats.size;
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    return totalSize;
  }
  
  /**
   * Close the database connection
   */
  close(): void {
    this.db = null;
    this.table = null;
    this.isReady = false;
  }
}

// Export singleton instance
let storeInstance: LanceDBStore | null = null;

export function getLanceDBStore(dbPath?: string): LanceDBStore {
  if (!storeInstance) {
    storeInstance = new LanceDBStore(dbPath);
  }
  return storeInstance;
}

