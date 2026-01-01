import { Router } from 'express';
import os from 'os';

const router = Router();

/**
 * GET /api/bridge/info
 * Get connection info for external agents (the "Bridge")
 */
router.get('/bridge/info', (req, res) => {
  const hostname = os.hostname().toLowerCase();
  const port = process.env.PORT || 3001;
  const ragPort = 3002; // RAG usually runs on 3002

  const bridgePrompt = `
You have access to the Summy RAG API for this project.
To search the codebase semantically or find symbols, use the following tools/endpoints:

Base URL: http://localhost:${ragPort}

1. Semantic Search:
   POST /api/rag/query
   Body: { "query": "your search query" }

2. Navigation (Symbol Lookup):
   GET /api/nav/symbols?query=symbolName

3. Workspace Info:
   GET http://localhost:${port}/api/workspace

Use these endpoints to ground your answers in the actual codebase.
`.trim();

  res.json({
    status: 'active',
    endpoints: {
      rag: `http://localhost:${ragPort}/api/rag`,
      nav: `http://localhost:${ragPort}/api/nav`,
      workspace: `http://localhost:${port}/api/workspace`
    },
    systemPromptSnippet: bridgePrompt
  });
});

export const apiBridgeRouter = router;
