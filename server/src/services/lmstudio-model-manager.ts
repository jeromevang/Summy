/**
 * LM Studio Model Manager
 * Centralized singleton service for managing LM Studio model loading/unloading
 * 
 * This service:
 * - Tracks which model is currently loaded and with what context size
 * - Prevents duplicate load/unload operations
 * - Provides a unified API for all components
 * - Uses mutex to prevent race conditions during load operations
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
  
  // Current state
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
   * Sync internal state with LM Studio's actual loaded models
   * Call this to refresh state if uncertain
   */
  async syncState(): Promise<void> {
    try {
      const client = this.createClient();
      const loadedModels = await client.llm.listLoaded();
      
      if (loadedModels.length === 0) {
        this.loadedModel = null;
        console.log('[ModelManager] Synced: No models loaded');
      } else if (loadedModels.length === 1) {
        // If one model is loaded but we don't have state, update it
        // Note: We can't know the context size from the API, so we use a placeholder
        if (!this.loadedModel || this.loadedModel.modelId !== loadedModels[0].identifier) {
          this.loadedModel = {
            modelId: loadedModels[0].identifier,
            contextSize: 0, // Unknown - will be updated on next ensureLoaded
            loadedAt: new Date()
          };
          console.log(`[ModelManager] Synced: Found loaded model ${loadedModels[0].identifier} (context unknown)`);
        }
      } else {
        // Multiple models loaded - unusual state, keep first one
        console.log(`[ModelManager] Synced: ${loadedModels.length} models loaded, tracking first`);
        this.loadedModel = {
          modelId: loadedModels[0].identifier,
          contextSize: 0,
          loadedAt: new Date()
        };
      }
    } catch (error: any) {
      console.log(`[ModelManager] Could not sync state: ${error.message}`);
    }
  }

  /**
   * Ensure a model is loaded with the specified context size
   * This is the main API - it will:
   * - Skip if same model with same context is already loaded
   * - Unload and reload if context differs
   * - Unload other models and load the requested one
   */
  async ensureLoaded(modelId: string, contextSize: number): Promise<void> {
    // Wait for any pending load operation
    if (this.loadPromise) {
      console.log(`[ModelManager] Waiting for pending load operation...`);
      await this.loadPromise;
    }

    // Check if already loaded with correct context
    if (this.loadedModel?.modelId === modelId && this.loadedModel?.contextSize === contextSize) {
      console.log(`[ModelManager] Model ${modelId} already loaded with context ${contextSize}, skipping`);
      return;
    }

    // Check if same model but different context - need to reload
    if (this.loadedModel?.modelId === modelId && this.loadedModel?.contextSize !== contextSize) {
      console.log(`[ModelManager] Model ${modelId} loaded with different context (${this.loadedModel.contextSize} vs ${contextSize}), reloading...`);
    }

    // Start loading
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
   */
  private async doLoad(modelId: string, contextSize: number): Promise<void> {
    const client = this.createClient();

    // Step 1: Unload all currently loaded models
    try {
      const loadedModels = await client.llm.listLoaded();
      
      for (const model of loadedModels) {
        try {
          console.log(`[ModelManager] Unloading ${model.identifier}...`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloading', 'Unloading to prepare for new model');
          await client.llm.unload(model.identifier);
          console.log(`[ModelManager] Unloaded ${model.identifier}`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloaded', 'Model unloaded');
        } catch (error: any) {
          console.log(`[ModelManager] Could not unload ${model.identifier}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.log(`[ModelManager] Could not list loaded models: ${error.message}`);
    }

    // Clear our state since we unloaded
    this.loadedModel = null;

    // Step 2: Load the requested model
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
      
      // Don't throw if model is already loaded (race condition with LM Studio UI)
      if (error.message?.includes('already loaded')) {
        this.loadedModel = {
          modelId,
          contextSize: 0, // Unknown context since loaded externally
          loadedAt: new Date()
        };
        console.log(`[ModelManager] Model was already loaded (possibly from LM Studio UI)`);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Unload all models
   */
  async unloadAll(): Promise<void> {
    // Wait for any pending load operation
    if (this.loadPromise) {
      await this.loadPromise;
    }

    const client = this.createClient();

    try {
      const loadedModels = await client.llm.listLoaded();
      
      for (const model of loadedModels) {
        try {
          console.log(`[ModelManager] Unloading ${model.identifier}...`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloading', 'Unloading');
          await client.llm.unload(model.identifier);
          console.log(`[ModelManager] Unloaded ${model.identifier}`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'unloaded', 'Model unloaded');
        } catch (error: any) {
          console.log(`[ModelManager] Could not unload ${model.identifier}: ${error.message}`);
          wsBroadcast.broadcastModelLoading(model.identifier, 'failed', `Unload failed: ${error.message}`);
        }
      }

      this.loadedModel = null;
      console.log(`[ModelManager] All models unloaded`);
    } catch (error: any) {
      console.log(`[ModelManager] Could not unload models: ${error.message}`);
    }
  }

  /**
   * Unload a specific model
   */
  async unloadModel(modelId: string): Promise<void> {
    // Wait for any pending load operation
    if (this.loadPromise) {
      await this.loadPromise;
    }

    const client = this.createClient();

    try {
      console.log(`[ModelManager] Unloading ${modelId}...`);
      wsBroadcast.broadcastModelLoading(modelId, 'unloading', 'Unloading');
      await client.llm.unload(modelId);
      
      if (this.loadedModel?.modelId === modelId) {
        this.loadedModel = null;
      }
      
      console.log(`[ModelManager] Unloaded ${modelId}`);
      wsBroadcast.broadcastModelLoading(modelId, 'unloaded', 'Model unloaded');
    } catch (error: any) {
      console.log(`[ModelManager] Could not unload ${modelId}: ${error.message}`);
      wsBroadcast.broadcastModelLoading(modelId, 'failed', `Unload failed: ${error.message}`);
    }
  }

  /**
   * Check if a specific model is loaded
   */
  isModelLoaded(modelId: string): boolean {
    return this.loadedModel?.modelId === modelId;
  }

  /**
   * Check if a specific model is loaded with a specific context size
   */
  isModelLoadedWithContext(modelId: string, contextSize: number): boolean {
    return this.loadedModel?.modelId === modelId && this.loadedModel?.contextSize === contextSize;
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
}

// Export singleton instance
export const modelManager = LMStudioModelManager.getInstance();
