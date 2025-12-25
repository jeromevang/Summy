import axios from 'axios';
import { COMMON_STOP_STRINGS } from './probe-utils.js';

export class ProbeBase {
    protected async callLLM(
        modelId: string,
        provider: 'lmstudio' | 'openai' | 'azure',
        messages: any[],
        tools: any[] | undefined,
        settings: any,
        timeout: number
    ): Promise<any> {
        let url = '';
        const headers: any = { 'Content-Type': 'application/json' };

        let body: any = {
            messages,
            temperature: 0,
            max_tokens: 500
        };

        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        if (provider === 'lmstudio') {
            body.stop = COMMON_STOP_STRINGS;
        }

        switch (provider) {
            case 'lmstudio':
                url = `${settings.lmstudioUrl}/v1/chat/completions`;
                body.model = modelId;
                break;

            case 'openai':
                url = 'https://api.openai.com/v1/chat/completions';
                headers['Authorization'] = `Bearer ${settings.openaiApiKey}`;
                body.model = modelId;
                break;

            case 'azure':
                const { azureResourceName, azureDeploymentName, azureApiKey, azureApiVersion } = settings;
                url = `https://${azureResourceName}.openai.azure.com/openai/deployments/${azureDeploymentName}/chat/completions?api-version=${azureApiVersion || '2024-02-01'}`;
                headers['api-key'] = azureApiKey;
                break;

            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        const response = await axios.post(url, body, {
            headers,
            timeout
        });

        return response.data;
    }

    protected async callLLMNoTools(
        modelId: string,
        provider: 'lmstudio' | 'openai' | 'azure',
        messages: any[],
        settings: any,
        timeout: number
    ): Promise<any> {
        return this.callLLM(modelId, provider, messages, undefined, settings, timeout);
    }
}
