import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { loadServerSettings } from '../../services/settings-service.js';
import { capabilities, ALL_TOOLS } from '../../modules/tooly/capabilities.js';
import { testEngine } from '../../modules/tooly/test-engine.js';
import { ALL_TEST_DEFINITIONS as TEST_DEFINITIONS } from '../../modules/tooly/testing/test-definitions.js';
import { db } from '../../services/database.js';
import { 
  validateTestExecution, 
  expensiveOperationRateLimit,
  sanitizeInput
} from '../../middleware/validation.js';

const router: Router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../../settings.json');

/**
 * POST /api/tooly/models/:modelId/test
 * Run capability tests for a model
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

    const testOptions = {
      mode: testMode,
      unloadAfterTest: false,
      unloadOnlyOnFail: false,
      contextLength: 4096,
      skipPreflight,
      isBaseline
    };

    console.log(`[Tooly] Running tests for ${modelId} (provider: ${provider}) with mode: ${testMode}`);

    try {
      let result;
      if (tools && Array.isArray(tools)) {
        result = await testEngine.runTestsForTools(modelId, provider, tools, testSettings, testOptions);
      } else {
        result = await testEngine.runAllTests(modelId, provider, testSettings, testOptions);
      }

      console.log(`[Tooly] Test completed for ${modelId}: ${result.results?.length || 0} tests, ${result.overallScore || 0} score`);
      res.json(result);
    } catch (testError: any) {
      console.error(`[Tooly] Test failed for ${modelId}:`, testError);

      if (provider === 'openrouter') {
        if (testError.message?.includes('rate limit') || testError.message?.includes('429')) {
          return res.status(429).json({
            error: 'OpenRouter rate limit exceeded. Try again later or use a different model.',
            details: testError.message
          });
        }
        if (testError.message?.includes('401') || testError.message?.includes('unauthorized')) {
          return res.status(401).json({
            error: 'OpenRouter API key invalid or expired.',
            details: testError.message
          });
        }
        if (testError.message?.includes('timeout')) {
          return res.status(408).json({
            error: 'OpenRouter request timed out. The model may be slow or unavailable.',
            details: testError.message
          });
        }
      }

      res.status(500).json({
        error: `Test failed: ${testError.message}`,
        provider,
        modelId,
        mode: testMode
      });
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to run tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/test
 * Cancel a running test for a model
 */
router.delete('/models/:modelId/test', async (req, res) => {
  try {
    const { modelId } = req.params;
    const decodedModelId = decodeURIComponent(modelId);

    const wasRunning = testEngine.isTestRunning(decodedModelId);
    const aborted = testEngine.abortTest(decodedModelId);

    if (aborted) {
      console.log(`[Tooly] Cancelled test for ${decodedModelId}`);
      res.json({ success: true, message: 'Test cancelled' });
    } else if (!wasRunning) {
      res.json({ success: true, message: 'No test was running' });
    } else {
      res.status(500).json({ error: 'Failed to cancel test' });
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to cancel test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tooly/models/:modelId/results
 * Clear all test results for a model
 */
router.delete('/models/:modelId/results', async (req, res) => {
  try {
    const { modelId } = req.params;
    const decodedModelId = decodeURIComponent(modelId);

    let profile = await capabilities.getProfile(decodedModelId);

    if (!profile) {
      res.status(404).json({ error: 'Model profile not found' });
      return;
    }

    profile.score = 0;
    profile.testVersion = 0;
    profile.testedAt = '';
    profile.capabilities = {};
    profile.role = 'none';
    (profile as any).scoreBreakdown = undefined;
    (profile as any).probeResults = undefined;
    (profile as any).discoveredNativeTools = undefined;
    (profile as any).unmappedNativeTools = undefined;

    await capabilities.saveProfile(profile);

    console.log(`[Tooly] Cleared test results for ${decodedModelId}`);
    res.json({ success: true, message: 'Test results cleared' });
  } catch (error: any) {
    console.error('[Tooly] Failed to clear test results:', error);
    res.status(500).json({ error: error.message });
  }
});

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

/**
 * GET /api/tooly/models/:modelId/test/history
 * Get test history for a model
 */
router.get('/models/:modelId/test/history', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);

    const history = db.query(
      `SELECT * FROM test_history WHERE model_id = ? ORDER BY timestamp DESC LIMIT 50`,
      [modelId]
    );

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

export const testingRouter = router;
