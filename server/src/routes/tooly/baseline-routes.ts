import { Router } from 'express';
import { capabilities } from '../../modules/tooly/capabilities.js';
import { calculateBaselineComparison } from '../../modules/tooly/scoring/agentic-scorer.js';

const router = Router();

/**
 * POST /api/tooly/baseline/generate
 */
router.post('/baseline/generate', async (req, res) => {
  try {
    const { baselineEngine } = await import('../../modules/tooly/baseline-engine.js');
    const results = await baselineEngine.autoGenerateBaselines();
    res.json({ success: true, count: results.length, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/baseline/compare/:modelId
 */
router.get('/baseline/compare/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const decodedModelId = decodeURIComponent(modelId);
    const profile = await capabilities.getProfile(decodedModelId);
    if (!profile) return res.status(404).json({ error: 'Model profile not found' });

    const allProfiles = await capabilities.getAllProfiles();
    const baselineProfile = allProfiles.find(p => (p as any).isBaseline === true);

    if (!profile.probeResults?.overallScore) return res.status(400).json({ error: 'Profile must have probe results to compare.' });

    const modelScores = {
      toolAccuracy: profile.probeResults.toolScore || 0,
      intentRecognition: (profile.probeResults as any).intentScores?.overallIntentScore || 0,
      ragUsage: (profile as any).scoreBreakdown?.ragScore || 0,
      reasoning: profile.probeResults.reasoningScore || 0,
      bugDetection: (profile as any).scoreBreakdown?.bugDetectionScore || 0,
      codeUnderstanding: (profile as any).scoreBreakdown?.architecturalScore || 0,
      selfCorrection: (profile as any).probeResults?.silentFailureScore || 0,
      antiPatternPenalty: (profile as any).antiPatterns?.redFlagScore || 0,
      overallScore: profile.probeResults.overallScore
    };

    let baselineScores, baselineModelId;
    if (baselineProfile && baselineProfile.probeResults?.overallScore) {
      baselineModelId = baselineProfile.modelId;
      baselineScores = {
        toolAccuracy: baselineProfile.probeResults.toolScore || 0,
        intentRecognition: (baselineProfile.probeResults as any).intentScores?.overallIntentScore || 0,
        ragUsage: (baselineProfile as any).scoreBreakdown?.ragScore || 0,
        reasoning: baselineProfile.probeResults.reasoningScore || 0,
        bugDetection: (baselineProfile as any).scoreBreakdown?.bugDetectionScore || 0,
        codeUnderstanding: (baselineProfile as any).scoreBreakdown?.architecturalScore || 0,
        selfCorrection: (baselineProfile as any).probeResults?.silentFailureScore || 0,
        antiPatternPenalty: (baselineProfile as any).antiPatterns?.redFlagScore || 0,
        overallScore: baselineProfile.probeResults.overallScore
      };
    } else {
      baselineModelId = 'Gemini Ground Truth';
      baselineScores = { toolAccuracy: 100, intentRecognition: 100, ragUsage: 100, reasoning: 100, bugDetection: 100, codeUnderstanding: 100, selfCorrection: 100, antiPatternPenalty: 0, overallScore: 100 };
    }

    const comparison = calculateBaselineComparison(modelScores, baselineScores, decodedModelId, baselineModelId);
    res.json(comparison);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/baseline/run
 */
router.post('/baseline/run', async (req, res) => {
  try {
    const { testIds } = req.body;
    if (!testIds || !Array.isArray(testIds)) return res.status(400).json({ error: 'testIds array is required' });
    const { baselineEngine } = await import('../../modules/tooly/baseline-engine.js');
    const results = await baselineEngine.runBaselineSuite(testIds);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
