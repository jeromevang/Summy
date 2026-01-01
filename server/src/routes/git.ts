import { Router } from 'express';
import { gitService } from '../services/git-service.js';

const router: Router = Router();

/**
 * GET /api/git/status
 * Get git status of current workspace
 */
router.get('/status', async (_req, res) => {
  try {
    const status = await gitService.getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export const gitRouter = router;
