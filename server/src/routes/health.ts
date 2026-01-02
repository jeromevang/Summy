/**
 * Health Check Endpoints
 * Improvement #11
 */

import { Router, Request, Response } from 'express';
import { db } from '../../../database/src/services/database.js';
import axios from 'axios';

const router: Router = Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    }
  });
});

/**
 * GET /ready
 * Readiness check (all services available)
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const services: Record<string, boolean> = {};

  // Check database
  try {
    db.getConnection().prepare('SELECT 1').get();
    services.database = true;
  } catch (e) {
    services.database = false;
  }

  // Check RAG server
  try {
    await axios.get('http://localhost:3002/api/rag/health', { timeout: 2000 });
    services.rag = true;
  } catch (e) {
    services.rag = false;
  }

  const ready = Object.values(services).every(s => s);

  res.status(ready ? 200 : 503).json({
    ready,
    services
  });
});

export const healthRouter = router;
