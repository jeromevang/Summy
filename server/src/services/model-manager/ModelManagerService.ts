


import { ModelMetadata, ModelDiscoveryResult } from './types.js';

export class ModelManager {
  private static instance: ModelManager;
  private _models: Map<string, ModelMetadata> = new Map();

  static getInstance(): ModelManager {
    if (!ModelManager.instance) ModelManager.instance = new ModelManager();
    return ModelManager.instance;
  }

  get models(): Map<string, ModelMetadata> {
    return this._models;
  }

  async discoverModels(): Promise<ModelDiscoveryResult> {
    const results: ModelMetadata[] = [];
    // Real logic would call discoverLMStudioModels, discoverOpenAIModels, etc.
    return { models: results, providers: { lmstudio: false, openai: false, azure: false, openrouter: false }, lastUpdated: new Date().toISOString(), totalModels: results.length };
  }

  getModels(criteria?: any): ModelMetadata[] {
    let models = Array.from(this._models.values());

    if (criteria) {
      if (criteria.provider) models = models.filter(m => m.provider === criteria.provider);
      if (criteria.role) models = models.filter(m => m.role === criteria.role);
      if (criteria.category) models = models.filter(m => m.category === criteria.category);
      if (criteria.status) models = models.filter(m => m.status === criteria.status);
      if (criteria.minScore !== undefined) models = models.filter(m => (m.score || 0) >= criteria.minScore);
      if (criteria.maxLatency !== undefined) models = models.filter(m => (m.avgLatency || 0) <= criteria.maxLatency);
    }

    return models;
  }

  getModel(modelId: string): ModelMetadata | undefined {
    return this._models.get(modelId);
  }

  updateModel(modelId: string, updates: Partial<ModelMetadata>): void {
    const model = this._models.get(modelId);
    if (model) {
      Object.assign(model, updates);
    }
  }

  disableModel(modelId: string, reason?: string): void {
    const model = this._models.get(modelId);
    if (model) {
      model.status = 'disabled';
      model.error = reason || 'Manually disabled';
    }
  }

  enableModel(modelId: string): void {
    const model = this._models.get(modelId);
    if (model) {
      model.status = 'tested';
      model.error = undefined;
    }
  }

  getRecommendations(criteria: any): ModelMetadata[] {
    const models = this.getModels(criteria);
    return models.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  async healthCheckAll(): Promise<any[]> {
    const results = [];
    for (const [modelId] of this._models) {
      results.push(await this.healthCheckModel(modelId));
    }
    return results;
  }

  async healthCheckModel(_modelId: string): Promise<any> {
    // Real logic would test model connectivity
    return { status: 'healthy', responseTime: 0 };
  }
}

export const modelManager = ModelManager.getInstance();
