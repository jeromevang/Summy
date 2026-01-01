import { Router } from 'express';

const router: Router = Router();

/**
 * GET /api/tooly/failures
 * Get recorded failures
 */
router.get('/failures', (_req, res) => {
  res.json({ failures: [] });
});

/**
 * GET /api/tooly/failures/patterns
 * Get failure patterns
 */
router.get('/failures/patterns', (_req, res) => {
  res.json({ patterns: [] });
});

export const failuresRouter = router;
