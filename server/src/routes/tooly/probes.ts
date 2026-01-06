import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { capabilities } from '../../modules/tooly/capabilities.js';
import { probeEngine } from '../../modules/tooly/probe-engine.js';
import { 
  validateProbeExecution, 
  expensiveOperationRateLimit,
  sanitizeInput
} from '../../middleware/validation.js';

const router: Router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../../settings.json');

/**
 * POST /api/tooly/models/:modelId/probe
 * Run probe tests for a model to determine role
 */
router.post('/models/:modelId/probe', expensiveOperationRateLimit, validateProbeExecution, async (req, res) => {
  try {
    const modelId = sanitizeInput(decodeURIComponent(req.params.modelId || ''));
    const body = sanitizeInput(req.body || {});
    const provider = body.provider || 'lmstudio';
    const runLatencyProfile = body.runLatencyProfile || false;
    const isBaseline = body.isBaseline === true || req.query.isBaseline === 'true';

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

    console.log(`[Tooly] Running probe tests for ${modelId}`);

    const result = await probeEngine.runAllProbes(modelId, provider, testSettings, {
      contextLength: 2048,
      timeout: 30000,
      runLatencyProfile,
      runReasoningProbes: true,
      runStrategicProbes: true,
      runArchitecturalProbes: true,
      runNavigationProbes: true,
      runHelicopterProbes: true,
      runProactiveProbes: true,
      runIntentProbes: true,
      quickMode: false,
      isBaseline
    });

    const probeResultsToSave: any = {
      testedAt: result.completedAt,
      emitTest: { passed: result.emitTest.passed, score: result.emitTest.score, details: result.emitTest.details },
      schemaTest: { passed: result.schemaTest.passed, score: result.schemaTest.score, details: result.schemaTest.details },
      selectionTest: { passed: result.selectionTest.passed, score: result.selectionTest.score, details: result.selectionTest.details },
      suppressionTest: { passed: result.suppressionTest.passed, score: result.suppressionTest.score, details: result.suppressionTest.details },
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

    if (result.strategicRAGProbes) probeResultsToSave.strategicRAGProbes = result.strategicRAGProbes;
    if (result.architecturalProbes) probeResultsToSave.architecturalProbes = result.architecturalProbes;
    if (result.navigationProbes) probeResultsToSave.navigationProbes = result.navigationProbes;
    if (result.helicopterProbes) probeResultsToSave.helicopterProbes = result.helicopterProbes;
    if (result.proactiveProbes) probeResultsToSave.proactiveProbes = result.proactiveProbes;

    if (result.intentProbes) {
      probeResultsToSave.intentProbes = result.intentProbes;
      probeResultsToSave.intentScores = result.intentScores;
    }

    if (result.scoreBreakdown) {
      probeResultsToSave.scoreBreakdown = result.scoreBreakdown;
    }

    await capabilities.updateProbeResults(
      modelId,
      probeResultsToSave,
      result.role as any,
      result.contextLatency,
      { ...result.scoreBreakdown, isBaseline } as any
    );

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run probe tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/probe/:modelId
 * Run probes with optional category filter
 */
router.post('/probe/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { categories, mode = 'full', isBaseline = false } = req.body || {};

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
      categories: categories || undefined,
      quickMode: mode === 'quick',
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

    // Build probe results logic duplicated from above... 
    // In a real refactor, this logic should be in a helper function.
    // copying structure from above:
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
  
      if (result.strategicRAGProbes) probeResultsToSave.strategicRAGProbes = result.strategicRAGProbes;
      if (result.architecturalProbes) probeResultsToSave.architecturalProbes = result.architecturalProbes;
      if (result.navigationProbes) probeResultsToSave.navigationProbes = result.navigationProbes;
      if (result.helicopterProbes) probeResultsToSave.helicopterProbes = result.helicopterProbes;
      if (result.proactiveProbes) probeResultsToSave.proactiveProbes = result.proactiveProbes;
  
      if (result.intentProbes) {
        probeResultsToSave.intentProbes = result.intentProbes;
        probeResultsToSave.intentScores = result.intentScores;
      }
  
      if (result.scoreBreakdown) {
        probeResultsToSave.scoreBreakdown = result.scoreBreakdown;
      }
  
      await capabilities.updateProbeResults(
        modelId,
        probeResultsToSave,
        result.role as any,
        result.contextLatency,
        { ...result.scoreBreakdown, isBaseline } as any
      );

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run probes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/quick-latency
 * Quick latency check at 2K context
 */
router.post('/models/:modelId/quick-latency', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const body = req.body || {};
    const provider = body.provider || 'lmstudio';

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

export const probesRouter = router;
