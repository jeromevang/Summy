import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadServerSettings } from '../../services/settings-service.js';
import { db } from '../../services/database.js';
import { capabilities, ALL_TOOLS } from '../../modules/tooly/capabilities.js';
import { testEngine } from '../../modules/tooly/test-engine.js';
import { ALL_TEST_DEFINITIONS as TEST_DEFINITIONS } from '../../modules/tooly/testing/test-definitions.js';
import { probeEngine } from '../../modules/tooly/probe-engine.js';
import { PROBE_CATEGORIES } from '../../modules/tooly/strategic-probes.js';
import { sanitizeInput, validateTestExecution, validateProbeExecution, expensiveOperationRateLimit } from '../../middleware/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../../settings.json');

const router = Router();

/**
 * POST /api/tooly/models/:modelId/test
 */
router.post('/models/:modelId/test', expensiveOperationRateLimit, validateTestExecution, async (req, res) => {
  try {
    const modelId = sanitizeInput(decodeURIComponent(req.params.modelId));
    const body = sanitizeInput(req.body || {});
    let provider = body.provider;
    if (!provider) {
      const profile = await capabilities.getProfile(modelId);
      provider = profile?.provider || 'lmstudio';
    }
    const tools = body.tools;
    const testMode = (req.query.mode as string) || body.testMode || 'manual';
    const isBaseline = body.isBaseline === true || req.query.isBaseline === 'true';
    const settings = await loadServerSettings();
    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: settings.openaiApiKey,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion,
      openrouterApiKey: settings.openrouterApiKey
    };
    const skipPreflight = body.skipPreflight === true || req.query.skipPreflight === 'true';
    const testOptions = { mode: testMode, unloadAfterTest: false, unloadOnlyOnFail: false, contextLength: 4096, skipPreflight, isBaseline };

    try {
      let result = (tools && Array.isArray(tools)) 
        ? await testEngine.runTestsForTools(modelId, provider, tools, testSettings, testOptions)
        : await testEngine.runAllTests(modelId, provider, testSettings, testOptions);
      res.json(result);
    } catch (testError: any) {
      console.error('[TestRoutes] Test failed:', testError);
      res.status(500).json({ error: `Test failed: ${testError.message}`, provider, modelId, mode: testMode });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/test
 */
router.delete('/models/:modelId/test', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const aborted = testEngine.abortTest(modelId);
    res.json({ success: true, message: aborted ? 'Test cancelled' : 'No test was running' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/probe
 */
router.post('/models/:modelId/probe', expensiveOperationRateLimit, validateProbeExecution, async (req, res) => {
  try {
    const modelId = sanitizeInput(decodeURIComponent(req.params.modelId));
    const { provider = 'lmstudio', runLatencyProfile = false } = sanitizeInput(req.body || {});
    const isBaseline = req.body.isBaseline === true || req.query.isBaseline === 'true';
    const settings = await loadServerSettings();
    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };

    const result = await probeEngine.runAllProbes(modelId, provider, testSettings, {
      contextLength: 2048, timeout: 30000, runLatencyProfile,
      runReasoningProbes: true, runStrategicProbes: true, runArchitecturalProbes: true,
      runNavigationProbes: true, runHelicopterProbes: true, runProactiveProbes: true,
      runIntentProbes: true, quickMode: false, isBaseline
    });

    const probeResultsToSave: any = {
      testedAt: result.completedAt,
      emitTest: result.emitTest, schemaTest: result.schemaTest, 
      selectionTest: result.selectionTest, suppressionTest: result.suppressionTest,
      toolScore: result.toolScore, reasoningScore: result.reasoningScore, overallScore: result.overallScore
    };
    if (result.reasoningProbes) probeResultsToSave.reasoningProbes = result.reasoningProbes;
    if (result.strategicRAGProbes) probeResultsToSave.strategicRAGProbes = result.strategicRAGProbes;
    if (result.intentProbes) { probeResultsToSave.intentProbes = result.intentProbes; probeResultsToSave.intentScores = result.intentScores; }

    await capabilities.updateProbeResults(modelId, probeResultsToSave, result.role as any, result.contextLatency, { ...result.scoreBreakdown, isBaseline } as any);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/tests
 */
router.get('/tests', (req, res) => {
  res.json({ tests: TEST_DEFINITIONS, totalTests: TEST_DEFINITIONS.length, tools: ALL_TOOLS });
});

/**
 * GET /api/tooly/custom-tests
 */
router.get('/custom-tests', (req, res) => {
  try {
    const customTests = db.getCustomTests();
    const builtInTests = PROBE_CATEGORIES.flatMap((cat: any) =>
      cat.probes.map((p: any) => ({
        id: p.id, name: p.name, category: cat.id, categoryName: cat.name,
        prompt: p.prompt, expectedTool: p.expectedTool, difficulty: 'medium', isBuiltin: true
      }))
    );
    res.json({ customTests, builtInTests, totalCustom: customTests.length, totalBuiltIn: builtInTests.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
