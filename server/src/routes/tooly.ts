/**
 * Tooly API Routes
 * Handles model discovery, testing, capabilities, logs, and rollback
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { LMStudioClient } from '@lmstudio/sdk';
import { modelDiscovery } from '../services/model-discovery.js';
import { analytics } from '../services/analytics.js';
import { db } from '../services/database.js';
import { capabilities, ALL_TOOLS, TOOL_CATEGORIES, ModelProfile } from '../modules/tooly/capabilities.js';
import { testEngine, TEST_DEFINITIONS } from '../modules/tooly/test-engine.js';
import { probeEngine, PROBE_CATEGORIES } from '../modules/tooly/probe-engine.js';
import { rollback } from '../modules/tooly/rollback.js';
import { mcpClient } from '../modules/tooly/mcp-client.js';
import { calculateBadges, extractBadgeScores } from '../modules/tooly/badges.js';
import { calculateRecommendations } from '../modules/tooly/recommendations.js';
import { lookupModelInfo } from '../services/model-info-lookup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Settings file path (same as main index.ts)
const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

const router = Router();

// ============================================================
// MODEL DISCOVERY
// ============================================================

/**
 * GET /api/tooly/models
 * Discover available models from providers
 * Query params:
 *   - provider: 'all' | 'lmstudio' | 'openai' | 'azure' (default: 'all')
 */
