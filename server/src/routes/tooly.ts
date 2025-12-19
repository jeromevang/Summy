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
import { capabilities, ALL_TOOLS } from '../modules/tooly/capabilities.js';
import { testEngine, TEST_DEFINITIONS } from '../modules/tooly/test-engine.js';
import { probeEngine } from '../modules/tooly/probe-engine.js';
import { rollback } from '../modules/tooly/rollback.js';
import { mcpClient } from '../modules/tooly/mcp-client.js';

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
    const unloadFirst = body.unloadFirst !== false;  // Default true for clean slate
    
    // Load settings
    let settings: any = {};
    
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        settings = await fs.readJson(SETTINGS_FILE);
      }
    } catch {
      // Use defaults
    }

    // Unload all models from LM Studio before testing (clean slate)
    if (provider === 'lmstudio' && unloadFirst) {
      try {
        console.log(`[Tooly] Unloading all models from LM Studio before tool tests...`);
        const client = new LMStudioClient();
        const loadedModels = await client.llm.listLoaded();
        for (const model of loadedModels) {
          try {
            await client.llm.unload(model.identifier);
            console.log(`[Tooly] Unloaded: ${model.identifier}`);
          } catch (e: any) {
            console.log(`[Tooly] Could not unload ${model.identifier}: ${e.message}`);
          }
        }
      } catch (e: any) {
        console.log(`[Tooly] Could not connect to LM Studio to unload models: ${e.message}`);
      }
    }

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

    // Unload all models from LM Studio before testing (clean slate)
    if (provider === 'lmstudio') {
      try {
        console.log(`[Tooly] Unloading all models from LM Studio before probe tests...`);
        const client = new LMStudioClient();
        const loadedModels = await client.llm.listLoaded();
        for (const model of loadedModels) {
          try {
            await client.llm.unload(model.identifier);
            console.log(`[Tooly] Unloaded: ${model.identifier}`);
          } catch (e: any) {
            console.log(`[Tooly] Could not unload ${model.identifier}: ${e.message}`);
          }
        }
      } catch (e: any) {
        console.log(`[Tooly] Could not connect to LM Studio to unload models: ${e.message}`);
      }
    }

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
      runLatencyProfile
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

    // Save probe results to model profile
    await capabilities.updateProbeResults(
      modelId,
      probeResultsToSave,
      result.role,
      result.contextLatency
    );

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run probe tests:', error);
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

export default router;

