/**
 * Enhanced Workspace Routes
 * Improvement #3 - Additional endpoints
 */

import { Router, Request, Response } from 'express';
import { workspaceService } from '../services/workspace-service.js';

const router: Router = Router();

/**
 * GET /api/workspace/current
 * Get detailed current workspace info
 */
router.get('/workspace/current', async (_req: Request, res: Response) => {
  const currentPath = workspaceService.getCurrentWorkspace();
  const projectHash = workspaceService.getProjectHash(currentPath);
  const gitStatus = await workspaceService.getGitStatus();

  return res.json({
    path: currentPath,
    projectHash,
    git: gitStatus,
    safeMode: workspaceService.isSafeMode()
  });
});

/**
 * GET /api/workspace/recent
 * Get recent workspaces
 */
router.get('/workspace/recent', (_req: Request, res: Response) => {
  const recent = workspaceService.getRecentWorkspaces();
  return res.json(recent.map(path => ({
    path,
    projectHash: workspaceService.getProjectHash(path)
  })));
});

/**
 * GET /api/workspace/git-status
 * Get git status for current workspace
 */
router.get('/workspace/git-status', async (_req: Request, res: Response) => {
  const gitStatus = await workspaceService.getGitStatus();
  return res.json(gitStatus);
});

/**
 * GET /api/workspace/safe-mode
 * Get safe mode status
 */
router.get('/workspace/safe-mode', (_req: Request, res: Response) => {
  return res.json({
    enabled: workspaceService.isSafeMode(),
    reason: workspaceService.isSafeMode() ? 'Workspace has uncommitted changes' : null
  });
});

/**
 * POST /api/workspace/validate-operation
 * Validate if an operation is allowed
 */
router.post('/workspace/validate-operation', async (req: Request, res: Response) => {
  const { operation, path } = req.body;

  if (!operation || !path) {
    return res.status(400).json({ error: 'operation and path required' });
  }

  const validation = await workspaceService.validateOperation(operation, path);

  if (!validation.allowed) {
    return res.status(403).json({
      error: validation.reason,
      code: 'OPERATION_NOT_ALLOWED'
    });
  }

  return res.json({ allowed: true });
});

/**
 * POST /api/workspace/refresh
 * Refresh workspace state
 */
router.post('/workspace/refresh', async (_req: Request, res: Response) => {
  await workspaceService.refreshWorkspace();
  return res.json({ success: true });
});

/**
 * GET /api/workspace/metadata
 * Get project metadata
 */
router.get('/workspace/metadata', (_req: Request, res: Response) => {
  const metadata = workspaceService.getProjectMetadata();
  return res.json(metadata);
});

/**
 * POST /api/workspace/metadata
 * Set project metadata
 */
router.post('/workspace/metadata', (req: Request, res: Response) => {
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'key is required' });
  }

  workspaceService.setProjectMetadata(key, value);
  return res.json({ success: true });
});

export const workspaceEnhancedRouter = router;
