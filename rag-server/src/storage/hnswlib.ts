/**
 * Vector Store using Vectra (Pure JavaScript)
 * 
 * Local file-based vector storage using vectra.
 * Falls back from hnswlib-node if native modules are not available.
 * 
 * Features:
 * - No native dependencies (pure JavaScript)
 * - Persists to disk as JSON
 * - Fast cosine similarity search
 * - Supports incremental updates
 */

import { LocalIndex } from 'vectra';
import fs from 'fs/promises';
import path from 'path';
import { VectorStore, VectorSearchResult } from './base.js';

// Mapping from vector ID to chunk ID
interface VectorMapping {
  vectorId: number;
  chunkId: string;
}

// Chunk metadata stored with vectors
export interface ChunkMetadata {
  vectorId: number;
  content?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
  symbolType?: string;
  language?: string;
  signature?: string;
}

export class HNSWLibStore implements VectorStore {
  name = 'vectra';
  dimensions = 0;
  size = 0;
  isReady = false;
  
  private index: LocalIndex | null = null;
  private mappings: Map<number, string> = new Map(); // vectorId -> chunkId
  private reverseMappings: Map<string, number> = new Map(); // chunkId -> vectorId
  private nextId = 0;
  private maxElements: number;
  private dataPath: string;
  
  constructor(dataPath: string = './data/indices') {
    this.dataPath = dataPath;
    this.maxElements = 100000; // Default max elements
  }
  
  /**
   * Initialize the store
   */
  async initialize(dimensions: number, maxElements?: number): Promise<void> {
    this.dimensions = dimensions;
    this.maxElements = maxElements || this.maxElements;
    
    // Ensure data directory exists
    await fs.mkdir(this.dataPath, { recursive: true });
    
    // Create new Vectra index
    this.index = new LocalIndex(this.dataPath);
    
    // Check if index exists and create if not
    if (!await this.index.isIndexCreated()) {
      await this.index.createIndex();
    }
    
    this.mappings.clear();
    this.reverseMappings.clear();
    this.nextId = 0;
    this.size = 0;
    this.isReady = true;
    
    console.log(`[VectraStore] Initialized with ${dimensions} dimensions at ${this.dataPath}`);
  }
  
