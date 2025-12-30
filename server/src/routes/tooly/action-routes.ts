import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { db } from '../../services/database.js';
import { rollback } from '../../modules/tooly/rollback.js';
import { ideMapping } from '../../services/ide-mapping.js';
import { capabilities, ALL_TOOLS, TOOL_CATEGORIES, ModelProfile } from '../../modules/tooly/capabilities.js';
import { calculateBadges, extractBadgeScores } from '../../modules/tooly/badges.js';
import { calculateRecommendations } from '../../modules/tooly/recommendations.js';
import { lookupModelInfo } from '../../services/model-info-lookup.js';
import { failureLog } from '../../services/failure-log.js';
import { failureObserver } from '../../services/failure-observer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ============================================================
// LOGS & ROLLBACK
// ============================================================

router.get('/logs', (req, res) => {
  try {
    const { tool, status, sessionId, limit = 50, offset = 0 } = req.query;
    const logs = db.getExecutionLogs({ tool: tool as string, status: status as string, sessionId: sessionId as string, limit: parseInt(limit as string), offset: parseInt(offset as string) });
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/backups/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await rollback.restore(id);
    result.success ? res.json(result) : res.status(400).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// LEADERBOARDS & DETAIL
// ============================================================

router.get('/leaderboards', async (req, res) => {
  try {
    const allProfiles = await capabilities.getAllProfiles();
    const cats = [
      { id: 'rag', name: 'Best for RAG', icon: '🔍', scoreKey: 'ragScore' },
      { id: 'architect', name: 'Best Architect', icon: '🏗️', scoreKey: 'architecturalScore' },
      { id: 'navigator', name: 'Best Navigator', icon: '🧭', scoreKey: 'navigationScore' },
      { id: 'reviewer', name: 'Best Reviewer', icon: '🐛', scoreKey: 'bugDetectionScore' },
      { id: 'proactive', name: 'Most Proactive', icon: '💡', scoreKey: 'proactiveScore' },
      { id: 'overall', name: 'Best Overall', icon: '🏆', scoreKey: 'overallScore' },
    ];
    const leaderboards = cats.map(cat => {
      const sorted = allProfiles.map((p: ModelProfile) => {
        const badgeScores = extractBadgeScores(p);
        const score = (badgeScores as Record<string, any>)[cat.scoreKey] ?? p.probeResults?.overallScore ?? p.score ?? 0;
        return { modelId: p.modelId, displayName: p.displayName || p.modelId.split('/').pop(), score: Math.round(score) };
      }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((e, i) => ({ ...e, rank: i + 1 }));
      return { ...cat, entries: sorted };
    });
    res.json({ categories: leaderboards });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/models/:modelId/detail', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.modelId);
    const profile = await capabilities.getProfile(modelId);
    if (!profile) return res.status(404).json({ error: 'Model profile not found' });

    const badgeScores = extractBadgeScores(profile);
    const allProfiles = await capabilities.getAllProfiles();
    const alternatives = allProfiles.filter(p => p.modelId !== modelId).map(p => ({ modelId: p.modelId, modelName: p.displayName || p.modelId, scores: extractBadgeScores(p) }));
    
    const recommendations = calculateRecommendations(badgeScores, alternatives);
    const toolCategories = Object.entries(TOOL_CATEGORIES).map(([name, tools]) => {
      const toolsWithStatus = tools.map(tool => ({ name: tool, enabled: profile.enabledTools?.includes(tool), score: profile.capabilities?.[tool]?.score || 0 }));
      return { name, tools: toolsWithStatus, enabledCount: toolsWithStatus.filter(t => t.enabled).length, totalCount: tools.length, score: Math.round(toolsWithStatus.filter(t => t.score > 0).reduce((s, t) => s + t.score, 0) / (toolsWithStatus.filter(t => t.score > 0).length || 1)) };
    });

    res.json({ ...profile, badges: calculateBadges(badgeScores), recommendations, toolCategories, scoreBreakdown: badgeScores });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// FAILURES & PROSTHETICS
// ============================================================

router.get('/failures', (req, res) => {
  try {
    const failures = failureLog.getFailures(req.query as any);
    res.json({ failures, count: failures.length, stats: failureLog.getStats() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/readiness/assess', async (req, res) => {
  try {
    const { modelId, executorModelId, autoTeach, runCount = 1 } = req.body;
    const { createReadinessRunner } = await import('../../modules/tooly/testing/readiness-runner.js');
    const runner = createReadinessRunner(await fs.readJson(path.join(__dirname, '../../../settings.json')));
    const result = await runner.assessModel(modelId, { provider: capabilities.detectProviderFromModelId(modelId), executorModelId, runCount });
    await capabilities.updateAgenticReadiness(modelId, { certified: result.passed, score: result.overallScore, assessedAt: new Date().toISOString(), categoryScores: result.categoryScores, failedTests: result.failedTests || [], testResults: result.testResults || [] }, result.trainabilityScores);
    res.json({ assessment: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
