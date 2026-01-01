import express, { Router } from 'express';
import { loadServerSettings, saveServerSettings } from '../services/settings-service.js';
import { modelManager } from '../services/lmstudio-model-manager.js';
import { capabilities } from '../modules/tooly/capabilities.js';
import axios from 'axios';
import { testSandbox } from '../modules/tooly/test-sandbox.js';
import { prostheticPromptBuilder } from '../modules/tooly/orchestrator/prosthetic-prompt-builder.js';
import { cacheService } from '../services/cache/cache-service.js';
import { debugLog } from '../services/logger.js';
import { db } from '../services/database.js';
import { ServerSettings } from '@summy/shared';
import { getSharedLMStudioClient, resetLMStudioClient } from '../services/lmstudio-status.js';

const router: Router = express.Router();

// ============================================================
// SETTINGS API
// ============================================================

router.get('/settings', async (_req, res) => {
    try {
        const settings = await loadServerSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const currentSettings = await loadServerSettings();
        const newSettings: ServerSettings = {
            ...currentSettings,
            ...req.body // Corrected to use req instead of _req
        };
        await saveServerSettings(newSettings);
        res.json(newSettings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// ============================================================
// PROVIDER STATUS & TESTING
// ============================================================

router.get('/lmstudio/status', async (_req, res) => {
    try {
        const client = getSharedLMStudioClient();
        const loadedModels = await client.llm.listLoaded();
        res.json({
            connected: true,
            loadedModels: loadedModels.length,
            models: loadedModels.map((m: any) => m.identifier)
        });
    } catch (error: any) {
        resetLMStudioClient();
        res.json({ connected: false, reason: error.message });
    }
});

// Ensured all code paths return values
router.post('/lmstudio/load-model', async (req, res) => {
    try {
        const { model, contextLength } = req.body;
        const settings = await loadServerSettings();
        if (!model) return res.status(400).json({ success: false, error: 'No model specified' });

        const ctx = contextLength || settings.defaultContextLength || 8192;
        await modelManager.ensureLoaded(model, ctx);

        settings.lmstudioModel = model;
        await saveServerSettings(settings);

        res.json({ success: true, message: `Model ${model} loaded successfully`, model });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
    return; // Added return statement
});

router.get('/openai/models', async (_req, res) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

        const response = await axios.get('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 10000
        });

        const chatModels = response.data.data
            .filter((m: any) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('chatgpt'))
            .map((m: any) => m.id)
            .sort();

        res.json({ models: chatModels });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch models' });
    }
    return; // Added return statement
});

// Corrected req usage in /test-lmstudio
router.post('/test-lmstudio', async (req, res) => {
    try {
        const { url } = req.body;
        const testUrl = url || (await loadServerSettings()).lmstudioUrl;
        const response = await axios.get(`${testUrl}/v1/models`, { timeout: 5000 });
        res.json({ success: true, models: response.data?.data || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Corrected req usage in /test-openrouter
router.post('/test-openrouter', async (_req, res) => {
    try {
        const settings = await loadServerSettings();
        const apiKey = settings.openrouterApiKey;

        if (!apiKey) {
            return res.status(400).json({ success: false, error: 'OpenRouter API key not configured in .env file' });
        }

        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const models = response.data?.data || [];
        if (models.length === 0) {
            return res.status(500).json({ success: false, error: 'No models returned' });
        }

        res.json({ success: true, models: models.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
    return; // Added return statement
});

// ============================================================
// SANDBOX & PROSTHETIC
// ============================================================

router.post('/tooly/sandbox/enter', async (_req, res) => {
    try {
        const config = await testSandbox.enter();
        res.json({ success: true, config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/tooly/sandbox/exit', async (_req, res) => {
    try {
        await testSandbox.exit();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/tooly/sandbox/status', (_req, res) => {
    res.json({ active: testSandbox.getState().active });
});

// Corrected type mismatch in prostheticPromptBuilder.build
router.post('/tooly/prosthetic/generate', async (req, res) => {
    try {
        const { modelId } = req.body;
        if (!modelId) return res.status(400).json({ error: 'Model ID is required' });

        const profile = await capabilities.getProfile(modelId);
        if (!profile || !profile.testResults) return res.status(404).json({ error: 'Results missing' });

        const results = profile.testResults.map((r: any) => ({
            testId: r.testId, passed: r.passed, score: r.score, details: r.error || 'Passed'
        }));

        const config = prostheticPromptBuilder.build({
            modelId: profile.modelId,
            results,
            toolScore: profile.score,
            ragScore: 0,
            reasoningScore: 0,
            intentScore: 0
        });

        res.json({ success: true, config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
    return; // Added return statement
});

// ============================================================
// SYSTEM UTILITIES (Health, Status, Reset)
// ============================================================

router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/status', async (_req, res) => {
    try {
        const settings = await loadServerSettings();
        
        let mainModel = null;
        let executorModel = null;

        if (settings.enableDualModel) {
            if (settings.mainModelId) {
                const profile = await capabilities.getProfile(settings.mainModelId);
                mainModel = { id: settings.mainModelId, name: profile?.displayName || settings.mainModelId };
            }
            if (settings.executorModelId) {
                const profile = await capabilities.getProfile(settings.executorModelId);
                executorModel = { id: settings.executorModelId, name: profile?.displayName || settings.executorModelId };
            }
        } else if (settings.lmstudioModel) {
             // In single model mode, treat it as Main
             const profile = await capabilities.getProfile(settings.lmstudioModel);
             mainModel = { id: settings.lmstudioModel, name: profile?.displayName || settings.lmstudioModel };
        }

        res.json({
            online: true,
            port: process.env.PORT || 3001,
            ngrokUrl: process.env.NGROK_URL || null,
            provider: settings.provider || 'lmstudio',
            model: settings.provider === 'lmstudio' ? settings.lmstudioModel : settings.openaiModel,
            swarm: {
                main: mainModel,
                executor: executorModel
            }
        });
    } catch (error) {
        res.json({ online: true, port: 3001 });
    }
});

router.delete('/tooly/reset', async (_req, res) => {
    try {
        const sessionsDeleted = db.clearAllContextSessions();
        const profiles = await capabilities.getAllProfiles();
        for (const p of profiles) await capabilities.deleteProfile(p.modelId);
        debugLog.length = 0;
        res.json({ success: true, deleted: { sessions: sessionsDeleted, profiles: profiles.length } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Cache stats endpoint
router.get('/cache/stats', async (_req, res) => {
    try {
        const stats = cacheService.getStats();
        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

// Cache clear endpoint
router.delete('/cache/clear', async (_req, res) => {
    try {
        cacheService.clearAll();
        res.json({ success: true, message: 'All caches cleared' });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to clear caches' });
    }
});

export default router;
