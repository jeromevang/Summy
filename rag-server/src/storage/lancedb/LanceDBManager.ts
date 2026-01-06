import * as lancedb from '@lancedb/lancedb';
import fs from 'fs/promises';
import path from 'path';
import { VectorStore, VectorSearchResult } from '../base.js';
import { ChunkMetadata, VectorRecord } from './types.js';

export class LanceDBStore implements VectorStore {
  name = 'lancedb';
  dimensions = 0;
  size = 0;
  isReady = false;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;
  private tableName = 'vectors';

  constructor(dbPath: string = './data/indices/lance') {
    this.dbPath = dbPath;
  }

  async initialize(dimensions: number, maxElements?: number): Promise<void> {
    this.dimensions = dimensions;
    await fs.mkdir(this.dbPath, { recursive: true });
    this.db = await lancedb.connect(this.dbPath);
    if ((await this.db.tableNames()).includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
      this.size = await this.table.countRows();
    }
    this.isReady = true;
  }

  async add(vector: number[], chunkId: string): Promise<number> {
    if (!this.isReady || !this.db) throw new Error('Not ready');
    // Real logic would add to LanceDB here
    this.size++;
    return this.size - 1;
  }

  async addBatch(vectors: number[][], chunkIds: string[]): Promise<number[]> {
    if (!this.isReady || !this.db) throw new Error('Not ready');
    if (vectors.length !== chunkIds.length) {
      throw new Error('vectors and chunkIds must have the same length');
    }
    // Real logic would batch add to LanceDB here
    const ids: number[] = [];
    for (let i = 0; i < vectors.length; i++) {
      ids.push(this.size + i);
    }
    this.size += vectors.length;
    return ids;
  }

  async search(queryVector: number[], k: number): Promise<VectorSearchResult[]> {
    if (!this.table) return [];
    // Real logic would search LanceDB here
    return [];
  }

  async remove(vectorId: number): Promise<void> {
    if (!this.isReady || !this.table) throw new Error('Not ready');
    // Real logic would remove from LanceDB here
    this.size = Math.max(0, this.size - 1);
  }

  async removeBatch(vectorIds: number[]): Promise<void> {
    if (!this.isReady || !this.table) throw new Error('Not ready');
    // Real logic would batch remove from LanceDB here
    this.size = Math.max(0, this.size - vectorIds.length);
  }

  async getVector(vectorId: number): Promise<number[] | null> {
    if (!this.isReady || !this.table) return null;
    // Real logic would fetch vector from LanceDB here
    return null;
  }

  async clear(): Promise<void> {
    if (!this.isReady || !this.db) throw new Error('Not ready');
    // Real logic would clear LanceDB table here
    if (this.table) {
      await this.db.dropTable(this.tableName);
      this.table = null;
    }
    this.size = 0;
  }

  async save(savePath: string): Promise<void> {
    if (!this.isReady || !this.db) throw new Error('Not ready');
    // LanceDB persists automatically, so this is mostly a no-op
    // Could implement export logic here if needed
  }

  async load(loadPath: string): Promise<void> {
    if (!this.db) throw new Error('Not initialized');
    // Real logic would load from path here
    // This might involve copying data or reconnecting
  }

  async getDiskUsage(): Promise<number> {
    if (!this.isReady) return 0;
    try {
      const stats = await fs.stat(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }
}
