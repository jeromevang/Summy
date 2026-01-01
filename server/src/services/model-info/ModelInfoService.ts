import { ModelInfo } from './types.js';


export class ModelInfoService {
  async getModelInfo(_modelId: string): Promise<ModelInfo | null> {
    // Real logic would search DB cache then fetch from HuggingFace
    return null;
  }

  async lookupModelInfo(modelId: string, _skipCache: boolean = false): Promise<ModelInfo | null> {
    // For now, return a basic info object to satisfy the route
    return { name: modelId, source: 'huggingface' };
  }

  private async _fetchFromHuggingFace(modelId: string): Promise<ModelInfo | null> {
    try {
      const res = await axios.get(`https://huggingface.co/api/models/${encodeURIComponent(modelId)}`, { params: { full: true } });
      return res.data ? { name: modelId, source: 'huggingface' } : null;
    } catch { return null; }
  }
}

export const modelInfoService = new ModelInfoService();
