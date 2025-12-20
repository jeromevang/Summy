/**
 * Base Vector Store Interface
 * 
 * Abstract interface for vector storage backends.
 */

export interface VectorSearchResult {
  id: number;       // Vector ID in the store
  chunkId: string;  // Reference to chunk in database
  score: number;    // Similarity score (higher is better)
  distance: number; // Distance (lower is better)
  metadata?: {      // Optional metadata stored with the vector
    content?: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
    symbolName?: string;
    symbolType?: string;
    language?: string;
    signature?: string;
  };
}

export interface VectorStore {
  /**
   * Store name
   */
  name: string;
  
  /**
   * Number of dimensions for vectors
   */
  dimensions: number;
  
  /**
   * Current number of vectors in the store
   */
  size: number;
  
  /**
   * Whether the store is initialized and ready
   */
  isReady: boolean;
  
  /**
   * Initialize the store with given dimensions
   * @param dimensions Number of dimensions for vectors
   * @param maxElements Maximum number of elements (for pre-allocation)
   */
  initialize(dimensions: number, maxElements?: number): Promise<void>;
  
  /**
   * Add a vector to the store
   * @param vector The embedding vector
   * @param chunkId Reference to the chunk in database
   * @returns The assigned vector ID
   */
  add(vector: number[], chunkId: string): Promise<number>;
  
  /**
   * Add multiple vectors in batch
   * @param vectors Array of embedding vectors
   * @param chunkIds Array of chunk IDs (same order as vectors)
   * @returns Array of assigned vector IDs
   */
  addBatch(vectors: number[][], chunkIds: string[]): Promise<number[]>;
  
  /**
   * Search for similar vectors
   * @param queryVector The query embedding
   * @param k Number of results to return
   * @returns Array of search results
   */
  search(queryVector: number[], k: number): Promise<VectorSearchResult[]>;
  
  /**
   * Remove a vector by ID
   * @param vectorId The vector ID to remove
   */
  remove(vectorId: number): Promise<void>;
  
  /**
   * Remove multiple vectors by IDs
   * @param vectorIds Array of vector IDs to remove
   */
  removeBatch(vectorIds: number[]): Promise<void>;
  
  /**
   * Get a vector by ID
   * @param vectorId The vector ID
   * @returns The vector or null if not found
   */
  getVector(vectorId: number): Promise<number[] | null>;
  
  /**
   * Clear all vectors from the store
   */
  clear(): Promise<void>;
  
  /**
   * Save the index to disk
   * @param path Path to save the index
   */
  save(path: string): Promise<void>;
  
  /**
   * Load the index from disk
   * @param path Path to load the index from
   */
  load(path: string): Promise<void>;
  
  /**
   * Get disk usage in bytes
   */
  getDiskUsage(): Promise<number>;
}
