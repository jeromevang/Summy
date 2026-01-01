import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { LMStudioClient } from '@lmstudio/sdk';
import { ModelDiscoveryResult, DiscoveredModel } from './types.js';

export class ModelDiscoveryService {
  async discoverAll(settings: any): Promise<ModelDiscoveryResult> {
    const [lmstudio, openai] = await Promise.all([
      this.discoverLMStudio(settings.lmstudioUrl),
      this.discoverOpenAI(settings.openaiApiKey)
    ]);
    return { lmstudio, openai, azure: [], openrouter: [], lastUpdated: new Date().toISOString() };
  }

  async discoverLMStudio(url?: string): Promise<DiscoveredModel[]> {
    if (!url) return [];
    try {
      const client = new LMStudioClient();
      const raw = await client.system.listDownloadedModels("llm");
      return raw.map(m => ({ id: m.modelKey, displayName: m.displayName || m.modelKey, provider: 'lmstudio', status: 'untested' }));
    } catch { return []; }
  }

  async discoverOpenAI(key?: string): Promise<DiscoveredModel[]> {
    if (!key) return [];
    try {
      const res = await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      return res.data.data.map((m: any) => ({ id: m.id, displayName: m.id, provider: 'openai', status: 'untested' }));
    } catch { return []; }
  }

  async discoverAzure(config: any): Promise<DiscoveredModel[]> {
    return []; // Placeholder
  }

  async discoverOpenRouter(key?: string): Promise<DiscoveredModel[]> {
    return []; // Placeholder
  }
}

export const modelDiscovery = new ModelDiscoveryService();
