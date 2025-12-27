/**
 * Model Discovery Service
 * Queries LM Studio and OpenAI to discover available models
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { LMStudioClient } from '@lmstudio/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

export type ModelStatus = 'tested' | 'untested' | 'failed' | 'known_good';

export interface DiscoveredModel {
  id: string;
  displayName: string;
  provider: 'lmstudio' | 'openai' | 'azure';
  status: ModelStatus;
  score?: number;
  toolScore?: number;
  reasoningScore?: number;
  toolCount?: number;
  totalTools?: number;
  avgLatency?: number;
  testedAt?: string;
  error?: string;
  role?: 'main' | 'executor' | 'both' | 'none';
  maxContextLength?: number;
  trainedForToolUse?: boolean;
  vision?: boolean;
  sizeBytes?: number;
  quantization?: string;
}

export interface ModelDiscoveryResult {
  lmstudio: DiscoveredModel[];
  openai: DiscoveredModel[];
  azure: DiscoveredModel[];
  openrouter: DiscoveredModel[];
  lastUpdated: string;
}

// ============================================================
// KNOWN OPENAI MODELS
// ============================================================

// OpenAI models known to support function calling
const KNOWN_GOOD_OPENAI_MODELS = [
  { id: 'gpt-4o', displayName: 'GPT-4o', toolCount: 22 },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', toolCount: 22 },
  { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', toolCount: 22 },
  { id: 'gpt-4-turbo-preview', displayName: 'GPT-4 Turbo Preview', toolCount: 22 },
  { id: 'gpt-4', displayName: 'GPT-4', toolCount: 22 },
  { id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', toolCount: 22 },
];

// Models without function calling support
const NO_TOOL_SUPPORT = ['o1', 'o1-mini', 'o1-preview'];

// ============================================================
// MODEL PROFILES PATH
// ============================================================

const MODEL_PROFILES_DIR = path.join(__dirname, '../../data/model-profiles');

// ============================================================
// MODEL DISCOVERY SERVICE
// ============================================================

class ModelDiscoveryService {
  /**
   * Discover all available models from all providers
   */
  async discoverAll(settings: {
    lmstudioUrl?: string;
    openaiApiKey?: string;
    azureResourceName?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
    openrouterApiKey?: string;
  }): Promise<ModelDiscoveryResult> {
    const [lmstudio, openai, azure, openrouter] = await Promise.all([
      this.discoverLMStudio(settings.lmstudioUrl),
      this.discoverOpenAI(settings.openaiApiKey),
      this.discoverAzure(settings),
      this.discoverOpenRouter(settings.openrouterApiKey)
    ]);

    return {
      lmstudio,
      openai,
      azure,
      openrouter,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Discover LM Studio models using the SDK
   * Returns maxContextLength, trainedForToolUse, and vision from model info
   */
  async discoverLMStudio(lmstudioUrl?: string): Promise<DiscoveredModel[]> {
    // We still need lmstudioUrl to know if user has configured LM Studio
    if (!lmstudioUrl) return [];

    try {
      const client = new LMStudioClient();
      
      // Use SDK to list all downloaded LLM models
      const rawModels = await client.system.listDownloadedModels("llm");
      
      // Deduplicate models - remove :2, :3, etc. suffixes if base model exists
      const modelKeys = new Set(rawModels.map(m => m.modelKey));
      const filteredModels = rawModels.filter(model => {
        const modelId = model.modelKey;
        
        // Check if this is a duplicate (ends with :N)
        const match = modelId.match(/^(.+):(\d+)$/);
        if (match) {
          const baseId = match[1];
          // If base model exists, skip this duplicate
          if (modelKeys.has(baseId)) {
            console.log(`[ModelDiscovery] Skipping duplicate: ${modelId} (base: ${baseId})`);
            return false;
          }
        }
        return true;
      });

      // First pass: collect models with SDK quantization
      const modelsWithoutQuant: { modelId: string; index: number }[] = [];
      const models: DiscoveredModel[] = [];

      for (const model of filteredModels) {
        const modelId = model.modelKey;
        const profile = await this.loadModelProfile(modelId);
        
        // Try to get quantization from SDK first
        // Cast to any to check for quantization property (may not be in SDK types yet)
        // Quantization can be string or object {name, bits}
        const sdkQuantization = this.extractQuantizationString((model as any).quantization);

        const entry: DiscoveredModel = {
          id: modelId,
          displayName: model.displayName || this.formatModelName(modelId),
          provider: 'lmstudio',
          status: profile ? (profile.score >= 50 ? 'tested' : 'failed') : 'untested',
          score: profile?.score,
          toolScore: profile?.probeResults?.toolScore,
          reasoningScore: profile?.probeResults?.reasoningScore,
          toolCount: profile?.enabledTools?.length,
          totalTools: 22,
          avgLatency: profile?.avgLatency,
          testedAt: profile?.testedAt,
          role: profile?.role,
          maxContextLength: model.maxContextLength,
          trainedForToolUse: model.trainedForToolUse,
          vision: model.vision,
          sizeBytes: model.sizeBytes,
          quantization: sdkQuantization
        };
        
        if (!sdkQuantization) {
          modelsWithoutQuant.push({ modelId, index: models.length });
        }
        
        models.push(entry);
      }

      // Second pass: fetch quantization for models without SDK data (in parallel, limit 10 at a time)
      if (modelsWithoutQuant.length > 0) {
        console.log(`[ModelDiscovery] Fetching quantization for ${modelsWithoutQuant.length} models...`);
        const batchSize = 10;
        for (let i = 0; i < modelsWithoutQuant.length; i += batchSize) {
          const batch = modelsWithoutQuant.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(({ modelId }) => this.getModelQuantization(lmstudioUrl, modelId))
          );
          results.forEach((quant, j) => {
            if (quant) {
              models[batch[j].index].quantization = quant;
            }
          });
        }
      }

      console.log(`[ModelDiscovery] LM Studio: ${rawModels.length} total, ${models.length} after dedup`);
      return models;

    } catch (error: any) {
      console.log('[ModelDiscovery] LM Studio not available:', error.message);
      return [];
    }
  }

  /**
   * Get quantization level from LM Studio API
   * Uses /api/v0/models/{modelId} endpoint
   * Quantization can be a string or an object {name, bits}
   */
  private async getModelQuantization(lmstudioUrl: string, modelId: string): Promise<string | undefined> {
    try {
      // Extract base URL (remove /v1 suffix if present)
      const baseUrl = lmstudioUrl.replace(/\/v1\/?$/, '');
      const response = await axios.get(`${baseUrl}/api/v0/models/${encodeURIComponent(modelId)}`, {
        timeout: 5000
      });
      
      const quant = response.data?.quantization;
      if (quant) {
        // Handle both string and object {name, bits} format
        if (typeof quant === 'string') {
          return quant;
        } else if (quant.name) {
          return quant.name;
        }
      }
      return undefined;
    } catch (error: any) {
      // Silently fail - quantization is optional
      return undefined;
    }
  }

  /**
   * Extract quantization string from SDK or API response
   * Handles both string and object {name, bits} formats
   */
  private extractQuantizationString(quant: any): string | undefined {
    if (!quant) return undefined;
    if (typeof quant === 'string') return quant;
    if (quant.name) return quant.name;
    return undefined;
  }

  /**
   * Discover OpenAI models
   */
  async discoverOpenAI(apiKey?: string): Promise<DiscoveredModel[]> {
    if (!apiKey) return [];

    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000
      });

      const models: DiscoveredModel[] = [];
      const availableIds = new Set(response.data?.data?.map((m: any) => m.id) || []);

      // Add known good models that are available
      for (const known of KNOWN_GOOD_OPENAI_MODELS) {
        if (availableIds.has(known.id)) {
          models.push({
            id: known.id,
            displayName: known.displayName,
            provider: 'openai',
            status: 'known_good',
            score: 99,
            toolCount: known.toolCount,
            totalTools: 22
          });
        }
      }

      // Add any other chat models
      for (const model of response.data?.data || []) {
        const id = model.id;
        
        // Skip if already added or not a chat model
        if (models.some(m => m.id === id)) continue;
        if (!id.includes('gpt')) continue;
        if (NO_TOOL_SUPPORT.some(n => id.includes(n))) continue;

        const profile = await this.loadModelProfile(id);
        
        models.push({
          id,
          displayName: this.formatModelName(id),
          provider: 'openai',
          status: profile ? 'tested' : 'untested',
          score: profile?.score,
          toolCount: profile?.enabledTools?.length,
          totalTools: 22
        });
      }

      return models;

    } catch (error: any) {
      console.log('[ModelDiscovery] OpenAI not available:', error.message);
      return [];
    }
  }

  /**
   * Discover Azure OpenAI deployments
   */
  async discoverAzure(settings: {
    azureResourceName?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
  }): Promise<DiscoveredModel[]> {
    const { azureResourceName, azureApiKey, azureDeploymentName } = settings;
    
    if (!azureResourceName || !azureApiKey || !azureDeploymentName) {
      return [];
    }

    // Azure doesn't have a models list endpoint, so we just return the configured deployment
    const profile = await this.loadModelProfile(`azure:${azureDeploymentName}`);

    return [{
      id: azureDeploymentName,
      displayName: `Azure: ${azureDeploymentName}`,
      provider: 'azure',
      status: profile ? 'tested' : 'untested',
      score: profile?.score || 99, // Assume Azure deployments are configured correctly
      toolCount: profile?.enabledTools?.length || 22,
      totalTools: 22
    }];
  }

  /**
   * Load model profile from disk
   */
  private async loadModelProfile(modelId: string): Promise<any | null> {
    try {
      const safeName = this.sanitizeFileName(modelId);
      const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);
      
      if (await fs.pathExists(profilePath)) {
        return await fs.readJson(profilePath);
      }
    } catch {
      // Profile doesn't exist
    }
    return null;
  }

  /**
   * Format model name for display
   */
  private formatModelName(id: string): string {
    // Handle common patterns
    return id
      .replace(/-instruct$/i, ' (Instruct)')
      .replace(/-chat$/i, ' (Chat)')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Sanitize model ID for use as filename
   */
  private sanitizeFileName(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Check if a specific provider is available
   */
  async checkProviderAvailability(provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter', settings: any): Promise<boolean> {
    try {
      switch (provider) {
        case 'lmstudio':
          if (!settings.lmstudioUrl) return false;
          const lmResponse = await axios.get(`${settings.lmstudioUrl}/v1/models`, { timeout: 3000 });
          return lmResponse.status === 200;

        case 'openai':
          if (!settings.openaiApiKey) return false;
          const oaiResponse = await axios.get('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${settings.openaiApiKey}` },
            timeout: 5000
          });
          return oaiResponse.status === 200;

        case 'azure':
          if (!settings.azureResourceName || !settings.azureApiKey) return false;
          // For Azure, just check if we have the config - actual validation happens at request time
          return true;

        case 'openrouter':
          if (!settings.openrouterApiKey) return false;
          const orResponse = await axios.get('https://openrouter.ai/api/v1/models', {
            headers: {
              'Authorization': `Bearer ${settings.openrouterApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          });
          return orResponse.status === 200;

        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Discover models from OpenRouter API
   */
  async discoverOpenRouter(apiKey?: string): Promise<DiscoveredModel[]> {
    if (!apiKey) {
      console.log('[ModelDiscovery] No OpenRouter API key provided');
      return [];
    }

    try {
      console.log('[ModelDiscovery] Discovering OpenRouter models...');

      const response = await axios.get('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const models = response.data.data || [];
      console.log(`[ModelDiscovery] Found ${models.length} OpenRouter models`);

      // Filter to free models only (function calling will be simulated client-side)
      const freeModels = models.filter((model: any) => {
        // Check if model is free (pricing info indicates free tier)
        const isFree = model.pricing?.prompt === '0' && model.pricing?.completion === '0';

        // Check if model has reasonable context length
        const hasContext = model.context_length && model.context_length >= 4096;

        return isFree && hasContext;
      });

      console.log(`[ModelDiscovery] Filtered to ${freeModels.length} free models (function calling simulated client-side)`);

      // Convert to our format and sort by "ranking" (using model popularity metrics)
      const discoveredModels: DiscoveredModel[] = freeModels
        .map((model: any) => {
          // Extract provider from model ID (e.g., "openai/gpt-4o" -> "OpenAI")
          const provider = model.id.split('/')[0];
          const providerName = provider === 'openai' ? 'OpenAI' :
                              provider === 'anthropic' ? 'Anthropic' :
                              provider === 'meta' ? 'Meta' :
                              provider === 'google' ? 'Google' :
                              provider.charAt(0).toUpperCase() + provider.slice(1);

          return {
            id: model.id,
            displayName: model.name || model.id.split('/').pop() || model.id,
            provider: 'openrouter' as const,
            status: 'untested',
            maxContextLength: model.context_length,
            trainedForToolUse: model.capabilities?.includes('tools'),
            vision: model.capabilities?.includes('vision'),
            sizeBytes: undefined, // OpenRouter doesn't provide this
            quantization: undefined, // OpenRouter doesn't provide this
            // Add ranking score based on model name popularity
            score: this.getModelRankingScore(model.id)
          };
        })
        .sort((a: DiscoveredModel, b: DiscoveredModel) => (b.score || 0) - (a.score || 0)); // Sort by ranking score descending

      console.log(`[ModelDiscovery] Returning ${discoveredModels.length} OpenRouter models sorted by ranking`);
      return discoveredModels;

    } catch (error: any) {
      console.error('[ModelDiscovery] Failed to discover OpenRouter models:', error.message);
      return [];
    }
  }

  /**
   * Get ranking score for model based on known popularity/popularity
   */
  private getModelRankingScore(modelId: string): number {
    const rankings: Record<string, number> = {
      // GPT-4 level models
      'openai/gpt-4o': 100,
      'openai/gpt-4o-mini': 95,
      'anthropic/claude-3.5-sonnet': 98,
      'anthropic/claude-3-haiku': 90,
      'openai/gpt-4-turbo': 85,
      'openai/gpt-4': 80,

      // GPT-3.5 level
      'openai/gpt-3.5-turbo': 70,

      // Other popular models
      'meta/llama-3.1-70b-instruct': 75,
      'meta/llama-3.1-8b-instruct': 65,
      'google/gemini-pro': 60,
      'google/gemini-flash': 55,

      // Default score for unknown models
      'default': 20
    };

    return rankings[modelId] || rankings['default'];
  }

  /**
   * Health check for OpenRouter models
   */
  async checkOpenRouterModelHealth(modelId: string, apiKey?: string): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
  }> {
    if (!apiKey) {
      return { available: false, error: 'No API key provided' };
    }

    try {
      const startTime = Date.now();
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: modelId,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Summy AI Platform'
        },
        timeout: 10000
      });

      const latency = Date.now() - startTime;
      return { available: true, latency };
    } catch (error: any) {
      return {
        available: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  /**
   * Get quick status without full discovery
   */
  async getQuickStatus(settings: any): Promise<{
    lmstudio: boolean;
    openai: boolean;
    azure: boolean;
    openrouter: boolean;
  }> {
    const [lmstudio, openai, azure, openrouter] = await Promise.all([
      this.checkProviderAvailability('lmstudio', settings),
      this.checkProviderAvailability('openai', settings),
      this.checkProviderAvailability('azure', settings),
      this.checkProviderAvailability('openrouter', settings)
    ]);

    return { lmstudio, openai, azure, openrouter };
  }
}

// Export singleton instance
export const modelDiscovery = new ModelDiscoveryService();

