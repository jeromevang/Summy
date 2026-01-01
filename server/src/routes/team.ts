import { Router } from 'express';
import { teamService } from '../services/team-service.js';

const router: Router = Router();

/**
 * GET /api/team
 * Get team config for current workspace
 */
router.get('/team', (_req, res) => {
  const team = teamService.getCurrentTeam();
  res.json({ team });
});

/**
 * POST /api/team
 * Save team config
 */
router.post('/team', (req, res) => {
  const { mainModelId, executorEnabled, executorModelId, agents } = req.body;

  if (!mainModelId) {
    return res.status(400).json({ error: 'Main Architect model is required' });
  }

  const team = teamService.saveCurrentTeam({
    mainModelId,
    executorEnabled: !!executorEnabled,
    executorModelId: executorModelId || '',
    agents: agents || []
  });

  res.json({ success: true, team });
  return;
});

export const teamRouter = router;
