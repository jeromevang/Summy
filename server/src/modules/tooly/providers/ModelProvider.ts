import axios from 'axios';
import { RouterConfig } from '../types.js';

export class ModelProvider {
  static async call(config: RouterConfig, modelId: string, messages: any[], tools?: any[], timeout: number = 30000): Promise<any> {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = { model: modelId, messages, temperature: 0 };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const provider = this.determineProvider(config, modelId);

    switch (provider) {
      case 'lmstudio':
        url = `${config.settings.lmstudioUrl}/v1/chat/completions`;
        break;
      case 'openai':
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${config.settings.openaiApiKey}`;
        break;
      case 'azure':
        const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = config.settings;
        url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
        headers['api-key'] = azureApiKey!;
        break;
      case 'openrouter':
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${config.settings.openrouterApiKey}`;
        headers['HTTP-Referer'] = 'http://localhost:5173';
        headers['X-Title'] = 'Summy AI Platform';
        break;
      default:
        throw new Error(`Unknown provider for model ${modelId}`);
    }

    const response = await axios.post(url, body, { headers, timeout });
    return response.data;
  }

  private static determineProvider(config: RouterConfig, modelId: string): string {
    if (modelId.startsWith('allenai/') || modelId.startsWith('xiaomi/') ||
        modelId.startsWith('mistralai/') || modelId.startsWith('nvidia/') ||
        modelId.includes(':free') || modelId.includes('/')) return 'openrouter';
    if (modelId.startsWith('lmstudio/') || modelId.startsWith('local')) return 'lmstudio';
    return config.provider || 'lmstudio';
  }
}
