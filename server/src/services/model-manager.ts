/**
 * Enhanced Model Management Service
 * Provides advanced model discovery, categorization, and management capabilities
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { LMStudioClient } from '@lmstudio/sdk';
import { addDebugEntry } from './logger.js';
import { cacheService } from './cache/cache-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export type ModelProvider = 'lmstudio' | 'openai' | 'azure' | 'openrouter';
export type ModelStatus = 'tested' | 'untested' | 'failed' | 'known_good' | 'disabled';
export type ModelRole = 'main' | 'executor' | 'both' | 'none';
export type ModelCategory = 'general' | 'coding' | 'creative' | 'analysis' | 'specialized';

export interface ModelMetadata {
  id: string;
  displayName: string;
  provider: ModelProvider;
  status: ModelStatus;
  role: ModelRole;
  category: ModelCategory;
  
  // Performance metrics
  score?: number;
  toolScore?: number;
  reasoningScore?: number;
  avgLatency?: number;
  testedAt?: string;
  error?: string;
  
  // Technical specifications
  maxContextLength?: number;
  trainedForToolUse?: boolean;
  vision?: boolean;
  sizeBytes?: number;
  quantization?: string;
  parameters?: number;
  
  // Cost and usage
  costPerToken?: number;
  freeTier?: boolean;
  requiresKey?: boolean;
  
  // Compatibility
  supportsStreaming?: boolean;
  supportsFunctions?: boolean;
  supportsVision?: boolean;
  supportsJSON?: boolean;
  
  // Health monitoring
  lastHealthCheck?: string;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  failureCount?: number;
  successRate?: number;
  
  // Usage tracking
  lastUsed?: string;
  usageCount?: number;
  totalTokens?: number;
}

export interface ModelDiscoveryResult {
  models: ModelMetadata[];
  providers: { [key in ModelProvider]: boolean };
  lastUpdated: string;
  totalModels: number;
}

export interface ModelRecommendation {
  model: ModelMetadata;
  score: number;
  reasons: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ModelHealthCheck {
  modelId: string;
  provider: ModelProvider;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'error';
  responseTime: number;
  error?: string;
  timestamp: string;
}

// ============================================================
// MODEL CATEGORIES AND ROLES
// ============================================================

const MODEL_CATEGORIES: Record<string, ModelCategory> = {
  // General purpose models
  'gpt-4': 'general',
  'gpt-3.5-turbo': 'general',
  'llama': 'general',
  'mistral': 'general',
  
  // Coding focused models
  'codex': 'coding',
  'code-llama': 'coding',
  'starCoder': 'coding',
  'deepseek-coder': 'coding',
  
  // Creative models
  'dall-e': 'creative',
  'stable-diffusion': 'creative',
  'midjourney': 'creative',
  
  // Analysis models
  'gpt-4-vision': 'analysis',
  'claude': 'analysis',
  'gemini': 'analysis',
  
  // Specialized models
  'medical': 'specialized',
  'legal': 'specialized',
  'financial': 'specialized'
};

const MODEL_ROLES: Record<string, ModelRole> = {
  // Main models (good at reasoning, planning)
  'gpt-4': 'main',
  'claude': 'main',
  'gemini': 'main',
  
  // Executor models (good at tool use)
  'gpt-3.5-turbo': 'executor',
  'llama': 'executor',
  'mistral': 'executor',
  
  // Universal models
  'gpt-4-turbo': 'both',
  'claude-sonnet': 'both'
};

// ============================================================
// MODEL MANAGEMENT SERVICE
// ============================================================

export class ModelManager {
  private static instance: ModelManager;
  private models: Map<string, ModelMetadata> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * Initialize the model manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadModels();
      await this.startHealthMonitoring();
      this.isInitialized = true;
      addDebugEntry('session', 'Model manager initialized');
    } catch (error) {
      addDebugEntry('error', `Failed to initialize model manager: ${error}`);
    }
  }

  /**
   * Discover and catalog all available models
   */
  async discoverModels(): Promise<ModelDiscoveryResult> {
    addDebugEntry('session', 'Starting model discovery...');
    
    const results: ModelMetadata[] = [];
    const providers: { [key in ModelProvider]: boolean } = {
      lmstudio: false,
      openai: false,
      azure: false,
      openrouter: false
    };

    try {
      // Discover LM Studio models
      const lmstudioModels = await this.discoverLMStudioModels();
      results.push(...lmstudioModels);
      providers.lmstudio = lmstudioModels.length > 0;

      // Discover OpenAI models
      const openaiModels = await this.discoverOpenAIModels();
      results.push(...openaiModels);
      providers.openai = openaiModels.length > 0;

      // Discover Azure models
      const azureModels = await this.discoverAzureModels();
      results.push(...azureModels);
      providers.azure = azureModels.length > 0;

      // Discover OpenRouter models
      const openrouterModels = await this.discoverOpenRouterModels();
      results.push(...openrouterModels);
      providers.openrouter = openrouterModels.length > 0;

      // Update internal state
      results.forEach(model => {
        this.models.set(model.id, model);
      });

      // Cache the results
      cacheService.setModelProfile('discovery', {
        models: results,
        providers,
        lastUpdated: new Date().toISOString(),
        totalModels: results.length
      });

      addDebugEntry('session', `Discovered ${results.length} models across ${Object.values(providers).filter(Boolean).length} providers`);
      return {
        models: results,
        providers,
        lastUpdated: new Date().toISOString(),
        totalModels: results.length
      };

    } catch (error) {
      addDebugEntry('error', `Model discovery failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get models by criteria
   */
  getModels(criteria: {
    provider?: ModelProvider;
    role?: ModelRole;
    category?: ModelCategory;
    status?: ModelStatus;
    minScore?: number;
    maxLatency?: number;
  } = {}): ModelMetadata[] {
    const { provider, role, category, status, minScore, maxLatency } = criteria;
    
    let models = Array.from(this.models.values());

    if (provider) {
      models = models.filter(m => m.provider === provider);
    }
    if (role) {
      models = models.filter(m => m.role === role);
    }
    if (category) {
      models = models.filter(m => m.category === category);
    }
    if (status) {
      models = models.filter(m => m.status === status);
    }
    if (minScore !== undefined) {
      models = models.filter(m => (m.score || 0) >= minScore);
    }
    if (maxLatency !== undefined) {
      models = models.filter(m => (m.avgLatency || 0) <= maxLatency);
    }

    return models.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): ModelMetadata | null {
    return this.models.get(modelId) || null;
  }

  /**
   * Update model metadata
   */
  updateModel(modelId: string, updates: Partial<ModelMetadata>): void {
    const model = this.models.get(modelId);
    if (model) {
      this.models.set(modelId, { ...model, ...updates });
      addDebugEntry('session', `Updated model ${modelId}: ${Object.keys(updates).join(', ')}`);
    }
  }

  /**
   * Disable a model
   */
  disableModel(modelId: string, reason: string): void {
    this.updateModel(modelId, {
      status: 'disabled',
      error: reason,
      lastHealthCheck: new Date().toISOString()
    });
    addDebugEntry('warning', `Disabled model ${modelId}: ${reason}`);
  }

  /**
   * Enable a model
   */
  enableModel(modelId: string): void {
    this.updateModel(modelId, {
      status: 'untested',
      error: undefined,
      lastHealthCheck: new Date().toISOString()
    });
    addDebugEntry('session', `Enabled model ${modelId}`);
  }

  /**
   * Get model recommendations
   */
  getRecommendations(criteria: {
    role: ModelRole;
    minScore?: number;
    maxLatency?: number;
    preferredProviders?: ModelProvider[];
  }): ModelRecommendation[] {
    const { role, minScore = 70, maxLatency = 10000, preferredProviders = [] } = criteria;

    let candidates = this.getModels({
      role: role === 'both' ? undefined : role,
      status: 'tested',
      minScore,
      maxLatency
    });

    // Filter by preferred providers if specified
    if (preferredProviders.length > 0) {
      candidates = candidates.filter(m => preferredProviders.includes(m.provider));
    }

    // Calculate recommendation scores
    const recommendations: ModelRecommendation[] = candidates.map(model => {
      let score = model.score || 0;
      const reasons: string[] = [];

      // Boost score based on various factors
      if (model.provider === 'openai') {
        score += 5;
        reasons.push('OpenAI reliability');
      }
      if (model.supportsStreaming) {
        score += 3;
        reasons.push('Streaming support');
      }
      if (model.avgLatency && model.avgLatency < 5000) {
        score += 2;
        reasons.push('Low latency');
      }
      if (model.trainedForToolUse) {
        score += 4;
        reasons.push('Tool use training');
      }

      const confidence: 'high' | 'medium' | 'low' = 
        model.score && model.score > 85 ? 'high' :
        model.score && model.score > 70 ? 'medium' : 'low';

      return {
        model,
        score,
        reasons,
        confidence
      };
    });

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10 recommendations
  }

  /**
   * Health check all models
   */
  async healthCheckAll(): Promise<ModelHealthCheck[]> {
    const results: ModelHealthCheck[] = [];
    const models = Array.from(this.models.values());

    addDebugEntry('session', `Starting health check for ${models.length} models...`);

    for (const model of models) {
      try {
        const result = await this.healthCheckModel(model.id);
        results.push(result);
      } catch (error) {
        results.push({
          modelId: model.id,
          provider: model.provider,
          status: 'error',
          responseTime: 0,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Update model health status
    results.forEach(result => {
      this.updateModel(result.modelId, {
        healthStatus: result.status === 'healthy' ? 'healthy' : 'unhealthy',
        lastHealthCheck: result.timestamp,
        failureCount: result.status === 'healthy' ? 0 : (this.models.get(result.modelId)?.failureCount || 0) + 1
      });
    });

    addDebugEntry('session', `Health check completed: ${results.filter(r => r.status === 'healthy').length} healthy models`);
    return results;
  }

  /**
   * Health check a specific model
   */
  async healthCheckModel(modelId: string): Promise<ModelHealthCheck> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const startTime = Date.now();

    try {
      // Simple health check - try to get model info or send a test request
      switch (model.provider) {
        case 'lmstudio':
          return await this.healthCheckLMStudio(model);
        case 'openai':
          return await this.healthCheckOpenAI(model);
        case 'azure':
          return await this.healthCheckAzure(model);
        case 'openrouter':
          return await this.healthCheckOpenRouter(model);
        default:
          throw new Error(`Unknown provider: ${model.provider}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        modelId,
        provider: model.provider,
        status: 'unhealthy',
        responseTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheckAll();
      } catch (error) {
        addDebugEntry('error', `Health monitoring error: ${error}`);
      }
    }, 5 * 60 * 1000);

    addDebugEntry('session', 'Health monitoring started (every 5 minutes)');
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      addDebugEntry('session', 'Health monitoring stopped');
    }
  }

  /**
   * Load models from cache or discovery
   */
  private async loadModels(): Promise<void> {
    try {
      // Try to load from cache first
      const cached = await cacheService.getModelProfile('discovery');
      if (cached && cached.models) {
        cached.models.forEach(model => {
          this.models.set(model.id, model);
        });
        addDebugEntry('session', `Loaded ${cached.models.length} models from cache`);
        return;
      }

      // Fall back to discovery
      await this.discoverModels();
    } catch (error) {
      addDebugEntry('error', `Failed to load models: ${error}`);
    }
  }

  /**
   * Discover LM Studio models
   */
  private async discoverLMStudioModels(): Promise<ModelMetadata[]> {
    try {
      const client = new LMStudioClient();
      const models = await client.models.list();
      
      return models.map(model => ({
        id: model.identifier,
        displayName: model.identifier,
        provider: 'lmstudio',
        status: 'untested' as ModelStatus,
        role: this.detectModelRole(model.identifier),
        category: this.detectModelCategory(model.identifier),
        sizeBytes: model.sizeBytes,
        quantization: model.quantization,
        maxContextLength: model.contextWindowSize,
        trainedForToolUse: true,
        supportsStreaming: true,
        supportsFunctions: true,
        supportsVision: model.vision,
        testedAt: undefined,
        error: undefined
      }));
    } catch (error) {
      addDebugEntry('error', `LM Studio discovery failed: ${error}`);
      return [];
    }
  }

  /**
   * Discover OpenAI models
   */
  private async discoverOpenAIModels(): Promise<ModelMetadata[]> {
    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });

      return response.data.data.map(model => ({
        id: model.id,
        displayName: model.id,
        provider: 'openai',
        status: 'untested' as ModelStatus,
        role: this.detectModelRole(model.id),
        category: this.detectModelCategory(model.id),
        maxContextLength: model.context_window || 128000,
        trainedForToolUse: true,
        supportsStreaming: true,
        supportsFunctions: true,
        supportsJSON: true,
        testedAt: undefined,
        error: undefined
      }));
    } catch (error) {
      addDebugEntry('error', `OpenAI discovery failed: ${error}`);
      return [];
    }
  }

  /**
   * Discover Azure models
   */
  private async discoverAzureModels(): Promise<ModelMetadata[]> {
    try {
      // Azure discovery logic here
      return [];
    } catch (error) {
      addDebugEntry('error', `Azure discovery failed: ${error}`);
      return [];
    }
  }

  /**
   * Discover OpenRouter models
   */
  private async discoverOpenRouterModels(): Promise<ModelMetadata[]> {
    try {
      const response = await axios.get('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      });

      return response.data.data.map(model => ({
        id: model.id,
        displayName: model.name || model.id,
        provider: 'openrouter',
        status: 'untested' as ModelStatus,
        role: this.detectModelRole(model.id),
        category: this.detectModelCategory(model.id),
        maxContextLength: model.context_length || 128000,
        trainedForToolUse: model.capabilities?.tools || false,
        supportsStreaming: true,
        supportsFunctions: true,
        testedAt: undefined,
        error: undefined
      }));
    } catch (error) {
      addDebugEntry('error', `OpenRouter discovery failed: ${error}`);
      return [];
    }
  }

  /**
   * Health check LM Studio model
   */
  private async healthCheckLMStudio(model: ModelMetadata): Promise<ModelHealthCheck> {
    const startTime = Date.now();
    try {
      const client = new LMStudioClient();
      await client.models.load(model.id);
      await client.models.unload(model.id);
      
      return {
        modelId: model.id,
        provider: 'lmstudio',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Health check OpenAI model
   */
  private async healthCheckOpenAI(model: ModelMetadata): Promise<ModelHealthCheck> {
    const startTime = Date.now();
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: model.id,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return {
        modelId: model.id,
        provider: 'openai',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Health check Azure model
   */
  private async healthCheckAzure(model: ModelMetadata): Promise<ModelHealthCheck> {
    // Azure health check logic
    throw new Error('Azure health check not implemented');
  }

  /**
   * Health check OpenRouter model
   */
  private async healthCheckOpenRouter(model: ModelMetadata): Promise<ModelHealthCheck> {
    const startTime = Date.now();
    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: model.id,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return {
        modelId: model.id,
        provider: 'openrouter',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Detect model role based on ID
   */
  private detectModelRole(modelId: string): ModelRole {
    for (const [pattern, role] of Object.entries(MODEL_ROLES)) {
      if (modelId.toLowerCase().includes(pattern.toLowerCase())) {
        return role;
      }
    }
    return 'both'; // Default to both roles
  }

  /**
   * Detect model category based on ID
   */
  private detectModelCategory(modelId: string): ModelCategory {
    for (const [pattern, category] of Object.entries(MODEL_CATEGORIES)) {
      if (modelId.toLowerCase().includes(pattern.toLowerCase())) {
        return category;
      }
    }
    return 'general'; // Default to general
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.stopHealthMonitoring();
    this.models.clear();
    this.isInitialized = false;
    addDebugEntry('session', 'Model manager shutdown complete');
  }
}

// Export singleton instance
export const modelManager = ModelManager.getInstance();
