import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { ServerSettings } from '@summy/shared';

const __filename = fileURLToPath(import.meta.url);

export const loadServerSettings = async (): Promise<ServerSettings> => {
    console.log('[Settings] loadServerSettings called');
    try {
        if (await fs.pathExists(SETTINGS_FILE)) {
            const settings = await fs.readJson(SETTINGS_FILE);
            console.log('[Settings] Loaded from JSON file');
            // Override with environment variables if they exist
            const finalSettings = {
                ...settings,
                openrouterApiKey: process.env.OPENROUTER_API_KEY || settings.openrouterApiKey || '',
            };
            console.log('[Settings] Settings loaded successfully');
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
