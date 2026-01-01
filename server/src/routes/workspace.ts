import { Request, Response, Router } from 'express';
import { workspaceService } from '../services/workspace-service.js';

const router: Router = Router();

/**
 * GET /api/workspace
 * Get current workspace info
 */
router.get('/workspace', (_req: Request, res: Response) => {
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
router.post('/workspace/safe-mode', (req: Request, res: Response) => {
  const { enabled } = req.body;
  workspaceService.setSafeMode(!!enabled);
  res.json({ success: true, safeMode: workspaceService.isSafeMode() });
});

/**
 * POST /api/workspace/switch
 * Switch workspace
 */
router.post('/workspace/switch', async (req: Request, res: Response) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  const result = await workspaceService.setWorkspace(path);
  if (result.success) {
    return res.json({ success: true, path: workspaceService.getCurrentWorkspace() });
  }

  return res.status(500).json({ error: 'Failed to switch workspace' });
});

export const workspaceRouter = router;
