import { Router } from 'express';

const router = Router();

/**
 * GET /api/tooly/failures
 * Get recorded failures
 */
router.get('/failures', (req, res) => {
  res.json({ failures: [] });
});

/**
 * GET /api/tooly/failures/patterns
 * Get failure patterns
 */
router.get('/failures/patterns', (req, res) => {
  res.json({ patterns: [] });
});

export const failuresRouter = router;
