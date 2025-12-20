/**
 * LM Studio Embedding Provider
 * 
 * Uses @lmstudio/sdk v1.5 for embedding model management.
 * 
 * Key behaviors:
 * - Dedicated 'rag-embedder' identifier to avoid conflicts with chat models
 * - Load on-demand, unload when done
 * - Singleton pattern to prevent race conditions
 */

import { LMStudioClient } from '@lmstudio/sdk';
import { BaseEmbeddingProvider, EmbeddingModelInfo } from './base.js';

// Known embedding model patterns
const EMBEDDING_MODEL_PATTERNS = [
  'embed',
  'bge',
  'nomic',
  'e5-',
  'gte-',
  'instructor',
  'sentence-transformer',
  'all-minilm',
  'paraphrase'
];

// Dedicated identifier for RAG embedder to avoid conflicts with chat models
const RAG_EMBEDDER_IDENTIFIER = 'rag-embedder';

export class LMStudioEmbedder extends BaseEmbeddingProvider {
  name = 'lmstudio';
  dimensions = 768; // Default, will be updated when model is loaded
  model = '';
  isLoaded = false;
  
  private client: LMStudioClient | null = null;
  private embeddingModel: any = null;
  private loadPromise: Promise<void> | null = null;
  private isLoading = false;
  
  constructor() {
    super();
  }
  
  private getClient(): LMStudioClient {
    if (!this.client) {
      this.client = new LMStudioClient();
    }
    return this.client;
  }
  
  /**
   * Check if provider is healthy (LM Studio is running)
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      // Try to list models as a health check
      await client.embedding.listLoaded();
      return true;
    } catch (error) {
      console.error('[LMStudioEmbedder] Health check failed:', error);
      this.client = null; // Reset client on error
      return false;
    }
  }
  
  /**
   * List available embedding models from LM Studio
   */
  async listModels(): Promise<EmbeddingModelInfo[]> {
    try {
      const client = this.getClient();
      
      // Get all downloaded models
      const allModels = await client.system.listDownloadedModels();
      
      // Filter for embedding-capable models by name pattern
      const embeddingModels = allModels.filter(m => {
        const pathLower = m.path.toLowerCase();
        return EMBEDDING_MODEL_PATTERNS.some(pattern => pathLower.includes(pattern));
      });
      
      // Check currently loaded embedding models
      let loadedEmbeddings: string[] = [];
      try {
        const loaded = await client.embedding.listLoaded();
        loadedEmbeddings = loaded.map(m => m.path);
      } catch {
        // Embedding API might not be available
      }
      
      return embeddingModels.map(m => ({
        id: m.path,
        name: m.path.split('/').pop() || m.path,
        path: m.path,
        loaded: loadedEmbeddings.includes(m.path),
        size: m.sizeBytes
      }));
    } catch (error) {
      console.error('[LMStudioEmbedder] Failed to list models:', error);
      return [];
    }
  }
  
  /**
   * Set the model to use for embeddings
   */
  async setModel(modelId: string): Promise<void> {
    if (this.model === modelId && this.isLoaded) {
      console.log(`[LMStudioEmbedder] Model ${modelId} already loaded`);
      return;
    }
    
    // Unload previous model if different
    if (this.model && this.model !== modelId && this.isLoaded) {
      await this.unload();
    }
    
    this.model = modelId;
  }
  
  /**
   * Load the embedding model
   */
  async load(): Promise<void> {
    if (!this.model) {
      throw new Error('No embedding model selected');
    }
    
    // Wait for any pending load operation
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }
    
    // Already loaded
    if (this.isLoaded && this.embeddingModel) {
      return;
    }
    
    this.isLoading = true;
    this.loadPromise = this.doLoad();
    
    try {
      await this.loadPromise;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }
  
  private async doLoad(): Promise<void> {
    const client = this.getClient();
    
    try {
      console.log(`[LMStudioEmbedder] Loading model: ${this.model}`);
      
      // Load embedding model using v1.5 API
      this.embeddingModel = await client.embedding.model(this.model);
      
      this.isLoaded = true;
      console.log(`[LMStudioEmbedder] Model loaded: ${this.model}`);
      
      // Try to detect dimensions by doing a test embedding
      try {
        const testResult = await this.embeddingModel.embed('test');
        if (testResult?.embedding) {
          this.dimensions = testResult.embedding.length;
          console.log(`[LMStudioEmbedder] Detected dimensions: ${this.dimensions}`);
        }
      } catch {
        // Keep default dimensions
      }
      
    } catch (error: any) {
      console.error(`[LMStudioEmbedder] Failed to load model:`, error);
      throw error;
    }
  }
  
  /**
   * Unload the embedding model
   */
  async unload(): Promise<void> {
    if (!this.isLoaded) {
      return;
    }
    
    try {
      console.log(`[LMStudioEmbedder] Unloading model`);
      
      // Just clear the reference - let LM Studio manage the actual model
      this.embeddingModel = null;
      this.isLoaded = false;
      
      console.log(`[LMStudioEmbedder] Model unloaded`);
      
    } catch (error: any) {
      console.error(`[LMStudioEmbedder] Failed to unload:`, error);
      this.isLoaded = false;
    }
  }
  
  /**
   * Embed multiple texts
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('No embedding model selected');
    }
    
    // Ensure model is loaded
    if (!this.isLoaded || !this.embeddingModel) {
      await this.load();
    }
    
    try {
      // Embed all texts
      const results: number[][] = [];
      
      for (const text of texts) {
        const result = await this.embeddingModel.embed(text);
        results.push(result.embedding);
      }
      
      return results;
      
    } catch (error: any) {
      console.error('[LMStudioEmbedder] Embedding failed:', error);
      
      // If model was unloaded externally, try reloading
      if (error.message?.includes('not loaded') || error.message?.includes('not found')) {
        this.isLoaded = false;
        this.embeddingModel = null;
        await this.load();
        return this.embed(texts); // Retry once
      }
      
      throw error;
    }
  }
}

// Export singleton instance
let instance: LMStudioEmbedder | null = null;

export function getLMStudioEmbedder(): LMStudioEmbedder {
  if (!instance) {
    instance = new LMStudioEmbedder();
  }
  return instance;
}

export { RAG_EMBEDDER_IDENTIFIER };
