import { LMStudioClient } from '@lmstudio/sdk';
import { mcpClient } from '../modules/tooly/mcp-client.js';

/**
 * A shared instance of the LMStudioClient to avoid re-instantiation.
 */
let sharedLMStudioClient: LMStudioClient | null = null;
/**
 * Cached status of the LM Studio connection and loaded models.
 */
let cachedLMStudioStatus = { connected: false, models: [] as string[] };

/**
 * Retrieves a shared singleton instance of the LMStudioClient.
 * If an instance doesn't exist, it creates one.
 * @returns The shared LMStudioClient instance.
 */
export const getSharedLMStudioClient = (): LMStudioClient => {
    if (!sharedLMStudioClient) {
        sharedLMStudioClient = new LMStudioClient();
    }
    return sharedLMStudioClient;
};

/**
 * Resets the shared LMStudioClient instance, forcing a new one to be created on the next request.
 */
export const resetLMStudioClient = (): void => {
    sharedLMStudioClient = null;
};

/**
 * Gathers a comprehensive status report for the server, including MCP and LM Studio connectivity.
 * @param checkLMStudio - If true, actively attempts to connect to LM Studio to get the latest status.
 * @returns An object containing the overall server status, including MCP and LM Studio details.
 */
export const getFullStatus = async (checkLMStudio: boolean = false) => {
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
            sharedLMStudioClient = null; // Reset client on connection failure
        }
    }

    const mcpStatus = mcpClient.getStatus();

    return {
        server: 'online',
        websocket: 'connected', // Assuming websocket is always connected if server is online
        mcp: mcpStatus.connected ? 'connected' : 'disconnected',
        lmstudio: cachedLMStudioStatus.connected ? 'connected' : 'disconnected',
        lmstudioModels: cachedLMStudioStatus.models
    };
};
