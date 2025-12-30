import { Router } from 'express';
import { mcpClient } from '../../modules/tooly/mcp-client.js';

const router = Router();

/**
 * GET /api/tooly/mcp/status
 */
router.get('/mcp/status', (req, res) => {
  res.json(mcpClient.getStatus());
});

/**
 * POST /api/tooly/mcp/connect
 */
router.post('/mcp/connect', async (req, res) => {
  try {
    await mcpClient.connect();
    res.json({ success: true, status: mcpClient.getStatus() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/mcp/disconnect
 */
router.post('/mcp/disconnect', (req, res) => {
  mcpClient.disconnect();
  res.json({ success: true });
});

/**
 * GET /api/tooly/mcp/tools
 */
router.get('/mcp/tools', async (req, res) => {
  try {
    const tools = await mcpClient.listTools();
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
