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
  }): Promise<ModelDiscoveryResult> {
    const [lmstudio, openai, azure] = await Promise.all([
      this.discoverLMStudio(settings.lmstudioUrl),
      this.discoverOpenAI(settings.openaiApiKey),
      this.discoverAzure(settings)
    ]);

    return {
      lmstudio,
      openai,
      azure,
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

      const models: DiscoveredModel[] = [];

      for (const model of filteredModels) {
        const modelId = model.modelKey;
        const profile = await this.loadModelProfile(modelId);
        
        // Get quantization from LM Studio API
        const quantization = await this.getModelQuantization(lmstudioUrl, modelId);

        models.push({
          id: modelId,
          displayName: model.displayName || this.formatModelName(modelId),
          provider: 'lmstudio',
          status: profile ? (profile.score >= 50 ? 'tested' : 'failed') : 'untested',
          score: profile?.score,
          toolCount: profile?.enabledTools?.length,
          totalTools: 22,
          avgLatency: profile?.avgLatency,
          testedAt: profile?.testedAt,
          role: profile?.role,
          maxContextLength: model.maxContextLength,
          trainedForToolUse: model.trainedForToolUse,
          vision: model.vision,
          sizeBytes: model.sizeBytes,
          quantization
        });
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
   */
  private async getModelQuantization(lmstudioUrl: string, modelId: string): Promise<string | undefined> {
    try {
      // Extract base URL (remove /v1 suffix if present)
      const baseUrl = lmstudioUrl.replace(/\/v1\/?$/, '');
      const response = await axios.get(`${baseUrl}/api/v0/models/${encodeURIComponent(modelId)}`, {
        timeout: 5000
      });
      
      if (response.data?.quantization) {
        return response.data.quantization;
      }
      return undefined;
    } catch (error: any) {
      // Silently fail - quantization is optional
      return undefined;
    }
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
  async checkProviderAvailability(provider: 'lmstudio' | 'openai' | 'azure', settings: any): Promise<boolean> {
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

        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get quick status without full discovery
   */
  async getQuickStatus(settings: any): Promise<{
    lmstudio: boolean;
    openai: boolean;
    azure: boolean;
  }> {
    const [lmstudio, openai, azure] = await Promise.all([
      this.checkProviderAvailability('lmstudio', settings),
      this.checkProviderAvailability('openai', settings),
      this.checkProviderAvailability('azure', settings)
    ]);

    return { lmstudio, openai, azure };
  }
}

// Export singleton instance
export const modelDiscovery = new ModelDiscoveryService();

