/**
 * Hook Monitoring API Routes
 * Provides endpoints for querying hook execution history and statistics
 */

import express, { Request, Response } from 'express';
import {
  getRecentExecutions,
  getExecution,
  getHookStats,
  getActiveExecutions,
  clearHistory,
  logHookStart,
  logHookComplete,
  logHookError
} from '../services/hook-logger.js';

const router = express.Router();

// ============================================================
// GET ROUTES
// ============================================================

/**
 * GET /api/hooks/activity
 * Get recent hook executions
 */
router.get('/activity', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const executions = getRecentExecutions(limit);

    res.json({
      success: true,
      executions,
      count: executions.length
    });
  } catch (error) {
    console.error('[Hooks API] Error fetching activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hook activity'
    });
  }
});

/**
 * GET /api/hooks/stats
 * Get hook execution statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getHookStats();

    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Hooks API] Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch hook statistics'
    });
  }
});

/**
 * GET /api/hooks/active
 * Get currently running hooks
 */
router.get('/active', (_req: Request, res: Response) => {
  try {
    const active = getActiveExecutions();

    return res.json({
      success: true,
      active,
      count: active.length
    });
  } catch (error) {
    console.error('[Hooks API] Error fetching active hooks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch active hooks'
    });
  }
});

/**
 * GET /api/hooks/:id
 * Get specific hook execution details
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Hook ID is required'
      });
    }

    const execution = getExecution(id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Hook execution not found'
      });
    }

    return res.json({
      success: true,
      execution
    });
  } catch (error) {
    console.error('[Hooks API] Error fetching execution:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch hook execution'
    });
  }
});

// ============================================================
// POST ROUTES (for hooks to log activity)
// ============================================================

/**
 * POST /api/hooks/log-start
 * Log the start of a hook execution
 */
router.post('/log-start', (req: Request, res: Response) => {
  try {
    const { hookName, transcriptPath, messageCount } = req.body;

    if (!hookName) {
      return res.status(400).json({
        success: false,
        error: 'hookName is required'
      });
    }

    const id = logHookStart({
      hookName,
      transcriptPath,
      messageCount
    });

    return res.json({
      success: true,
      id
    });
  } catch (error) {
    console.error('[Hooks API] Error logging start:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to log hook start'
    });
  }
});

/**
 * POST /api/hooks/log-complete
 * Log successful completion of a hook execution
 */
router.post('/log-complete', (req: Request, res: Response) => {
  try {
    const { id, summary, compression, tokensSaved, duration, lmStudioTime, cliTime } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'id is required'
      });
    }

    logHookComplete(id, {
      summary,
      compression,
      tokensSaved,
      duration,
      lmStudioTime,
      cliTime
    });

    return res.json({
      success: true
    });
  } catch (error) {
    console.error('[Hooks API] Error logging completion:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to log hook completion'
    });
  }
});

/**
 * POST /api/hooks/log-error
 * Log failure of a hook execution
 */
router.post('/log-error', (req: Request, res: Response) => {
  try {
    const { id, error } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'id is required'
      });
    }

    logHookError(id, error || 'Unknown error');

    return res.json({
      success: true
    });
  } catch (error) {
    console.error('[Hooks API] Error logging error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to log hook error'
    });
  }
});

// ============================================================
// DELETE ROUTES
// ============================================================

/**
 * DELETE /api/hooks/history
 * Clear hook execution history
 */
router.delete('/history', (_req: Request, res: Response) => {
  try {
    clearHistory();

    return res.json({
      success: true,
      message: 'Hook history cleared'
    });
  } catch (error) {
    console.error('[Hooks API] Error clearing history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear history'
    });
  }
});

export default router;
