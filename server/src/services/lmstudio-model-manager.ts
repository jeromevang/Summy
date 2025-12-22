/**
 * LM Studio Model Manager
 * Centralized singleton service for managing LM Studio chat/LLM model loading
 * 
 * POLICY:
 * - Load on demand (only when needed)
 * - Keep loaded (never auto-unload)
 * - Reuse existing (if model is already loaded, use it even if context differs)
 * - NEVER unload embedding models (they use a separate namespace: client.embedding)
 * - Only unload when explicitly requested (e.g., to free VRAM)
 */

import { LMStudioClient } from '@lmstudio/sdk';
import { wsBroadcast } from './ws-broadcast.js';

export interface LoadedModelState {
  modelId: string;
  contextSize: number;
  loadedAt: Date;
}

class LMStudioModelManager {
  private static instance: LMStudioModelManager;
  
  // Current state (tracked internally, synced with LM Studio)
  private loadedModel: LoadedModelState | null = null;
  
  // Mutex to prevent concurrent load operations
  private isLoading: boolean = false;
  private loadPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): LMStudioModelManager {
    if (!LMStudioModelManager.instance) {
      LMStudioModelManager.instance = new LMStudioModelManager();
    }
    return LMStudioModelManager.instance;
  }

  /**
   * Create a new LM Studio client
   */
  private createClient(): LMStudioClient {
    return new LMStudioClient();
  }

  /**
   * Check if a model is loaded in LM Studio (by path or identifier)
   */
  private async getLoadedLLMModel(modelId: string): Promise<{ identifier: string; path: string } | null> {
    try {
      const client = this.createClient();
      const loadedModels = await client.llm.listLoaded();
      
      // Find the model by path or identifier
      const found = loadedModels.find(m => 
        m.path === modelId || 
        m.identifier === modelId ||
        m.path?.endsWith(modelId.split('/').pop() || '')
      );
      
      return found ? { identifier: found.identifier, path: found.path } : null;
    } catch {
      return null;
    }
  }

  /**
   * Sync internal state with LM Studio's actual loaded models
   */
  async syncState(): Promise<void> {
    try {
      const client = this.createClient();
      const loadedModels = await client.llm.listLoaded();
      
      if (loadedModels.length === 0) {
        this.loadedModel = null;
        console.log('[ModelManager] Synced: No LLM models loaded');
      } else {
        // Track the first loaded model (we support one at a time for now)
        const first = loadedModels[0];
        this.loadedModel = {
          modelId: first.path || first.identifier,
          contextSize: 0, // Unknown from API
          loadedAt: new Date()
        };
        console.log(`[ModelManager] Synced: Found ${loadedModels.length} LLM model(s), tracking ${first.identifier}`);
      }
    } catch (error: any) {
      console.log(`[ModelManager] Could not sync state: ${error.message}`);
    }
  }

  /**
   * Ensure a model is loaded with the specified context size.
   * 
   * BEHAVIOR:
   * - Unloads ALL other LLM models first (clean slate, no stale models)
   * - Loads the requested model fresh
   * - Embedding models are NEVER touched (separate API)
   * 
   * @param modelId Model path or identifier
   * @param contextSize Context size for the model
   */
  async ensureLoaded(modelId: string, contextSize: number): Promise<void> {
    // Wait for any pending load operation
    if (this.loadPromise) {
      console.log(`[ModelManager] Waiting for pending load operation...`);
      await this.loadPromise;
    }

    // Check if the exact model with exact context is already loaded
    if (this.loadedModel?.modelId === modelId && this.loadedModel?.contextSize === contextSize) {
      // Verify it's actually loaded in LM Studio
      const existing = await this.getLoadedLLMModel(modelId);
      if (existing) {
        console.log(`[ModelManager] Model ${modelId} already loaded with context ${contextSize}, skipping`);
        return;
      }
    }

    // Load the model (this will unload all other LLMs first)
    this.isLoading = true;
    this.loadPromise = this.doLoad(modelId, contextSize);
    
    try {
      await this.loadPromise;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  /**
   * Internal method to perform the actual load
   * Unloads ALL LLM models first (to avoid OOM and stale models)
   * Embedding models use a separate API (client.embedding) and are NEVER touched
   */
  private async doLoad(modelId: string, contextSize: number, _unloadFirst?: string): Promise<void> {
    const client = this.createClient();

    // Unload ALL LLM models to free VRAM and remove stale models
    // Note: client.llm only manages chat/LLM models, NOT embedding models
    try {
      const loadedModels = await client.llm.listLoaded();
      
      if (loadedModels.length > 0) {
        console.log(`[ModelManager] Unloading ${loadedModels.length} LLM model(s) before loading new one...`);
      }
      
      for (const model of loadedModels) {
        try {
          console.log(`[ModelManager] Unloading LLM: ${model.identifier}`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloading', 'Switching models...');
          await client.llm.unload(model.identifier);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloaded', 'Unloaded');
        } catch (error: any) {
          console.log(`[ModelManager] Could not unload ${model.identifier}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.log(`[ModelManager] Could not list loaded models: ${error.message}`);
    }

    // Clear state
    this.loadedModel = null;

    // Load the requested model
    try {
      console.log(`[ModelManager] Loading ${modelId} with context ${contextSize}...`);
      wsBroadcast.broadcastModelLoading(modelId, 'loading', `Loading with ${contextSize} context...`);
      
      await client.llm.load(modelId, {
        config: { contextLength: contextSize }
      });

      // Update state
      this.loadedModel = {
        modelId,
        contextSize,
        loadedAt: new Date()
      };

      console.log(`[ModelManager] Loaded ${modelId} with context ${contextSize}`);
      wsBroadcast.broadcastModelLoading(modelId, 'loaded', `Loaded with ${contextSize} context`);
      
    } catch (error: any) {
      console.error(`[ModelManager] Failed to load ${modelId}: ${error.message}`);
      wsBroadcast.broadcastModelLoading(modelId, 'failed', error.message);
      
      // Check if model is already loaded (race condition with LM Studio UI)
      if (error.message?.includes('already loaded')) {
        const existing = await this.getLoadedLLMModel(modelId);
        if (existing) {
          this.loadedModel = {
            modelId: existing.path || existing.identifier,
            contextSize: 0, // Unknown
            loadedAt: new Date()
          };
          console.log(`[ModelManager] Model was already loaded (possibly from LM Studio UI)`);
          return;
        }
      }
      
      // Check if VRAM is full
      if (error.message?.includes('VRAM') || error.message?.includes('memory') || error.message?.includes('OOM')) {
        console.error(`[ModelManager] VRAM insufficient - user should manually unload models in LM Studio`);
      }
      
      throw error;
    }
  }

  /**
   * Unload all LLM models (explicit user action)
   * NOTE: This does NOT unload embedding models
   */
  async unloadAllLLM(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }

    const client = this.createClient();

    try {
      const loadedModels = await client.llm.listLoaded();
      
      for (const model of loadedModels) {
        try {
          console.log(`[ModelManager] Unloading LLM ${model.identifier}...`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloading', 'Unloading');
          await client.llm.unload(model.identifier);
          console.log(`[ModelManager] Unloaded LLM ${model.identifier}`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloaded', 'Model unloaded');
        } catch (error: any) {
          console.log(`[ModelManager] Could not unload ${model.identifier}: ${error.message}`);
        }
      }

      this.loadedModel = null;
      console.log(`[ModelManager] All LLM models unloaded`);
    } catch (error: any) {
      console.log(`[ModelManager] Could not unload models: ${error.message}`);
    }
  }

  /**
   * Unload a specific model (explicit user action)
   */
  async unloadModel(modelId: string): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }

    const client = this.createClient();

    try {
      // Find the model
      const existing = await this.getLoadedLLMModel(modelId);
      if (!existing) {
        console.log(`[ModelManager] Model ${modelId} not loaded, nothing to unload`);
        return;
      }

      console.log(`[ModelManager] Unloading ${existing.identifier}...`);
      wsBroadcast.broadcastModelLoading(existing.identifier, 'unloading', 'Unloading');
      await client.llm.unload(existing.identifier);
      
      if (this.loadedModel?.modelId === modelId || this.loadedModel?.modelId === existing.identifier) {
        this.loadedModel = null;
      }
      
      console.log(`[ModelManager] Unloaded ${existing.identifier}`);
      wsBroadcast.broadcastModelLoading(existing.identifier, 'unloaded', 'Model unloaded');
    } catch (error: any) {
      console.log(`[ModelManager] Could not unload ${modelId}: ${error.message}`);
    }
  }

  // Legacy alias for backwards compatibility
  async unloadAll(): Promise<void> {
    return this.unloadAllLLM();
  }

  /**
   * Check if a specific model is loaded
   */
  async isModelLoaded(modelId: string): Promise<boolean> {
    const existing = await this.getLoadedLLMModel(modelId);
    return existing !== null;
  }

  /**
   * Check if any model is loaded (based on our state)
   */
  isAnyModelLoaded(): boolean {
    return this.loadedModel !== null;
  }

  /**
   * Get the currently loaded model info
   */
  getLoadedModel(): LoadedModelState | null {
    return this.loadedModel;
  }

  /**
   * Check if a load operation is in progress
   */
  isLoadInProgress(): boolean {
    return this.isLoading;
  }

  /**
   * Clear internal state (useful for testing or resync)
   */
  clearState(): void {
    this.loadedModel = null;
    console.log(`[ModelManager] State cleared`);
  }

  /**
   * Cleanup on server startup - unload all stale LLM models
   * This ensures a clean slate when the server restarts
   * NOTE: Does NOT touch embedding models (separate API)
   */
  async cleanupOnStartup(): Promise<void> {
    console.log(`[ModelManager] Startup cleanup - checking for stale LLM models...`);
    
    try {
      const client = this.createClient();
      const loadedModels = await client.llm.listLoaded();
      
      if (loadedModels.length === 0) {
        console.log(`[ModelManager] Startup: No stale LLM models found`);
        return;
      }
      
      console.log(`[ModelManager] Startup: Found ${loadedModels.length} stale LLM model(s), unloading...`);
      
      for (const model of loadedModels) {
        try {
          console.log(`[ModelManager] Startup: Unloading stale LLM: ${model.identifier}`);
          await client.llm.unload(model.identifier);
          console.log(`[ModelManager] Startup: Unloaded ${model.identifier}`);
        } catch (error: any) {
          console.log(`[ModelManager] Startup: Could not unload ${model.identifier}: ${error.message}`);
        }
      }
      
      this.loadedModel = null;
      console.log(`[ModelManager] Startup cleanup complete - LLM models cleared`);
      
    } catch (error: any) {
      // LM Studio might not be running at startup - that's OK
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
        console.log(`[ModelManager] Startup: LM Studio not running (will connect when needed)`);
      } else {
        console.log(`[ModelManager] Startup: Could not check for stale models: ${error.message}`);
      }
    }
  }
}

// Export singleton instance
export const modelManager = LMStudioModelManager.getInstance();
