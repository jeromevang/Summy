/**
 * LM Studio Embedding Provider
 * 
 * Uses @lmstudio/sdk v1.5 for embedding model management.
 * 
 * Key behaviors:
 * - Dedicated 'rag-embedder' identifier to avoid conflicts with chat models
 * - Load on-demand and KEEP loaded (never auto-unload)
 * - Never unload other models (chat models stay loaded)
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
   * Check if embedding model is already loaded in LM Studio
   * Returns the identifier of the loaded model if found, or null if not loaded
   */
  private async getLoadedModelIdentifier(): Promise<string | null> {
    try {
      const client = this.getClient();
      const loadedEmbeddings = await client.embedding.listLoaded();
      
      // Check if our dedicated RAG embedder is loaded
      const ragEmbedder = loadedEmbeddings.find(m => m.identifier === RAG_EMBEDDER_IDENTIFIER);
      if (ragEmbedder) {
        return RAG_EMBEDDER_IDENTIFIER;
      }
      
      // Check if the model is loaded (with any identifier or by path)
      const modelLoaded = loadedEmbeddings.find(m => 
        m.path === this.model || 
        m.identifier === this.model ||
        m.path?.includes(this.model.split('/').pop() || '')
      );
      
      if (modelLoaded) {
        return modelLoaded.identifier || modelLoaded.path;
      }
      
      return null;
    } catch {
      return null;
    }
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
      
      // Check if embedding model is already loaded in LM Studio (by any identifier)
      const existingIdentifier = await this.getLoadedModelIdentifier();
      
      if (existingIdentifier) {
        console.log(`[LMStudioEmbedder] Model already loaded (identifier: ${existingIdentifier}), reusing...`);
        // Reuse the already-loaded model - don't load a second instance!
        this.embeddingModel = await client.embedding.model(existingIdentifier);
      } else {
        console.log(`[LMStudioEmbedder] Model not loaded, loading now...`);
        
        // Load the embedding model explicitly - this will NOT unload other models
        // The embedding.load() method loads the model alongside any existing chat models
        try {
          this.embeddingModel = await client.embedding.load(this.model, {
            identifier: RAG_EMBEDDER_IDENTIFIER
          });
          console.log(`[LMStudioEmbedder] Model loaded with identifier: ${RAG_EMBEDDER_IDENTIFIER}`);
        } catch (loadError: any) {
          // If load() fails (API version mismatch), fall back to model() which assumes pre-loaded
          if (loadError.message?.includes('not a function') || loadError.message?.includes('is not defined')) {
            console.log(`[LMStudioEmbedder] Fallback: using model() reference (ensure model is loaded in LM Studio)`);
            this.embeddingModel = await client.embedding.model(this.model);
          } else {
            throw loadError;
          }
        }
      }
      
      this.isLoaded = true;
      console.log(`[LMStudioEmbedder] Model ready: ${this.model}`);
      
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
   * Clear the internal model reference.
   * NOTE: This does NOT unload the model from LM Studio - the model stays loaded
   * for quick re-use. This just clears our internal reference.
   */
  async unload(): Promise<void> {
    if (!this.isLoaded) {
      return;
    }
    
    console.log(`[LMStudioEmbedder] Clearing model reference (model stays loaded in LM Studio)`);
    
    // Just clear our internal reference - model stays loaded in LM Studio
    this.embeddingModel = null;
    this.isLoaded = false;
  }
  
  /**
   * Force unload the embedding model from LM Studio.
   * Use this only when explicitly requested (e.g., to free VRAM).
   */
  async forceUnload(): Promise<void> {
    try {
      const client = this.getClient();
      
      console.log(`[LMStudioEmbedder] Force unloading model from LM Studio...`);
      
      // Try to unload by identifier first, then by model path
      try {
        await client.embedding.unload(RAG_EMBEDDER_IDENTIFIER);
      } catch {
        try {
          await client.embedding.unload(this.model);
        } catch {
          // Model might already be unloaded
        }
      }
      
      this.embeddingModel = null;
      this.isLoaded = false;
      
      console.log(`[LMStudioEmbedder] Model force unloaded`);
      
    } catch (error: any) {
      console.error(`[LMStudioEmbedder] Failed to force unload:`, error);
      this.embeddingModel = null;
      this.isLoaded = false;
    }
  }
  
  /**
   * Embed multiple texts with parallel processing for speed
   * Uses concurrent batches to maximize throughput while avoiding overwhelming LM Studio
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('No embedding model selected');
    }
    
    // Ensure model is loaded
    if (!this.isLoaded || !this.embeddingModel) {
      await this.load();
    }
    
    if (texts.length === 0) {
      return [];
    }
    
    // For single text, just embed directly
    if (texts.length === 1) {
      try {
        const result = await this.embeddingModel.embed(texts[0]);
        return [result.embedding];
      } catch (error: any) {
        return this.handleEmbedError(error, texts);
      }
    }
    
    try {
      // Process in parallel batches for speed
      // Concurrency of 8 balances throughput vs overwhelming LM Studio
      const CONCURRENCY = 8;
      const results: number[][] = new Array(texts.length);
      
      // Process in concurrent batches
      for (let i = 0; i < texts.length; i += CONCURRENCY) {
        const batch = texts.slice(i, Math.min(i + CONCURRENCY, texts.length));
        const batchPromises = batch.map((text, batchIdx) => 
          this.embeddingModel.embed(text).then((result: any) => {
            results[i + batchIdx] = result.embedding;
          })
        );
        
        await Promise.all(batchPromises);
      }
      
      return results;
      
    } catch (error: any) {
      return this.handleEmbedError(error, texts);
    }
  }
  
  /**
   * Handle embedding errors with retry logic
   */
  private async handleEmbedError(error: any, texts: string[]): Promise<number[][]> {
    console.error('[LMStudioEmbedder] Embedding failed:', error);
    
    // If model was unloaded externally (by LM Studio UI or VRAM pressure), reload it
    const needsReload = 
      error.message?.includes('not loaded') || 
      error.message?.includes('not found') ||
      error.message?.includes('unloaded') ||
      error.message?.includes('Cannot find model');
    
    if (needsReload) {
      console.log('[LMStudioEmbedder] Model was unloaded externally, reloading...');
      this.isLoaded = false;
      this.embeddingModel = null;
      await this.load();
      return this.embed(texts); // Retry once
    }
    
    throw error;
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
