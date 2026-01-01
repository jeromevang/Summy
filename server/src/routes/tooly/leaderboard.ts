import { Router } from 'express';
import { capabilities, ModelProfile } from '../../modules/tooly/capabilities.js';
import { extractBadgeScores } from '../../modules/tooly/badges.js';

const router: Router = Router();

/**
 * GET /api/tooly/leaderboards
 * Get top 3 models per category
 */
router.get('/leaderboards', async (_req, res) => {
  try {
    const allProfiles = await capabilities.getAllProfiles();

    const leaderboardCategories = [
      { id: 'rag', name: 'Best for RAG', icon: '🔍', scoreKey: 'ragScore' },
      { id: 'architect', name: 'Best Architect', icon: '🏗️', scoreKey: 'architecturalScore' },
      { id: 'navigator', name: 'Best Navigator', icon: '🧭', scoreKey: 'navigationScore' },
      { id: 'reviewer', name: 'Best Reviewer', icon: '🐛', scoreKey: 'bugDetectionScore' },
      { id: 'proactive', name: 'Most Proactive', icon: '💡', scoreKey: 'proactiveScore' },
      { id: 'overall', name: 'Best Overall', icon: '🏆', scoreKey: 'overallScore' },
    ];

    const leaderboards = leaderboardCategories.map((category) => {
      const sorted = allProfiles
        .map((profile: ModelProfile) => {
          const badgeScores = extractBadgeScores(profile);
          const score = (badgeScores as any)[category.scoreKey] ??
            profile.probeResults?.overallScore ??
            profile.score ?? 0;
          return {
            modelId: profile.modelId,
            displayName: profile.displayName || profile.modelId.split('/').pop() || profile.modelId,
            score: Math.round(score),
          };
        })
        .filter((p: any) => p.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3)
        .map((entry: any, index: number) => ({ ...entry, rank: index + 1 }));

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

export const leaderboardRouter = router;
