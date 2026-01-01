import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { ServerSettings } from '@summy/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

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
                ollamaModel: process.env.OLLAMA_MODEL || settings.ollamaModel || '',
                ollamaUrl: process.env.OLLAMA_URL || settings.ollamaUrl || 'http://localhost:11434',
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
        ollamaModel: '',
        ollamaUrl: 'http://localhost:11434',
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