router.get('/models', async (req, res) => {
  try {
    const providerFilter = (req.query.provider as string) || 'all';
    let settings: any = {};
    
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
        console.log(`[Tooly] Loaded settings, lmstudioUrl: ${settings.lmstudioUrl}`);
      }
    } catch (err: any) {
      console.log(`[Tooly] Error loading settings: ${err.message}`);
    }

    // Discover models based on filter
    let lmstudioModels: any[] = [];
    let openaiModels: any[] = [];
    let azureModels: any[] = [];

    // Fetch from selected providers
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

    // Combine filtered models
    const models = [
      ...lmstudioModels,
      ...openaiModels,
      ...azureModels
    ];

    console.log(`[Tooly] Discovered models (filter: ${providerFilter}): LMStudio=${lmstudioModels.length}, OpenAI=${openaiModels.length}, Azure=${azureModels.length}`);

    // Check which providers are actually available (not just based on filter results)
    const lmstudioAvailable = settings.lmstudioUrl ? true : false;
    const openaiAvailable = !!process.env.OPENAI_API_KEY;
    const azureAvailable = !!(settings.azureResourceName && settings.azureApiKey);

    res.json({
      models,
      lastUpdated: new Date().toISOString(),
      providers: {
        lmstudio: lmstudioAvailable,
        openai: openaiAvailable,
        azure: azureAvailable
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
    const { modelId } = req.params;
    const profile = await capabilities.getProfile(modelId);
    
    if (!profile) {
      res.status(404).json({ error: 'Model profile not found' });
      return;
    }
    
    // Get model info from LM Studio SDK if available
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
      // Ignore - SDK not available
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
    const { modelId } = req.params;
    const skipCache = req.query.refresh === 'true';
    
    const info = await lookupModelInfo(modelId, skipCache);
    res.json(info);
  } catch (error: any) {
    console.error('[Tooly] Failed to lookup model info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/test
 * Run capability tests for a model
 */
router.post('/models/:modelId/test', async (req, res) => {
  try {
    const { modelId } = req.params;
    const body = req.body || {};
    const provider = body.provider || 'lmstudio';
    const tools = body.tools;
    const testMode = body.testMode || 'manual';  // 'quick' | 'keep_on_success' | 'manual'
    
    // Load settings
    let settings: any = {};
    
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }

    // Note: Model loading/unloading is now handled by the centralized modelManager
    // in test-engine.ts via modelManager.ensureLoaded()

    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };

    // Build test options based on mode
    const testOptions = {
      mode: testMode,
      unloadOthersBefore: testMode !== 'manual',
      unloadAfterTest: testMode === 'quick',
      unloadOnlyOnFail: testMode === 'keep_on_success',
      contextLength: 4096 // Minimal context for tool capability testing
    };

    console.log(`[Tooly] Running tests for ${modelId} with mode: ${testMode}`);

    let result;
    if (tools && Array.isArray(tools)) {
      result = await testEngine.runTestsForTools(modelId, provider, tools, testSettings, testOptions);
    } else {
      result = await testEngine.runAllTests(modelId, provider, testSettings, testOptions);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/probe
 * Run probe tests (emit, schema, selection, suppression) for a model
 * This determines the model's role (main, executor, both, none)
 */
router.post('/models/:modelId/probe', async (req, res) => {
  try {
    const { modelId } = req.params;
    const body = req.body || {};
    const provider = body.provider || 'lmstudio';
    const runLatencyProfile = body.runLatencyProfile || false;
    
    // Load settings
    let settings: any = {};
    
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }

    // Note: Model loading/unloading is now handled by the centralized modelManager
    // in probe-engine.ts via modelManager.ensureLoaded()

    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };

    console.log(`[Tooly] Running probe tests for ${modelId}`);

    const result = await probeEngine.runAllProbes(modelId, provider, testSettings, {
      contextLength: 2048, // Minimal context for behavioral probe testing
      timeout: 30000,
      runLatencyProfile,
      // Explicitly enable all probe categories
      runReasoningProbes: true,
      runStrategicProbes: true,
      runArchitecturalProbes: true,
      runNavigationProbes: true,
      runHelicopterProbes: true,
      runProactiveProbes: true,
      runIntentProbes: true,
      quickMode: false,  // Full mode - run all probes
    });

    // Build probe results for saving
    const probeResultsToSave: any = {
      testedAt: result.completedAt,
      // Core tool probes (1.1-1.4)
      emitTest: { passed: result.emitTest.passed, score: result.emitTest.score, details: result.emitTest.details },
      schemaTest: { passed: result.schemaTest.passed, score: result.schemaTest.score, details: result.schemaTest.details },
      selectionTest: { passed: result.selectionTest.passed, score: result.selectionTest.score, details: result.selectionTest.details },
      suppressionTest: { passed: result.suppressionTest.passed, score: result.suppressionTest.score, details: result.suppressionTest.details },
      // Enhanced tool probes (1.5-1.8)
      nearIdenticalSelectionTest: result.nearIdenticalSelectionTest ? { passed: result.nearIdenticalSelectionTest.passed, score: result.nearIdenticalSelectionTest.score, details: result.nearIdenticalSelectionTest.details } : undefined,
      multiToolEmitTest: result.multiToolEmitTest ? { passed: result.multiToolEmitTest.passed, score: result.multiToolEmitTest.score, details: result.multiToolEmitTest.details } : undefined,
      argumentValidationTest: result.argumentValidationTest ? { passed: result.argumentValidationTest.passed, score: result.argumentValidationTest.score, details: result.argumentValidationTest.details } : undefined,
      schemaReorderTest: result.schemaReorderTest ? { passed: result.schemaReorderTest.passed, score: result.schemaReorderTest.score, details: result.schemaReorderTest.details } : undefined,
      // Scores
      toolScore: result.toolScore,
      reasoningScore: result.reasoningScore,
      overallScore: result.overallScore
    };

    // Include reasoning probes if available
    if (result.reasoningProbes) {
      probeResultsToSave.reasoningProbes = {
        intentExtraction: { passed: result.reasoningProbes.intentExtraction.passed, score: result.reasoningProbes.intentExtraction.score, details: result.reasoningProbes.intentExtraction.details },
        multiStepPlanning: { passed: result.reasoningProbes.multiStepPlanning.passed, score: result.reasoningProbes.multiStepPlanning.score, details: result.reasoningProbes.multiStepPlanning.details },
        conditionalReasoning: { passed: result.reasoningProbes.conditionalReasoning.passed, score: result.reasoningProbes.conditionalReasoning.score, details: result.reasoningProbes.conditionalReasoning.details },
        contextContinuity: { passed: result.reasoningProbes.contextContinuity.passed, score: result.reasoningProbes.contextContinuity.score, details: result.reasoningProbes.contextContinuity.details },
        logicalConsistency: { passed: result.reasoningProbes.logicalConsistency.passed, score: result.reasoningProbes.logicalConsistency.score, details: result.reasoningProbes.logicalConsistency.details },
        explanation: { passed: result.reasoningProbes.explanation.passed, score: result.reasoningProbes.explanation.score, details: result.reasoningProbes.explanation.details },
        edgeCaseHandling: { passed: result.reasoningProbes.edgeCaseHandling.passed, score: result.reasoningProbes.edgeCaseHandling.score, details: result.reasoningProbes.edgeCaseHandling.details }
      };
    }

    // Save strategic probes (3.x - 7.x) if available
    if (result.strategicRAGProbes) {
      probeResultsToSave.strategicRAGProbes = result.strategicRAGProbes;
    }
    if (result.architecturalProbes) {
      probeResultsToSave.architecturalProbes = result.architecturalProbes;
    }
    if (result.navigationProbes) {
      probeResultsToSave.navigationProbes = result.navigationProbes;
    }
    if (result.helicopterProbes) {
      probeResultsToSave.helicopterProbes = result.helicopterProbes;
    }
    if (result.proactiveProbes) {
      probeResultsToSave.proactiveProbes = result.proactiveProbes;
    }
    
    // Save intent probes (8.x) if available
    if (result.intentProbes) {
      probeResultsToSave.intentProbes = result.intentProbes;
      probeResultsToSave.intentScores = result.intentScores;
    }
    
    // Save score breakdown if available
    if (result.scoreBreakdown) {
      probeResultsToSave.scoreBreakdown = result.scoreBreakdown;
    }

    // Save probe results to model profile
    await capabilities.updateProbeResults(
      modelId,
      probeResultsToSave,
      result.role,
      result.contextLatency,
      result.scoreBreakdown
    );

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run probe tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/quick-latency
 * Quick latency check at 2K context - used to detect slow models before full testing
 */
router.post('/models/:modelId/quick-latency', async (req, res) => {
  try {
    const { modelId } = req.params;
    const body = req.body || {};
    const provider = body.provider || 'lmstudio';
    
    // Load settings
    let settings: any = {};
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }

    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };

    console.log(`[Tooly] Quick latency check for ${modelId} at 2K context`);

    // Run single latency test at 2K context with 12s timeout
    // If it takes longer than 10s, client will show slow model warning
    const latency = await probeEngine.runQuickLatencyCheck(modelId, provider, testSettings, 12000);

    res.json({ latency, modelId, contextSize: 2048 });
  } catch (error: any) {
    console.error('[Tooly] Quick latency check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/latency-profile
 * Run context latency profiling for a model
 */
router.post('/models/:modelId/latency-profile', async (req, res) => {
  try {
    const { modelId } = req.params;
    const body = req.body || {};
    const provider = body.provider || 'lmstudio';
    
    // Load settings
    let settings: any = {};
    
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }

    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };

    console.log(`[Tooly] Running latency profile for ${modelId}`);

    const result = await probeEngine.runContextLatencyProfile(modelId, provider, testSettings, 30000);

    // Update profile with latency data
    let profile = await capabilities.getProfile(modelId);
    if (profile) {
      profile.contextLatency = result;
      if (!profile.contextLength) {
        profile.contextLength = result.recommendedContext;
      }
      await capabilities.saveProfile(profile);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run latency profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/tools/:tool
 * Toggle a tool for a model
 */
router.put('/models/:modelId/tools/:tool', async (req, res) => {
  try {
    const { modelId, tool } = req.params;
    const { enabled } = req.body;
    
    await capabilities.toggleTool(modelId, tool, enabled);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to toggle tool:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/prompt
 * Update custom system prompt for a model
 */
router.put('/models/:modelId/prompt', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { systemPrompt } = req.body;
    
    await capabilities.updateSystemPrompt(modelId, systemPrompt);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to update prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/context-length
 * Update custom context length for a model
 */
router.put('/models/:modelId/context-length', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { contextLength } = req.body;
    
    if (!contextLength || typeof contextLength !== 'number') {
      res.status(400).json({ error: 'Invalid context length' });
      return;
    }
    
    await capabilities.updateContextLength(modelId, contextLength);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to update context length:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/context-length
 * Remove custom context length (revert to global default)
 */
router.delete('/models/:modelId/context-length', async (req, res) => {
  try {
    const { modelId } = req.params;
    
    await capabilities.removeContextLength(modelId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to remove context length:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/alias
 * Update a native tool alias mapping
 * Body: { nativeToolName: string, mcpTool: string | null }
 * If mcpTool is null, removes the alias (marks as unmapped)
 */
router.put('/models/:modelId/alias', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { nativeToolName, mcpTool } = req.body;
    
    if (!nativeToolName || typeof nativeToolName !== 'string') {
      res.status(400).json({ error: 'Missing or invalid nativeToolName' });
      return;
    }
    
    // Get or create profile
    let profile = await capabilities.getProfile(modelId);
    if (!profile) {
      res.status(404).json({ error: 'Model profile not found' });
      return;
    }
    
    // Remove the alias from ALL MCP tools first
    for (const tool of ALL_TOOLS) {
      if (profile.capabilities[tool]?.nativeAliases) {
        profile.capabilities[tool].nativeAliases = 
          profile.capabilities[tool].nativeAliases!.filter(a => a !== nativeToolName);
      }
    }
    
    // Also update unmappedNativeTools
    if (!profile.unmappedNativeTools) {
      profile.unmappedNativeTools = [];
    }
    
    // If mcpTool is provided, add the alias to that tool
    if (mcpTool && ALL_TOOLS.includes(mcpTool)) {
      if (!profile.capabilities[mcpTool]) {
        profile.capabilities[mcpTool] = { supported: false, score: 0, testsPassed: 0, testsFailed: 0 };
      }
      if (!profile.capabilities[mcpTool].nativeAliases) {
        profile.capabilities[mcpTool].nativeAliases = [];
      }
      if (!profile.capabilities[mcpTool].nativeAliases!.includes(nativeToolName)) {
        profile.capabilities[mcpTool].nativeAliases!.push(nativeToolName);
      }
      
      // Remove from unmapped if it was there
      profile.unmappedNativeTools = profile.unmappedNativeTools.filter(t => t !== nativeToolName);
      
      console.log(`[Tooly] Alias updated: "${nativeToolName}" -> "${mcpTool}" for ${modelId}`);
    } else {
      // Mark as unmapped
      if (!profile.unmappedNativeTools.includes(nativeToolName)) {
        profile.unmappedNativeTools.push(nativeToolName);
      }
      console.log(`[Tooly] Alias removed: "${nativeToolName}" is now unmapped for ${modelId}`);
    }
    
    await capabilities.saveProfile(profile);
    
    res.json({ 
      success: true, 
      nativeToolName,
      mcpTool: mcpTool || null
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to update alias:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TEST DEFINITIONS
// ============================================================

/**
 * GET /api/tooly/tests
 * Get all test definitions
 */
router.get('/tests', (req, res) => {
  res.json({
    tests: TEST_DEFINITIONS,
    totalTests: TEST_DEFINITIONS.length,
    tools: ALL_TOOLS
  });
});

/**
 * GET /api/tooly/tests/:tool
 * Get tests for a specific tool
 */
router.get('/tests/:tool', (req, res) => {
  const { tool } = req.params;
  const tests = testEngine.getTestsForTool(tool);
  res.json({ tests, tool, count: tests.length });
});

// ============================================================
// CUSTOM TEST CRUD
// ============================================================

/**
 * GET /api/tooly/custom-tests
 * Get all custom tests (user-created + built-in probe tests)
 */
router.get('/custom-tests', (req, res) => {
  try {
    const customTests = db.getCustomTests();
    
    // Also include built-in probe tests for display
    const builtInTests = [
      ...PROBE_CATEGORIES.flatMap((cat: any) => 
        cat.probes.map((p: any) => ({
          id: p.id,
          name: p.name,
          category: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.icon,
          prompt: p.prompt,
          expectedTool: p.expectedTool,
          expectedBehavior: p.expectedBehavior,
          difficulty: 'medium',
          isBuiltin: true,
        }))
      )
    ];
    
    res.json({
      customTests,
      builtInTests,
      totalCustom: customTests.length,
      totalBuiltIn: builtInTests.length,
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get custom tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/custom-tests
 * Create a new custom test
 */
router.post('/custom-tests', (req, res) => {
  try {
    const { name, category, prompt, expectedTool, expectedBehavior, difficulty, variants } = req.body;
    
    if (!name || !category || !prompt) {
      res.status(400).json({ error: 'name, category, and prompt are required' });
      return;
    }
    
    const id = db.createCustomTest({
      name,
      category,
      prompt,
      expectedTool,
      expectedBehavior,
      difficulty,
      variants,
    });
    
    res.json({ id, success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to create custom test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/custom-tests/:id
 * Update a custom test
 */
router.put('/custom-tests/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const success = db.updateCustomTest(id, updates);
    
    if (!success) {
      res.status(404).json({ error: 'Test not found or is built-in' });
      return;
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to update custom test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/custom-tests/:id
 * Delete a custom test
 */
router.delete('/custom-tests/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const success = db.deleteCustomTest(id);
    
    if (!success) {
      res.status(404).json({ error: 'Test not found or is built-in' });
      return;
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to delete custom test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/custom-tests/:id/try
 * Try a test on the currently selected model
 */
router.post('/custom-tests/:id/try', async (req, res) => {
  try {
    const { id } = req.params;
    const { modelId, prompt: overridePrompt } = req.body;
    
    // Get the test
    let test = db.getCustomTest(id);
    
    // If not a custom test, check built-in probes
    if (!test) {
      for (const cat of PROBE_CATEGORIES) {
        const probe = (cat as any).probes.find((p: any) => p.id === id);
        if (probe) {
          test = {
            id: probe.id,
            name: probe.name,
            prompt: probe.prompt,
            expectedTool: probe.expectedTool,
            expectedBehavior: probe.expectedBehavior,
          };
          break;
        }
      }
    }
    
    if (!test) {
      res.status(404).json({ error: 'Test not found' });
      return;
    }
    
    // Get model settings
    let settings: any = {};
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }
    
    // Use provided modelId or fall back to settings
    const targetModel = modelId || settings.mainModelId || settings.lmstudioModel;
    if (!targetModel) {
      res.status(400).json({ error: 'No model selected' });
      return;
    }
    
    const testPrompt = overridePrompt || test.prompt;
    
    // Build comprehensive tool definitions matching MCP server
    const testTools = [
      // RAG Tools (primary for code understanding)
      {
        type: 'function',
        function: {
          name: 'rag_query',
          description: 'Search the codebase using semantic search. Use this FIRST for any code understanding or exploration tasks.',
          parameters: {
            type: 'object',
            properties: { 
              query: { type: 'string', description: 'Natural language search query' },
              topK: { type: 'number', description: 'Number of results to return' }
            },
            required: ['query']
          }
        }
      },
      // File Operations
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a file from the filesystem',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Path to the file to read' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write content to a file',
          parameters: {
            type: 'object',
            properties: { 
              path: { type: 'string' }, 
              content: { type: 'string' } 
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List contents of a directory',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_files',
          description: 'Search for files matching a pattern',
          parameters: {
            type: 'object',
            properties: { 
              path: { type: 'string' }, 
              pattern: { type: 'string' },
              regex: { type: 'boolean' }
            },
            required: ['path', 'pattern']
          }
        }
      },
      // Git Operations
      {
        type: 'function',
        function: {
          name: 'git_status',
          description: 'Get the git status of a repository',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_diff',
          description: 'Get the git diff of a repository',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      },
      // Shell/Execution
      {
        type: 'function',
        function: {
          name: 'shell_exec',
          description: 'Execute a shell command',
          parameters: {
            type: 'object',
            properties: { 
              command: { type: 'string' },
              cwd: { type: 'string' }
            },
            required: ['command']
          }
        }
      },
      // Web/Browser
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query']
          }
        }
      }
    ];
    
    // Make a simple chat completion to test
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `${settings.lmstudioUrl || 'http://localhost:1234'}/v1/chat/completions`,
      {
        model: targetModel,
        messages: [
          { 
            role: 'system', 
            content: `You are a helpful coding assistant working on a test project.
            
IMPORTANT: Use the available tools when appropriate:
- Use rag_query FIRST for any code understanding, search, or exploration tasks
- Use read_file to examine specific files
- Use search_files to find files by pattern
- Use git_status/git_diff for version control information
- Use shell_exec for running commands

The test project is located at: server/data/test-project/
It contains: node-api/, react-web/, java-service/, mendix-widget/, react-native-app/, shared-utils/`
          },
          { role: 'user', content: testPrompt }
        ],
        tools: testTools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 1000,
      },
      { timeout: 45000 }
    );
    
    const message = response.data.choices?.[0]?.message;
    
    res.json({
      success: true,
      test: {
        id: test.id,
        name: test.name,
        prompt: testPrompt,
        expectedTool: test.expectedTool,
        expectedBehavior: test.expectedBehavior,
      },
      result: {
        content: message?.content || '',
        toolCalls: message?.tool_calls || [],
        model: targetModel,
      }
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to try test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/test-project/tree
 * Get the test project file structure for the file picker
 */
router.get('/test-project/tree', async (req, res) => {
  try {
    const testProjectPath = path.join(__dirname, '../../data/test-project');
    
    const buildTree = async (dirPath: string, relativePath: string = ''): Promise<any[]> => {
      const entries: any[] = [];
      
      if (!await fs.pathExists(dirPath)) {
        return entries;
      }
      
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
        
        if (item.isDirectory()) {
          // Skip node_modules, dist, etc.
          if (['node_modules', 'dist', 'build', '.git', '__pycache__'].includes(item.name)) {
            continue;
          }
          
          entries.push({
            name: item.name,
            path: itemRelativePath,
            type: 'directory',
            children: await buildTree(itemPath, itemRelativePath),
          });
        } else {
          entries.push({
            name: item.name,
            path: itemRelativePath,
            type: 'file',
          });
        }
      }
      
      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });
      
      return entries;
    };
    
    const tree = await buildTree(testProjectPath);
    
    res.json({
      tree,
      basePath: 'server/data/test-project',
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get test project tree:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// EXECUTION LOGS
// ============================================================

/**
 * GET /api/tooly/logs
 * Get execution logs with optional filters
 */
router.get('/logs', (req, res) => {
  try {
    const { tool, status, sessionId, limit = 50, offset = 0 } = req.query;
    
    const logs = db.getExecutionLogs({
      tool: tool as string,
      status: status as string,
      sessionId: sessionId as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
    
    res.json({ logs });
  } catch (error: any) {
    console.error('[Tooly] Failed to get logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/logs/:id
 * Get specific execution log with backups
 */
router.get('/logs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const log = db.getExecutionLog(id);
    
    if (!log) {
      res.status(404).json({ error: 'Log not found' });
      return;
    }
    
    const backups = rollback.getBackupsForExecution(id);
    res.json({ log, backups });
  } catch (error: any) {
    console.error('[Tooly] Failed to get log:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ROLLBACK
// ============================================================

/**
 * POST /api/tooly/backups/:id/restore
 * Restore a file from backup
 */
router.post('/backups/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await rollback.restore(id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to restore backup:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/backups/:id/status
 * Check if backup can still be restored
 */
router.get('/backups/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const canRestore = rollback.canRestore(id);
    const timeRemaining = rollback.getTimeRemaining(id);
    
    res.json({
      canRestore,
      timeRemaining,
      timeRemainingFormatted: timeRemaining !== null 
        ? rollback.formatTimeRemaining(timeRemaining) 
        : null
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get backup status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// MCP STATUS
// ============================================================

/**
 * GET /api/tooly/mcp/status
 * Get MCP connection status
 */
router.get('/mcp/status', (req, res) => {
  res.json(mcpClient.getStatus());
});

/**
 * POST /api/tooly/mcp/connect
 * Connect to MCP server
 */
router.post('/mcp/connect', async (req, res) => {
  try {
    await mcpClient.connect();
    res.json({ success: true, status: mcpClient.getStatus() });
  } catch (error: any) {
    console.error('[Tooly] Failed to connect MCP:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/mcp/disconnect
 * Disconnect from MCP server
 */
router.post('/mcp/disconnect', (req, res) => {
  mcpClient.disconnect();
  res.json({ success: true });
});

/**
 * GET /api/tooly/mcp/tools
 * List available MCP tools
 */
router.get('/mcp/tools', async (req, res) => {
  try {
    const tools = await mcpClient.listTools();
    res.json({ tools });
  } catch (error: any) {
    console.error('[Tooly] Failed to list tools:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// IDE MAPPINGS
// ============================================================

import { ideMapping } from '../services/ide-mapping.js';

/**
 * GET /api/tooly/ide-mappings
 * List all available IDE mappings
 */
router.get('/ide-mappings', async (req, res) => {
  try {
    const ides = await ideMapping.listAvailableIDEs();
    const mappings = await Promise.all(
      ides.map(async (ide) => {
        const mapping = await ideMapping.loadIDEMapping(ide);
        return {
          ide: mapping.ide,
          suffix: mapping.modelSuffix,
          stats: ideMapping.getMappingStats(ALL_TOOLS, mapping)
        };
      })
    );
    res.json({ mappings });
  } catch (error: any) {
    console.error('[Tooly] Failed to list IDE mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/ide-mappings/:ide
 * Get specific IDE mapping details
 */
router.get('/ide-mappings/:ide', async (req, res) => {
  try {
    const { ide } = req.params;
    const mapping = await ideMapping.loadIDEMapping(ide);
    res.json({
      mapping,
      stats: ideMapping.getMappingStats(ALL_TOOLS, mapping)
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get IDE mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/ide-mappings/:ide/reload
 * Reload an IDE mapping (for hot-reload after editing JSON)
 */
router.post('/ide-mappings/:ide/reload', async (req, res) => {
  try {
    const { ide } = req.params;
    const mapping = await ideMapping.reloadIDEMapping(ide);
    if (mapping) {
      res.json({
        success: true,
        mapping,
        stats: ideMapping.getMappingStats(ALL_TOOLS, mapping)
      });
    } else {
      res.status(404).json({ error: `IDE mapping '${ide}' not found` });
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to reload IDE mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/parse-model
 * Parse a model name to detect IDE suffix
 */
router.post('/parse-model', (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'model is required' });
    }
    const parsed = ideMapping.parseModelIDE(model);
    res.json(parsed);
  } catch (error: any) {
    console.error('[Tooly] Failed to parse model:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// LEADERBOARDS
// ============================================================

/**
 * GET /api/tooly/leaderboards
 * Get top 3 models per category
 */
router.get('/leaderboards', async (req, res) => {
  try {
    // Get all profiles
    const allProfiles = await capabilities.getAllProfiles();
    
    // Define leaderboard categories
    const leaderboardCategories = [
      { id: 'rag', name: 'Best for RAG', icon: '🔍', scoreKey: 'ragScore' },
      { id: 'architect', name: 'Best Architect', icon: '🏗️', scoreKey: 'architecturalScore' },
      { id: 'navigator', name: 'Best Navigator', icon: '🧭', scoreKey: 'navigationScore' },
      { id: 'reviewer', name: 'Best Reviewer', icon: '🐛', scoreKey: 'bugDetectionScore' },
      { id: 'proactive', name: 'Most Proactive', icon: '💡', scoreKey: 'proactiveScore' },
      { id: 'overall', name: 'Best Overall', icon: '🏆', scoreKey: 'overallScore' },
    ];
    
    const leaderboards = leaderboardCategories.map((category: { id: string; name: string; icon: string; scoreKey: string }) => {
      // Sort profiles by this category's score
      const sorted = allProfiles
        .map((profile: ModelProfile) => {
          const badgeScores = extractBadgeScores(profile);
          const score = (badgeScores as Record<string, number | undefined>)[category.scoreKey] ?? 
                       profile.probeResults?.overallScore ?? 
                       profile.score ?? 0;
          return {
            modelId: profile.modelId,
            displayName: profile.displayName || profile.modelId.split('/').pop() || profile.modelId,
            score: Math.round(score),
          };
        })
        .filter((p: { score: number }) => p.score > 0)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 3)
        .map((entry: { modelId: string; displayName: string; score: number }, index: number) => ({ ...entry, rank: index + 1 }));
      
      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        description: `Top models for ${category.name.toLowerCase()}`,
        entries: sorted,
      };
    });
    
    res.json({ categories: leaderboards });
  } catch (error: any) {
    console.error('[Tooly] Failed to get leaderboards:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ENHANCED MODEL DETAIL
// ============================================================

/**
 * GET /api/tooly/models/:modelId/detail
 * Get detailed model profile with badges, recommendations, and tool categories
 */
router.get('/models/:modelId/detail', async (req, res) => {
  try {
    const { modelId } = req.params;
    const profile = await capabilities.getProfile(modelId);
    
    if (!profile) {
      res.status(404).json({ error: 'Model profile not found' });
      return;
    }
    
    // Extract badge scores and calculate badges
    const badgeScores = extractBadgeScores(profile);
    const badges = calculateBadges(badgeScores);
    
    // Get all profiles for alternative recommendations
    const allProfilesForAlts = await capabilities.getAllProfiles();
    const alternatives = allProfilesForAlts
      .filter((p: ModelProfile) => p.modelId !== modelId)
      .map((p: ModelProfile) => ({
        modelId: p.modelId,
        modelName: p.displayName || p.modelId,
        scores: extractBadgeScores(p),
      }));
    
    // Calculate recommendations
    const recommendations = calculateRecommendations(badgeScores, alternatives);
    
    // Get tool categories
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
    
    // Build complete score breakdown
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
    
    // Lookup model info (async, don't block response)
    let modelInfo = null;
    try {
      modelInfo = await lookupModelInfo(modelId);
    } catch (e) {
      // Ignore lookup failures
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

/**
 * POST /api/tooly/probe/:modelId
 * Run probes for a model with optional category filter
 */
router.post('/probe/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { categories, mode = 'full' } = req.body || {};
    
    // Load settings
    let settings: any = {};
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }
    
    const probeOptions = {
      runLatencyProfile: mode === 'full',
      runReasoningProbes: !categories || categories.includes('2.x'),
      categories: categories || undefined,  // Filter to specific categories
      quickMode: mode === 'quick',  // FIXED: was incorrectly named 'mode' instead of 'quickMode'
      // Enable all extended probes when no specific categories selected
      runStrategicProbes: !categories || categories.includes('3.x'),
      runArchitecturalProbes: !categories || categories.includes('4.x'),
      runNavigationProbes: !categories || categories.includes('5.x'),
      runHelicopterProbes: !categories || categories.includes('6.x'),
      runProactiveProbes: !categories || categories.includes('7.x'),
      runIntentProbes: !categories || categories.includes('8.x'),
    };
    
    console.log(`[Tooly] Running probes for ${modelId} (mode: ${mode}, categories: ${categories?.join(', ') || 'all'})`);
    
    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };
    
    const result = await probeEngine.runAllProbes(
      modelId,
      'lmstudio',
      testSettings,
      probeOptions
    );
    
    // Build probe results for saving (same as /models/:modelId/probe)
    const probeResultsToSave: any = {
      testedAt: result.completedAt,
      emitTest: result.emitTest ? { passed: result.emitTest.passed, score: result.emitTest.score, details: result.emitTest.details } : undefined,
      schemaTest: result.schemaTest ? { passed: result.schemaTest.passed, score: result.schemaTest.score, details: result.schemaTest.details } : undefined,
      selectionTest: result.selectionTest ? { passed: result.selectionTest.passed, score: result.selectionTest.score, details: result.selectionTest.details } : undefined,
      suppressionTest: result.suppressionTest ? { passed: result.suppressionTest.passed, score: result.suppressionTest.score, details: result.suppressionTest.details } : undefined,
      nearIdenticalSelectionTest: result.nearIdenticalSelectionTest ? { passed: result.nearIdenticalSelectionTest.passed, score: result.nearIdenticalSelectionTest.score, details: result.nearIdenticalSelectionTest.details } : undefined,
      multiToolEmitTest: result.multiToolEmitTest ? { passed: result.multiToolEmitTest.passed, score: result.multiToolEmitTest.score, details: result.multiToolEmitTest.details } : undefined,
      argumentValidationTest: result.argumentValidationTest ? { passed: result.argumentValidationTest.passed, score: result.argumentValidationTest.score, details: result.argumentValidationTest.details } : undefined,
      schemaReorderTest: result.schemaReorderTest ? { passed: result.schemaReorderTest.passed, score: result.schemaReorderTest.score, details: result.schemaReorderTest.details } : undefined,
      toolScore: result.toolScore,
      reasoningScore: result.reasoningScore,
      overallScore: result.overallScore
    };

    if (result.reasoningProbes) {
      probeResultsToSave.reasoningProbes = {
        intentExtraction: { passed: result.reasoningProbes.intentExtraction.passed, score: result.reasoningProbes.intentExtraction.score, details: result.reasoningProbes.intentExtraction.details },
        multiStepPlanning: { passed: result.reasoningProbes.multiStepPlanning.passed, score: result.reasoningProbes.multiStepPlanning.score, details: result.reasoningProbes.multiStepPlanning.details },
        conditionalReasoning: { passed: result.reasoningProbes.conditionalReasoning.passed, score: result.reasoningProbes.conditionalReasoning.score, details: result.reasoningProbes.conditionalReasoning.details },
        contextContinuity: { passed: result.reasoningProbes.contextContinuity.passed, score: result.reasoningProbes.contextContinuity.score, details: result.reasoningProbes.contextContinuity.details },
        logicalConsistency: { passed: result.reasoningProbes.logicalConsistency.passed, score: result.reasoningProbes.logicalConsistency.score, details: result.reasoningProbes.logicalConsistency.details },
        explanation: { passed: result.reasoningProbes.explanation.passed, score: result.reasoningProbes.explanation.score, details: result.reasoningProbes.explanation.details },
        edgeCaseHandling: { passed: result.reasoningProbes.edgeCaseHandling.passed, score: result.reasoningProbes.edgeCaseHandling.score, details: result.reasoningProbes.edgeCaseHandling.details }
      };
    }

    // Save strategic probes (3.x - 7.x)
    if (result.strategicRAGProbes) {
      probeResultsToSave.strategicRAGProbes = result.strategicRAGProbes;
    }
    if (result.architecturalProbes) {
      probeResultsToSave.architecturalProbes = result.architecturalProbes;
    }
    if (result.navigationProbes) {
      probeResultsToSave.navigationProbes = result.navigationProbes;
    }
    if (result.helicopterProbes) {
      probeResultsToSave.helicopterProbes = result.helicopterProbes;
    }
    if (result.proactiveProbes) {
      probeResultsToSave.proactiveProbes = result.proactiveProbes;
    }
    
    // Save intent probes (8.x)
    if (result.intentProbes) {
      probeResultsToSave.intentProbes = result.intentProbes;
      probeResultsToSave.intentScores = result.intentScores;
    }
    
    // Save score breakdown
    if (result.scoreBreakdown) {
      probeResultsToSave.scoreBreakdown = result.scoreBreakdown;
    }

    // Save probe results to model profile
    await capabilities.updateProbeResults(
      modelId,
      probeResultsToSave,
      result.role,
      result.contextLatency,
      result.scoreBreakdown
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run probes:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TEST HISTORY (NEW)
// ============================================================

/**
 * GET /api/tooly/models/:modelId/test/history
 * Get test history for a model
 */
router.get('/models/:modelId/test/history', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    
    // Query test history from database
    const history = db.query(
      `SELECT * FROM test_history WHERE model_id = ? ORDER BY timestamp DESC LIMIT 50`,
      [modelId]
    );
    
    // Parse JSON fields
    const parsedHistory = history.map((entry: any) => ({
      id: entry.id,
      testMode: entry.test_mode,
      scores: entry.scores ? JSON.parse(entry.scores) : {},
      durationMs: entry.duration_ms,
      testCount: entry.test_count,
      passedCount: entry.passed_count,
      failedCount: entry.failed_count,
      timestamp: entry.timestamp
    }));
    
    res.json({ history: parsedHistory });
  } catch (error: any) {
    console.error('[Tooly] Failed to get test history:', error);
    res.status(500).json({ error: error.message, history: [] });
  }
});

// ============================================================
// MODEL CONFIGURATION (NEW)
// ============================================================

/**
 * GET /api/tooly/models/:modelId/config
 * Get model configuration
 */
router.get('/models/:modelId/config', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    
    // Query config from database
    const config = db.query(
      `SELECT * FROM mcp_model_configs WHERE model_id = ?`,
      [modelId]
    )[0];
    
    if (config) {
      res.json({
        modelId: config.model_id,
        toolFormat: config.tool_format,
        enabledTools: config.enabled_tools ? JSON.parse(config.enabled_tools) : [],
        disabledTools: config.disabled_tools ? JSON.parse(config.disabled_tools) : [],
        toolOverrides: config.tool_overrides ? JSON.parse(config.tool_overrides) : {},
        systemPromptAdditions: config.system_prompt_additions ? JSON.parse(config.system_prompt_additions) : [],
        contextBudget: config.context_budget ? JSON.parse(config.context_budget) : {},
        optimalSettings: config.optimal_settings ? JSON.parse(config.optimal_settings) : {}
      });
    } else {
      // Return default config
      res.json({
        modelId,
        toolFormat: 'openai',
        enabledTools: [],
        disabledTools: [],
        toolOverrides: {},
        systemPromptAdditions: [],
        contextBudget: {
          total: 32000,
          systemPrompt: 2000,
          toolSchemas: 4000,
          memory: 1000,
          ragResults: 8000,
          history: 12000,
          reserve: 5000
        },
        optimalSettings: {
          maxToolsPerCall: 10,
          ragChunkSize: 1000,
          ragResultCount: 5
        }
      });
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to get config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/config
 * Update model configuration
 */
router.put('/models/:modelId/config', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const config = req.body;
    
    // Upsert config
    db.run(
      `INSERT OR REPLACE INTO mcp_model_configs 
       (model_id, tool_format, enabled_tools, disabled_tools, tool_overrides, 
        system_prompt_additions, context_budget, optimal_settings, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        modelId,
        config.toolFormat || 'openai',
        JSON.stringify(config.enabledTools || []),
        JSON.stringify(config.disabledTools || []),
        JSON.stringify(config.toolOverrides || {}),
        JSON.stringify(config.systemPromptAdditions || []),
        JSON.stringify(config.contextBudget || {}),
        JSON.stringify(config.optimalSettings || {})
      ]
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to save config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/config/generate
 * Generate optimal configuration from test results
 */
router.post('/models/:modelId/config/generate', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    
    // Get model profile
    const profile = await capabilities.getProfile(modelId);
    
    if (!profile) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    // Generate optimal config based on profile
    // This is a simplified version - the full implementation would use mcpOrchestrator
    const optimalConfig = {
      modelId,
      toolFormat: 'openai' as const,
      enabledTools: profile.enabledTools || [],
      disabledTools: [],
      toolOverrides: {},
      systemPromptAdditions: [],
      contextBudget: {
        total: profile.contextLength || 32000,
        systemPrompt: 2000,
        toolSchemas: 4000,
        memory: 1000,
        ragResults: 8000,
        history: 12000,
        reserve: 5000
      },
      optimalSettings: {
        maxToolsPerCall: 10,
        ragChunkSize: 1000,
        ragResultCount: 5
      }
    };
    
    // Save config
    db.run(
      `INSERT OR REPLACE INTO mcp_model_configs 
       (model_id, tool_format, enabled_tools, disabled_tools, tool_overrides, 
        system_prompt_additions, context_budget, optimal_settings, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        modelId,
        optimalConfig.toolFormat,
        JSON.stringify(optimalConfig.enabledTools),
        JSON.stringify(optimalConfig.disabledTools),
        JSON.stringify(optimalConfig.toolOverrides),
        JSON.stringify(optimalConfig.systemPromptAdditions),
        JSON.stringify(optimalConfig.contextBudget),
        JSON.stringify(optimalConfig.optimalSettings)
      ]
    );
    
    res.json({ success: true, config: optimalConfig });
  } catch (error: any) {
    console.error('[Tooly] Failed to generate config:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ACTIVE MODEL MANAGEMENT (NEW)
// ============================================================

/**
 * POST /api/tooly/active-model
 * Set a model as main or executor
 */
router.post('/active-model', async (req, res) => {
  try {
    const { modelId, role } = req.body;
    
    if (!modelId || !role) {
      return res.status(400).json({ error: 'modelId and role are required' });
    }
    
    if (!['main', 'executor'].includes(role)) {
      return res.status(400).json({ error: 'role must be "main" or "executor"' });
    }
    
    // Update model profile with new role
    const profile = await capabilities.getProfile(modelId);
    if (profile) {
      const newRole = role === 'main' 
        ? (profile.role === 'executor' ? 'both' : 'main')
        : (profile.role === 'main' ? 'both' : 'executor');
      
      await capabilities.saveProfile({
        ...profile,
        role: newRole
      });
    }
    
    // Also save to settings
    try {
      let settings: any = {};
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
      
      if (role === 'main') {
        settings.mainModelId = modelId;
      } else {
        settings.executorModelId = modelId;
      }
      
      await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
    } catch (err) {
      console.error('[Tooly] Failed to save active model to settings:', err);
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to set active model:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SMALL MODEL / CONTEXT INTELLIGENCE (Phase 4)
// ============================================================

/**
 * GET /api/tooly/context/config
 * Get current small model configuration for context intelligence
 */
router.get('/context/config', async (req, res) => {
  try {
    const { contextManager, contextAnalyzer } = await import('../modules/tooly/index.js');
    
    res.json({
      contextManager: {
        defaultBudget: contextManager.calculateBudgetForModel(32000)
      },
      smallModel: contextAnalyzer.getConfig()
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get context config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/context/config
 * Update small model configuration
 */
router.put('/context/config', async (req, res) => {
  try {
    const { enabled, modelId, lmstudioUrl, maxTokens, temperature, timeout, cacheEnabled, cacheTTL } = req.body;
    const { contextManager } = await import('../modules/tooly/index.js');
    
    const config: any = {};
    if (enabled !== undefined) config.enabled = enabled;
    if (modelId) config.modelId = modelId;
    if (lmstudioUrl) config.lmstudioUrl = lmstudioUrl;
    if (maxTokens) config.maxTokens = maxTokens;
    if (temperature !== undefined) config.temperature = temperature;
    if (timeout) config.timeout = timeout;
    if (cacheEnabled !== undefined) config.cacheEnabled = cacheEnabled;
    if (cacheTTL) config.cacheTTL = cacheTTL;
    
    contextManager.configureSmallModel(config);
    
    // Also save to settings file
    try {
      let settings: any = {};
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
      
      settings.smallModel = {
        ...(settings.smallModel || {}),
        ...config
      };
      
      await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
    } catch (err) {
      console.error('[Tooly] Failed to save small model config:', err);
    }
    
    res.json({ success: true, config });
  } catch (error: any) {
    console.error('[Tooly] Failed to update context config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/context/analyze
 * Analyze a query using the small model
 */
router.post('/context/analyze', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const { contextManager } = await import('../modules/tooly/index.js');
    const analysis = await contextManager.analyzeQueryEnhanced(query);
    
    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to analyze query:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/context/summarize
 * Summarize content using the small model
 */
router.post('/context/summarize', async (req, res) => {
  try {
    const { content, targetTokens = 200 } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const { summarizer } = await import('../modules/tooly/index.js');
    const result = await summarizer.summarizeContent(content, targetTokens);
    
    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to summarize:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/context/rank
 * Rank items by relevance to a query
 */
router.post('/context/rank', async (req, res) => {
  try {
    const { query, items, maxItems = 10 } = req.body;
    
    if (!query || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'query and items array are required' });
    }
    
    const { contextAnalyzer } = await import('../modules/tooly/index.js');
    const ranking = await contextAnalyzer.rankByRelevance(query, items, maxItems);
    
    res.json({
      success: true,
      ranking
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to rank items:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

