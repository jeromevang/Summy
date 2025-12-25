import { LMStudioClient } from '@lmstudio/sdk';
import { mcpClient } from '../modules/tooly/mcp-client.js';

let sharedLMStudioClient: LMStudioClient | null = null;
let cachedLMStudioStatus = { connected: false, models: [] as string[] };

export const getSharedLMStudioClient = () => {
    if (!sharedLMStudioClient) {
        sharedLMStudioClient = new LMStudioClient();
    }
    return sharedLMStudioClient;
};

export const resetLMStudioClient = () => {
    sharedLMStudioClient = null;
};

export const getFullStatus = async (checkLMStudio = false) => {
    if (checkLMStudio) {
        try {
            const client = getSharedLMStudioClient();
            const loadedModels = await client.llm.listLoaded();
            cachedLMStudioStatus = {
                connected: true,
                models: loadedModels.map(m => m.identifier)
            };
        } catch {
            cachedLMStudioStatus = { connected: false, models: [] };
            sharedLMStudioClient = null;
        }
    }

    const mcpStatus = mcpClient.getStatus();

    return {
        server: 'online',
        websocket: 'connected',
        mcp: mcpStatus.connected ? 'connected' : 'disconnected',
        lmstudio: cachedLMStudioStatus.connected ? 'connected' : 'disconnected',
        lmstudioModels: cachedLMStudioStatus.models
    };
};
