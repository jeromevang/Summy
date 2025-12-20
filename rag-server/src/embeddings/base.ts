/**
 * Base Embedding Provider Interface
 * 
 * All embedding providers must implement this interface for easy switching.
 */

export interface EmbeddingProvider {
  /**
   * Provider name (e.g., 'lmstudio', 'openai', 'google')
   */
  name: string;
  
  /**
   * Embedding vector dimensions (e.g., 768 for nomic-embed-text)
   */
  dimensions: number;
  
  /**
   * Current model identifier
   */
  model: string;
  
  /**
   * Whether the model is currently loaded
   */
  isLoaded: boolean;
  
  /**
   * Embed multiple texts in a batch
   * @param texts Array of strings to embed
   * @returns Promise resolving to array of embedding vectors
   */
  embed(texts: string[]): Promise<number[][]>;
  
  /**
   * Embed a single text
   * @param text String to embed
   * @returns Promise resolving to embedding vector
   */
  embedSingle(text: string): Promise<number[]>;
  
  /**
   * Check if the provider is available and healthy
   * @returns Promise resolving to true if healthy
   */
  healthCheck(): Promise<boolean>;
  
  /**
   * Load the embedding model
   */
  load(): Promise<void>;
  
  /**
   * Unload the embedding model to free resources
   */
  unload(): Promise<void>;
  
  /**
   * List available models from this provider
   * @returns Promise resolving to array of model info
   */
  listModels(): Promise<EmbeddingModelInfo[]>;
  
  /**
   * Set the model to use
   * @param modelId Model identifier
   */
  setModel(modelId: string): Promise<void>;
}

export interface EmbeddingModelInfo {
  id: string;
  name: string;
  path?: string;
  dimensions?: number;
  loaded?: boolean;
  size?: number;
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
  abstract name: string;
  abstract dimensions: number;
  abstract model: string;
  abstract isLoaded: boolean;
  
  abstract embed(texts: string[]): Promise<number[][]>;
  abstract healthCheck(): Promise<boolean>;
  abstract load(): Promise<void>;
  abstract unload(): Promise<void>;
  abstract listModels(): Promise<EmbeddingModelInfo[]>;
  abstract setModel(modelId: string): Promise<void>;
  
  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}
