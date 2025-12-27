import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../settings.json');

export interface ServerSettings {
    provider: 'openai' | 'azure' | 'lmstudio' | 'openrouter';
    openaiModel: string;
    azureResourceName: string;
    azureDeploymentName: string;
    azureApiKey: string;
    azureApiVersion: string;
    lmstudioUrl: string;
    lmstudioModel: string;
    openrouterApiKey: string;
    openrouterModel: string;
    defaultCompressionMode: 0 | 1 | 2 | 3;
    defaultKeepRecent: number;
    defaultContextLength?: number;
    proxyMode?: 'passthrough' | 'summy' | 'tooly' | 'both';
    enableDualModel?: boolean;
    mainModelId?: string;
    executorModelId?: string;
}

export const loadServerSettings = async (): Promise<ServerSettings> => {
    console.log('[Settings] loadServerSettings called');
    try {
        if (await fs.pathExists(SETTINGS_FILE)) {
            const settings = await fs.readJson(SETTINGS_FILE);
            console.log('[Settings] Loaded from JSON, openrouterApiKey exists:', !!settings.openrouterApiKey);
            console.log('[Settings] OPENROUTER_API_KEY env var exists:', !!process.env.OPENROUTER_API_KEY);
            // Override with environment variables if they exist
            const finalSettings = {
                ...settings,
                openrouterApiKey: process.env.OPENROUTER_API_KEY || settings.openrouterApiKey || '',
            };
            console.log('[Settings] Final openrouterApiKey exists:', !!finalSettings.openrouterApiKey);
            return finalSettings;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    return {
        provider: 'openai',
        openaiModel: 'gpt-4o-mini',
        azureResourceName: '',
        azureDeploymentName: '',
        azureApiKey: '',
        azureApiVersion: '2024-02-01',
        lmstudioUrl: 'http://localhost:1234',
        lmstudioModel: '',
        openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
        openrouterModel: '',
        defaultCompressionMode: 1,
        defaultKeepRecent: 5,
        defaultContextLength: 8192,
        proxyMode: 'both',
        enableDualModel: false,
        mainModelId: '',
        executorModelId: ''
    };
};

export const saveServerSettings = async (settings: ServerSettings): Promise<void> => {
    await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
};