  /**
   * Add a vector to the store
   */
  async add(vector: number[], chunkId: string, metadata?: Partial<ChunkMetadata>): Promise<number> {
    if (!this.isReady || !this.index) {
      throw new Error('Store not initialized');
    }
    
    if (vector.length !== this.dimensions && this.dimensions > 0) {
      // Update dimensions if this is the first vector
      if (this.size === 0) {
        this.dimensions = vector.length;
      } else {
        throw new Error(`Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
      }
    }
    
    // Check if chunk already exists
    if (this.reverseMappings.has(chunkId)) {
      const existingId = this.reverseMappings.get(chunkId)!;
      // Delete old entry and add new one
      await this.index.deleteItem(chunkId);
      await this.index.insertItem({
        id: chunkId,
        vector,
        metadata: { vectorId: existingId, ...metadata }
      });
      return existingId;
    }
    
    // Add new vector
    const vectorId = this.nextId++;
    await this.index.insertItem({
      id: chunkId,
      vector,
      metadata: { vectorId, ...metadata }
    });
    
    this.mappings.set(vectorId, chunkId);
    this.reverseMappings.set(chunkId, vectorId);
    this.size++;
    
    return vectorId;
  }
  
  /**
   * Add multiple vectors in batch
   */
  async addBatch(vectors: number[][], chunkIds: string[]): Promise<number[]> {
    if (vectors.length !== chunkIds.length) {
      throw new Error('Vectors and chunkIds arrays must have same length');
    }
    
    const ids: number[] = [];
    for (let i = 0; i < vectors.length; i++) {
      const id = await this.add(vectors[i], chunkIds[i]);
      ids.push(id);
    }
    
    return ids;
  }
  
  /**
   * Search for similar vectors
   */
  async search(queryVector: number[], k: number): Promise<VectorSearchResult[]> {
    if (!this.isReady || !this.index) {
      console.log('[VectraStore] Search failed: Store not initialized');
      throw new Error('Store not initialized');
    }
    
    console.log(`[VectraStore] Searching with k=${k}, store size=${this.size}, isReady=${this.isReady}`);
    
    if (this.size === 0) {
      console.log('[VectraStore] Search: Store is empty');
      return [];
    }
    
    // Limit k to available vectors
    const actualK = Math.min(k, this.size);
    
    // Search using Vectra
    console.log(`[VectraStore] Calling queryItems with actualK=${actualK}`);
    const results = await this.index.queryItems(queryVector, actualK);
    console.log(`[VectraStore] Got ${results.length} raw results from Vectra`);
    
    // Map results with metadata
    const searchResults: VectorSearchResult[] = results.map(result => {
      const meta = result.item.metadata || {};
      return {
        id: meta.vectorId as number || 0,
        chunkId: result.item.id,
        distance: 1 - result.score, // Vectra returns cosine similarity, convert to distance
        score: result.score,
        metadata: {
          content: meta.content as string | undefined,
          filePath: meta.filePath as string | undefined,
          startLine: meta.startLine as number | undefined,
          endLine: meta.endLine as number | undefined,
          symbolName: meta.symbolName as string | undefined,
          symbolType: meta.symbolType as string | undefined,
          language: meta.language as string | undefined,
          signature: meta.signature as string | undefined
        }
      };
    });
    
    return searchResults;
  }
  
  /**
   * Remove a vector by ID
   */
  async remove(vectorId: number): Promise<void> {
    if (!this.isReady || !this.index) {
      throw new Error('Store not initialized');
    }
    
    const chunkId = this.mappings.get(vectorId);
    if (chunkId) {
      await this.index.deleteItem(chunkId);
      this.mappings.delete(vectorId);
      this.reverseMappings.delete(chunkId);
      this.size--;
    }
  }
  
  /**
   * Remove multiple vectors by IDs
   */
  async removeBatch(vectorIds: number[]): Promise<void> {
    for (const id of vectorIds) {
      await this.remove(id);
    }
  }
  
  /**
   * Get a vector by ID
   */
  async getVector(vectorId: number): Promise<number[] | null> {
    if (!this.isReady || !this.index) {
      return null;
    }
    
    const chunkId = this.mappings.get(vectorId);
    if (!chunkId) return null;
    
    const item = await this.index.getItem(chunkId);
    return item?.vector || null;
  }
  
  /**
   * Clear all vectors
   */
  async clear(): Promise<void> {
    if (this.index) {
      // Delete and recreate index
      try {
        const indexPath = path.join(this.dataPath, 'index.json');
        await fs.unlink(indexPath).catch(() => {});
      } catch {}
      
      await this.index.createIndex();
      this.mappings.clear();
      this.reverseMappings.clear();
      this.nextId = 0;
      this.size = 0;
    }
  }
  
  /**
   * Save the index to disk (Vectra auto-saves, but we save mappings)
   */
  async save(savePath?: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('Store not initialized');
    }
    
    const targetPath = savePath || this.dataPath;
    await fs.mkdir(targetPath, { recursive: true });
    
    // Save mappings
    const mappingsPath = path.join(targetPath, 'mappings.json');
    const mappingsData = {
      dimensions: this.dimensions,
      maxElements: this.maxElements,
      nextId: this.nextId,
      size: this.size,
      mappings: Array.from(this.mappings.entries())
    };
    await fs.writeFile(mappingsPath, JSON.stringify(mappingsData, null, 2));
    
    console.log(`[VectraStore] Saved mappings to ${targetPath}`);
  }
  
  /**
   * Load the index from disk
   */
  async load(loadPath?: string): Promise<void> {
    const targetPath = loadPath || this.dataPath;
    
    // Ensure directory exists
    await fs.mkdir(targetPath, { recursive: true });
    
    // Initialize Vectra index first
    this.index = new LocalIndex(targetPath);
    
    // Check if index exists, create if not
    if (!await this.index.isIndexCreated()) {
      console.log(`[VectraStore] Creating new index at ${targetPath}`);
      await this.index.createIndex();
    }
    
    const mappingsPath = path.join(targetPath, 'mappings.json');
    
    // Check if mappings file exists
    try {
      await fs.access(mappingsPath);
    } catch {
      console.log(`[VectraStore] No existing mappings found at ${targetPath}, starting fresh`);
      this.isReady = true;
      return;
    }
    
    // Load mappings
    const mappingsData = JSON.parse(await fs.readFile(mappingsPath, 'utf-8'));
    
    this.dimensions = mappingsData.dimensions;
    this.maxElements = mappingsData.maxElements;
    this.nextId = mappingsData.nextId;
    this.size = mappingsData.size;
    
    // Rebuild mappings
    this.mappings.clear();
    this.reverseMappings.clear();
    for (const [vectorId, chunkId] of mappingsData.mappings) {
      this.mappings.set(vectorId, chunkId);
      this.reverseMappings.set(chunkId, vectorId);
    }
    
    this.isReady = true;
    console.log(`[VectraStore] Loaded index from ${targetPath} (${this.size} vectors)`);
  }
  
  /**
   * Get disk usage in bytes
   */
  async getDiskUsage(): Promise<number> {
    let totalSize = 0;
    
    try {
      const files = await fs.readdir(this.dataPath);
      for (const file of files) {
        const stats = await fs.stat(path.join(this.dataPath, file));
        totalSize += stats.size;
      }
    } catch {
      // Directory doesn't exist
    }
    
    return totalSize;
  }
  
  /**
   * Get chunk ID by vector ID
   */
  getChunkId(vectorId: number): string | undefined {
    return this.mappings.get(vectorId);
  }
  
  /**
   * Get vector ID by chunk ID
   */
  getVectorId(chunkId: string): number | undefined {
    return this.reverseMappings.get(chunkId);
  }
}

// Export singleton instance
let storeInstance: HNSWLibStore | null = null;

export function getHNSWLibStore(dataPath?: string): HNSWLibStore {
  if (!storeInstance) {
    storeInstance = new HNSWLibStore(dataPath);
  }
  return storeInstance;
}
