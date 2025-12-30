import { Router } from 'express';
import { LMStudioClient } from '@lmstudio/sdk';
import { loadServerSettings } from '../../services/settings-service.js';
import { modelDiscovery } from '../../services/model-discovery.js';
import { capabilities, ALL_TOOLS, ModelProfile } from '../../modules/tooly/capabilities.js';
import { lookupModelInfo } from '../../services/model-info-lookup.js';
import { sanitizeInput } from '../../middleware/validation.js';

const router = Router();

/**
 * GET /api/tooly/models
 * Discover available models from providers
 */
router.get('/models', async (req, res) => {
  try {
    const providerFilter = req.query.provider as string || 'all';
    const validProviders = ['all', 'lmstudio', 'openai', 'azure', 'openrouter'];
    
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        error: `Provider must be one of: ${validProviders.join(', ')}`
      });
    }
    
    const settings = await loadServerSettings();
    let lmstudioModels: any[] = [];
    let openaiModels: any[] = [];
    let azureModels: any[] = [];
    let openrouterModels: any[] = [];

    if (providerFilter === 'all' || providerFilter === 'lmstudio') {
      lmstudioModels = await modelDiscovery.discoverLMStudio(settings.lmstudioUrl);
    }
    if (providerFilter === 'all' || providerFilter === 'openai') {
      openaiModels = await modelDiscovery.discoverOpenAI(process.env.OPENAI_API_KEY);
    }
    if (providerFilter === 'all' || providerFilter === 'azure') {
      azureModels = await modelDiscovery.discoverAzure({
        azureResourceName: settings.azureResourceName,
        azureApiKey: settings.azureApiKey,
        azureDeploymentName: settings.azureDeploymentName
      });
    }
    if (providerFilter === 'all' || providerFilter === 'openrouter') {
      openrouterModels = await modelDiscovery.discoverOpenRouter(settings.openrouterApiKey);
    }

    const models = [...lmstudioModels, ...openaiModels, ...azureModels, ...openrouterModels];

    res.json({
      models,
      lastUpdated: new Date().toISOString(),
      providers: {
        lmstudio: !!settings.lmstudioUrl,
        openai: !!process.env.OPENAI_API_KEY,
        azure: !!(settings.azureResourceName && settings.azureApiKey),
        openrouter: !!settings.openrouterApiKey
      },
      filter: providerFilter
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/models/:modelId
 */
router.get('/models/:modelId', async (req, res) => {
  try {
    const modelId = sanitizeInput(req.params.modelId);
    let profile = await capabilities.getProfile(modelId);

    if (!profile) {
      profile = {
        modelId,
        displayName: modelId.split('/').pop() || modelId,
        provider: modelId.includes('/') ? 'openrouter' : 'lmstudio',
        testedAt: '', score: 0, enabledTools: [], capabilities: {},
        maxContextLength: 4096, role: 'none' as const, probeResults: null,
        systemPrompt: '', badges: [], recommendations: [],
        scoreBreakdown: { ragScore: 0, bugDetectionScore: 0, architecturalScore: 0, navigationScore: 0, proactiveScore: 0, toolScore: 0, reasoningScore: 0, intentScore: 0, overallScore: 0 }
      };
    }

    let maxContextLength, trainedForToolUse, vision;
    try {
      const client = new LMStudioClient();
      const models = await client.system.listDownloadedModels("llm");
      const model = models.find(m => m.modelKey === modelId);
      if (model) {
        maxContextLength = model.maxContextLength;
        trainedForToolUse = model.trainedForToolUse;
        vision = model.vision;
      }
    } catch (e) {}

    res.json({ ...profile, maxContextLength, trainedForToolUse, vision });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/models/:modelId/info
 */
router.get('/models/:modelId/info', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const skipCache = req.query.refresh === 'true';
    const info = await lookupModelInfo(modelId, skipCache);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/results
 */
router.delete('/models/:modelId/results', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    let profile = await capabilities.getProfile(modelId);
    if (!profile) return res.status(404).json({ error: 'Model profile not found' });

    profile.score = 0; profile.testVersion = 0; profile.testedAt = '';
    profile.capabilities = {}; profile.role = 'none';
    (profile as any).scoreBreakdown = undefined;
    (profile as any).probeResults = undefined;
    (profile as any).discoveredNativeTools = undefined;
    (profile as any).unmappedNativeTools = undefined;

    await capabilities.saveProfile(profile);
    res.json({ success: true, message: 'Test results cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/tools/:tool
 */
router.put('/models/:modelId/tools/:tool', async (req, res) => {
  try {
    const { modelId, tool } = req.params;
    const { enabled } = req.body;
    const profile = await capabilities.getProfile(decodeURIComponent(modelId));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    if (enabled) {
      if (!profile.enabledTools.includes(tool)) profile.enabledTools.push(tool);
    } else {
      profile.enabledTools = profile.enabledTools.filter(t => t !== tool);
    }

    await capabilities.saveProfile(profile);
    res.json({ success: true, enabledTools: profile.enabledTools });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/prompt
 */
router.put('/models/:modelId/prompt', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { systemPrompt } = req.body;
    const profile = await capabilities.getProfile(decodeURIComponent(modelId));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    profile.systemPrompt = systemPrompt;
    await capabilities.saveProfile(profile);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/context-length
 */
router.put('/models/:modelId/context-length', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { contextLength } = req.body;
    const profile = await capabilities.getProfile(decodeURIComponent(modelId));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    profile.maxContextLength = contextLength;
    await capabilities.saveProfile(profile);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/context-length
 */
router.delete('/models/:modelId/context-length', async (req, res) => {
  try {
    const { modelId } = req.params;
    const profile = await capabilities.getProfile(decodeURIComponent(modelId));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    profile.maxContextLength = undefined;
    await capabilities.saveProfile(profile);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/profile
 */
router.delete('/models/:modelId/profile', async (req, res) => {
  try {
    const { modelId } = req.params;
    const success = await capabilities.deleteProfile(decodeURIComponent(modelId));
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/alias
 */
router.put('/models/:modelId/alias', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const { nativeToolName, mcpTool } = req.body;
    if (!nativeToolName) return res.status(400).json({ error: 'Missing nativeToolName' });

    let profile = await capabilities.getProfile(modelId);
    if (!profile) return res.status(404).json({ error: 'Model profile not found' });

    for (const tool of ALL_TOOLS) {
      if (profile.capabilities[tool]?.nativeAliases) {
        profile.capabilities[tool].nativeAliases = profile.capabilities[tool].nativeAliases!.filter(a => a !== nativeToolName);
      }
    }

    if (!profile.unmappedNativeTools) profile.unmappedNativeTools = [];

    if (mcpTool && ALL_TOOLS.includes(mcpTool)) {
      if (!profile.capabilities[mcpTool]) profile.capabilities[mcpTool] = { supported: false, score: 0, testsPassed: 0, testsFailed: 0 };
      if (!profile.capabilities[mcpTool].nativeAliases) profile.capabilities[mcpTool].nativeAliases = [];
      if (!profile.capabilities[mcpTool].nativeAliases!.includes(nativeToolName)) profile.capabilities[mcpTool].nativeAliases!.push(nativeToolName);
      profile.unmappedNativeTools = profile.unmappedNativeTools.filter(t => t !== nativeToolName);
    } else {
      if (!profile.unmappedNativeTools.includes(nativeToolName)) profile.unmappedNativeTools.push(nativeToolName);
    }

    await capabilities.saveProfile(profile);
    res.json({ success: true, nativeToolName, mcpTool: mcpTool || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
