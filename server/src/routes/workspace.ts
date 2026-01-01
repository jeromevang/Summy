import { Router } from 'express';
import { workspaceService } from '../services/workspace-service.js';

const router: Router = Router();

/**
 * GET /api/workspace
 * Get current workspace info
 */
router.get('/workspace', (req, res) => {
  res.json({
    current: workspaceService.getCurrentWorkspace(),
    recent: workspaceService.getRecentWorkspaces(),
    safeMode: workspaceService.isSafeMode()
  });
});

/**
 * POST /api/workspace/safe-mode
 * Toggle safe mode
 */
router.post('/workspace/safe-mode', (req, res) => {
  const { enabled } = req.body;
  workspaceService.setSafeMode(!!enabled);
  res.json({ success: true, safeMode: workspaceService.isSafeMode() });
});

/**
 * POST /api/workspace/switch
 * Switch workspace
 */
router.post('/workspace/switch', async (req, res) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  const result = await workspaceService.setWorkspace(path);
  if (result.success) {
    res.json({ success: true, path: workspaceService.getCurrentWorkspace() });
  } else {
    res.status(500).json({ error: result.error });
  }
});

export const workspaceRouter = router;
