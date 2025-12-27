import express from 'express';
import axios from 'axios';
import { loadServerSettings, saveServerSettings, type ServerSettings } from '../services/settings-service.js';
import { getFullStatus, getSharedLMStudioClient, resetLMStudioClient } from '../services/lmstudio-status.js';
import { modelManager } from '../services/lmstudio-model-manager.js';
import { db } from '../services/database.js';
import { capabilities } from '../modules/tooly/capabilities.js';
import { debugLog, addDebugEntry } from '../services/logger.js';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { prostheticPromptBuilder } from '../modules/tooly/orchestrator/prosthetic-prompt-builder.js';
import { testSandbox } from '../modules/tooly/test-sandbox.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// SETTINGS API
// ============================================================

router.get('/settings', async (req, res) => {
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
            ...req.body
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

router.get('/lmstudio/status', async (req, res) => {
    try {
        const client = getSharedLMStudioClient();
        const loadedModels = await client.llm.listLoaded();
        res.json({
            connected: true,
            loadedModels: loadedModels.length,
            models: loadedModels.map(m => m.identifier)
        });
    } catch (error: any) {
        resetLMStudioClient();
        res.json({ connected: false, reason: error.message });
    }
});

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
});

router.get('/openai/models', async (req, res) => {
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
});

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

router.post('/test-openrouter', async (req, res) => {
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

        // Check if we got models back
        const models = response.data?.data || [];
        if (models.length === 0) {
            return res.status(500).json({ success: false, error: 'No models returned' });
        }

        res.json({ success: true, models: models.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// SANDBOX & PROSTHETIC
// ============================================================

router.post('/tooly/sandbox/enter', async (req, res) => {
    try {
        const config = await testSandbox.enter();
        res.json({ success: true, config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/tooly/sandbox/exit', async (req, res) => {
    try {
        await testSandbox.exit();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/tooly/sandbox/status', (req, res) => {
    res.json({ active: testSandbox.getState().active });
});

router.post('/tooly/prosthetic/generate', async (req, res) => {
    try {
        const { modelId } = req.body;
        if (!modelId) return res.status(400).json({ error: 'Model ID is required' });

        const profile = await capabilities.getProfile(modelId);
        if (!profile || !profile.testResults) return res.status(404).json({ error: 'Results missing' });

        const results = profile.testResults.map(r => ({
            testId: r.testId, passed: r.passed, score: r.score, details: r.error || 'Passed'
        }));

        const config = prostheticPromptBuilder.build({
            modelId: profile.modelId,
            timestamp: profile.testedAt,
            results,
            passedCount: results.filter(r => r.passed).length,
            failedCount: results.filter(r => !r.passed).length,
            overallScore: profile.score,
            scoreBreakdown: { toolScore: profile.score, reasoningScore: 0, overallScore: profile.score }
        } as any);

        res.json({ success: true, config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// SYSTEM UTILITIES (Health, Status, Reset)
// ============================================================

router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/status', async (req, res) => {
    try {
        const settings = await loadServerSettings();
        res.json({
            online: true,
            port: process.env.PORT || 3001,
            ngrokUrl: process.env.NGROK_URL || null,
            provider: settings.provider || 'lmstudio',
            model: settings.provider === 'lmstudio' ? settings.lmstudioModel : settings.openaiModel
        });
    } catch (error) {
        res.json({ online: true, port: 3001 });
    }
});

router.delete('/tooly/reset', async (req, res) => {
    try {
        const sessionsDeleted = db.clearAllContextSessions();
        const profiles = await capabilities.getAllProfiles();
        for (const p of profiles) await capabilities.deleteProfile(p.modelId);
        try {
            const { ragClient } = await import('../services/rag-client.js');
            await ragClient.clearIndex();
        } catch (e) { }
        debugLog.length = 0;
        res.json({ success: true, deleted: { sessions: sessionsDeleted, profiles: profiles.length } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
