/**
 * Analytics API Routes
 */

import { Router } from 'express';
import { analytics } from '../services/analytics.js';

const router: Router = Router();

/**
 * GET /api/analytics
 * Get analytics summary for a time period
 */
router.get('/', (req, res) => {
  try {
    const period = (req.query['period'] as 'day' | 'week' | 'month') || 'week';
    const summary = analytics.getFormattedSummary(period);
    res.json(summary);
  } catch (error: any) {
    console.error('[Analytics] Failed to get summary:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

