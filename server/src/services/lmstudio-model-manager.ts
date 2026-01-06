/**
 * LM Studio Model Manager
 * Centralized singleton service for managing LM Studio chat/LLM model loading.
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

/**
 * Represents the state of a currently loaded model in LM Studio.
 */
export interface LoadedModelState {
  /** The identifier or path of the loaded model. */
  modelId: string;
  /** The context size configured for the loaded model. */
  contextSize: number;
  /** The timestamp when the model was loaded. */
  loadedAt: Date;
}

/**
 * Singleton service for managing LM Studio LLM models.
 * Handles loading, unloading, and state synchronization with the LM Studio server.
 */
class LMStudioModelManager {
  private static instance: LMStudioModelManager;
  
  /** The current state of the loaded LLM model. */
  private loadedModel: LoadedModelState | null = null;
  
  /** Flag to indicate if a load operation is currently in progress. */
  private isLoading: boolean = false;
  /** Promise tracking the current load operation to prevent concurrent calls. */
  private loadPromise: Promise<void> | null = null;

  /**
   * Private constructor to enforce the singleton pattern.
   */
  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Retrieves the singleton instance of the LMStudioModelManager.
   * @returns The singleton instance.
   */
  static getInstance(): LMStudioModelManager {
    if (!LMStudioModelManager.instance) {
      LMStudioModelManager.instance = new LMStudioModelManager();
    }
    return LMStudioModelManager.instance;
  }

  /**
   * Creates a new instance of the LM Studio client.
   * @returns A new LMStudioClient instance.
   */
  private createClient(): LMStudioClient {
    return new LMStudioClient();
  }

  /**
   * Checks if a specific LLM model is currently loaded in LM Studio.
   * @param modelId - The identifier or path of the model to check.
   * @returns A promise that resolves with an object containing the model's identifier and path if loaded, otherwise null.
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
   * Synchronizes the internal state of the manager with the actual models loaded in LM Studio.
   * @returns A promise that resolves when the state is synchronized.
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
        if (first) {
          this.loadedModel = {
            modelId: first.path || first.identifier,
            contextSize: 0, // Unknown from API
            loadedAt: new Date()
          };
          console.log(`[ModelManager] Synced: Found ${loadedModels.length} LLM model(s), tracking ${first.identifier}`);
        }
      }
    } catch (error: any) {
      console.log(`[ModelManager] Could not sync state: ${error.message}`);
    }
  }

  /**
   * Ensures that a specific LLM model is loaded with the given context size.
   * It will unload any other LLM models first to ensure a clean slate.
   * Embedding models are not affected.
   * @param modelId - The identifier or path of the model to load.
   * @param contextSize - The desired context size for the model.
   * @returns A promise that resolves when the model is loaded.
   * @throws An error if the model fails to load.
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
   * Internal method to perform the actual model loading.
   * Unloads all existing LLM models before loading the new one to prevent conflicts and free VRAM.
   * Embedding models (managed by client.embedding) are explicitly not touched by this process.
   * @param modelId - The identifier or path of the model to load.
   * @param contextSize - The context size to configure for the model.
   * @returns A promise that resolves when the model is loaded.
   * @throws An error if the model fails to load.
   */
  private async doLoad(modelId: string, contextSize: number): Promise<void> {
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
   * Unloads all currently loaded LLM models from LM Studio.
   * This does NOT affect embedding models.
   * @returns A promise that resolves when all LLM models have been unloaded.
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
   * Unloads a specific model from LM Studio.
   * @param modelId - The identifier or path of the model to unload.
   * @returns A promise that resolves when the model is unloaded.
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

  /**
   * Legacy alias for `unloadAllLLM` for backwards compatibility.
   * @deprecated Use `unloadAllLLM` instead.
   * @returns A promise that resolves when all LLM models are unloaded.
   */
  async unloadAll(): Promise<void> {
    return this.unloadAllLLM();
  }

  /**
   * Checks if a specific model is currently loaded.
   * @param modelId - The identifier or path of the model to check.
   * @returns A promise that resolves to true if the model is loaded, false otherwise.
   */
  async isModelLoaded(modelId: string): Promise<boolean> {
    const existing = await this.getLoadedLLMModel(modelId);
    return existing !== null;
  }

  /**
   * Checks if any LLM model is currently loaded according to the manager's state.
   * @returns True if an LLM model is loaded, false otherwise.
   */
  isAnyModelLoaded(): boolean {
    return this.loadedModel !== null;
  }

  /**
   * Retrieves information about the currently loaded LLM model.
   * @returns The `LoadedModelState` object if a model is loaded, otherwise null.
   */
  getLoadedModel(): LoadedModelState | null {
    return this.loadedModel;
  }

  /**
   * Checks if a model loading operation is currently in progress.
   * @returns True if a load is in progress, false otherwise.
   */
  isLoadInProgress(): boolean {
    return this.isLoading;
  }

  /**
   * Clears the internal state of the model manager.
   * Useful for testing or when a manual resynchronization is desired.
   */
  clearState(): void {
    this.loadedModel = null;
    console.log(`[ModelManager] State cleared`);
  }

  /**
   * Cleanup on server startup - unload all stale LLM models
   * This ensures a clean slate when the server restarts
   * NOTE: Does NOT touch embedding models (separate API)
   * @returns A promise that resolves when the cleanup is complete.
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
/**
 * The singleton instance of the LMStudioModelManager.
 */
export const modelManager = LMStudioModelManager.getInstance();
