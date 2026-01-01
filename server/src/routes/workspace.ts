import { Request, Response, Router } from 'express';
import { workspaceService } from '../services/workspace-service.js';
import fs from 'fs';
import path from 'path';

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
 * GET /api/workspace/current-folder
 * Get the actual current working directory
 */
router.get('/workspace/current-folder', (_req: Request, res: Response) => {
  res.json({
    currentFolder: process.cwd()
  });
});

/**
 * GET /api/workspace/browse
 * Browse directories from a given path
 */
router.get('/workspace/browse', (req: Request, res: Response) => {
  const { path: browsePath = process.cwd() } = req.query;

  try {

    console.log('Browse request:', { browsePath, cwd: process.cwd() });

    // Resolve the path to prevent directory traversal
    const resolvedPath = path.resolve(browsePath as string);

    console.log('Resolved path:', resolvedPath);

    // Check if path exists and is a directory
    if (!fs.existsSync(resolvedPath)) {
      console.log('Path does not exist:', resolvedPath);
      return res.status(404).json({ error: 'Path not found' });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      console.log('Path is not a directory:', resolvedPath);
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    console.log('Path exists and is directory, reading contents...');

    // Read directory contents
    const items = fs.readdirSync(resolvedPath).map((item: string) => {
      const itemPath = path.join(resolvedPath, item);
      const itemStat = fs.statSync(itemPath);

      return {
        name: item,
        path: itemPath,
        isDirectory: itemStat.isDirectory(),
        size: itemStat.size,
        modified: itemStat.mtime
      };
    });

    // Sort: directories first, then files, alphabetically
    items.sort((a: any, b: any) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({
      currentPath: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      items
    });
  } catch (err: any) {
    console.error('Browse error:', err);
    return res.status(500).json({ error: 'Failed to browse directory' });
  }
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
