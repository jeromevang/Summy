import { Router } from 'express';
import { db } from '../../services/database.js';
import { rollback } from '../../modules/tooly/rollback.js';

const router: Router = Router();

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

export const logsRouter = router;
