import { Router } from 'express';
import { getIndexer } from '../../services/indexer.js';
import { getRAGDatabase } from '../../services/database.js';

export const createRAGRoutes = (indexer: any, config: any): Router => {
  const router = Router();

  router.get('/health', (req, res) => res.json({ status: 'ok', indexStatus: indexer.getProgress().status }));
  router.get('/config', (req, res) => res.json(config));
  router.get('/stats', async (req, res) => res.json({ projectPath: config.project.path, status: indexer.getProgress().status }));

  router.post('/query', async (req, res) => {
    const { query, limit = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const results = await indexer.query(query, limit);
    res.json({ results, query });
  });

  router.post('/index', async (req, res) => {
    const { projectPath } = req.body;
    if (!projectPath) return res.status(400).json({ error: 'projectPath is required' });
    indexer.indexProject(projectPath);
    res.json({ success: true, message: 'Indexing started' });
  });

  return router;
};
