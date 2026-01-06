import { Router } from 'express';
import { LMStudioClient } from '@lmstudio/sdk';
import { loadServerSettings } from '../../services/settings-service.js';
import { modelDiscovery } from '../../services/model-discovery.js';
import { capabilities, TOOL_CATEGORIES, ModelProfile } from '../../modules/tooly/capabilities.js';
import { lookupModelInfo } from '../../services/model-info-lookup.js';
import { calculateBadges, extractBadgeScores } from '../../modules/tooly/badges.js';
import { calculateRecommendations } from '../../modules/tooly/recommendations.js';
import { sanitizeInput } from '../../middleware/validation.js';

const router: Router = Router();

/**
 * GET /api/tooly/models
 * Discover available models from providers
 */
router.get('/models', async (req, res) => {
  try {
    const providerFilter = req.query.provider as string || 'all';
    const validProviders = ['all', 'lmstudio', 'openai', 'azure', 'openrouter'];
    
    if (!validProviders.includes(providerFilter)) {
      return res.status(400).json({
        error: 'Invalid provider',
        message: `Provider must be one of: ${validProviders.join(', ')}`
      });
    }
    
    console.log('[Tooly] Models endpoint called with provider:', providerFilter);
    let settings: any = {};
    settings = await loadServerSettings();

    let lmstudioModels: any[] = [];
    let openaiModels: any[] = [];
    let azureModels: any[] = [];
    let openrouterModels: any[] = [];

    if (providerFilter === 'all' || providerFilter === 'lmstudio') {
      console.log(`[Tooly] Discovering LM Studio models from: ${settings.lmstudioUrl}`);
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
      console.log(`[Tooly] Discovering OpenRouter models`);
      openrouterModels = await modelDiscovery.discoverOpenRouter(settings.openrouterApiKey);
    }

    const models = [
      ...lmstudioModels,
      ...openaiModels,
      ...azureModels,
      ...openrouterModels
    ];

    console.log(`[Tooly] Discovered models (filter: ${providerFilter}): LMStudio=${lmstudioModels.length}, OpenAI=${openaiModels.length}, Azure=${azureModels.length}, OpenRouter=${openrouterModels.length}`);

    const lmstudioAvailable = settings.lmstudioUrl ? true : false;
    const openaiAvailable = !!process.env.OPENAI_API_KEY;
    const azureAvailable = !!(settings.azureResourceName && settings.azureApiKey);
    const openrouterAvailable = !!settings.openrouterApiKey;

    res.json({
      models,
      lastUpdated: new Date().toISOString(),
      providers: {
        lmstudio: lmstudioAvailable,
        openai: openaiAvailable,
        azure: azureAvailable,
        openrouter: openrouterAvailable
      },
      filter: providerFilter
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to discover models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/models/:modelId
 * Get detailed profile for a specific model
 */
router.get('/models/:modelId', async (req, res) => {
  try {
    const modelId = req.params.modelId;
    if (!modelId || modelId.trim() === '') {
      return res.status(400).json({
        error: 'Invalid model ID',
        message: 'Model ID cannot be empty'
      });
    }
    
    const sanitizedModelId = sanitizeInput(modelId);
    let profile = await capabilities.getProfile(sanitizedModelId);

    if (!profile) {
      profile = {
        modelId,
        displayName: modelId.split('/').pop() || modelId,
        provider: modelId.includes('/') ? 'openrouter' : 'lmstudio',
        testedAt: '',
        score: 0,
        enabledTools: [],
        capabilities: {},
        contextLength: 4096,
        role: 'none' as const,
        probeResults: undefined,
        systemPrompt: ''
      } as any;
      (profile as any).scoreBreakdown = {
          ragScore: 0,
          bugDetectionScore: 0,
          architecturalScore: 0,
          navigationScore: 0,
          proactiveScore: 0,
          toolScore: 0,
          reasoningScore: 0,
          intentScore: 0,
          overallScore: 0
        };
    }

    let maxContextLength: number | undefined;
    let trainedForToolUse: boolean | undefined;
    let vision: boolean | undefined;
    try {
      const client = new LMStudioClient();
      const models = await client.system.listDownloadedModels("llm");
      const model = models.find(m => m.modelKey === modelId);
      if (model) {
        maxContextLength = model.maxContextLength;
        trainedForToolUse = model.trainedForToolUse;
        vision = model.vision;
      }
    } catch (e) {
      // Ignore
    }

    res.json({ ...profile, maxContextLength, trainedForToolUse, vision });
  } catch (error: any) {
    console.error('[Tooly] Failed to get model profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/models/:modelId/info
 * Lookup model information from HuggingFace or inference
 */
router.get('/models/:modelId/info', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const skipCache = req.query.refresh === 'true';

    const info = await lookupModelInfo(modelId, skipCache);
    res.json(info);
  } catch (error: any) {
    console.error('[Tooly] Failed to lookup model info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/models/:modelId/detail
 * Get detailed model profile with badges, recommendations, and tool categories
 */
router.get('/models/:modelId/detail', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const profile = await capabilities.getProfile(modelId);

    if (!profile) {
      res.status(404).json({ error: 'Model profile not found' });
      return;
    }

    const badgeScores = extractBadgeScores(profile);
    const badges = calculateBadges(badgeScores);

    const allProfilesForAlts = await capabilities.getAllProfiles();
    const alternatives = allProfilesForAlts
      .filter((p: ModelProfile) => p.modelId !== modelId)
      .map((p: ModelProfile) => ({
        modelId: p.modelId,
        modelName: p.displayName || p.modelId,
        scores: extractBadgeScores(p),
      }));

    const recommendations = calculateRecommendations(badgeScores, alternatives);

    const toolCategories = Object.entries(TOOL_CATEGORIES).map(([name, tools]) => {
      const toolsWithStatus = tools.map(tool => ({
        name: tool,
        enabled: profile.enabledTools?.includes(tool) || false,
        score: profile.capabilities?.[tool]?.score || 0,
      }));

      return {
        name,
        tools: toolsWithStatus,
        enabledCount: toolsWithStatus.filter(t => t.enabled).length,
        totalCount: tools.length,
        score: Math.round(
          toolsWithStatus.filter(t => t.score > 0).reduce((sum, t) => sum + t.score, 0) /
          (toolsWithStatus.filter(t => t.score > 0).length || 1)
        ),
      };
    });

    const scoreBreakdown = {
      ragScore: badgeScores.ragScore,
      bugDetectionScore: badgeScores.bugDetectionScore,
      architecturalScore: badgeScores.architecturalScore,
      navigationScore: badgeScores.navigationScore,
      proactiveScore: badgeScores.proactiveScore,
      toolScore: badgeScores.toolScore,
      reasoningScore: badgeScores.reasoningScore,
      intentScore: badgeScores.intentScore,
      overallScore: profile.score,
    };

    let modelInfo = null;
    try {
      modelInfo = await lookupModelInfo(modelId);
    } catch (e) {
      // Ignore
    }

    res.json({
      ...profile,
      badges,
      recommendations,
      toolCategories,
      scoreBreakdown,
      modelInfo,
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get model detail:', error);
    res.status(500).json({ error: error.message });
  }
});

export const modelsRouter = router;
