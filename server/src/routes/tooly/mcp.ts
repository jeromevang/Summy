import { Router } from 'express';
import { mcpClient } from '../../modules/tooly/mcp-client.js';

const router = Router();

/**
 * GET /api/tooly/mcp/status
 * Get MCP connection status
 */
router.get('/status', (req, res) => {
  res.json(mcpClient.getStatus());
});

/**
 * POST /api/tooly/mcp/connect
 * Connect to MCP server
 */
router.post('/connect', async (req, res) => {
  try {
    await mcpClient.connect();
    res.json({ success: true, status: mcpClient.getStatus() });
  } catch (error: any) {
    console.error('[Tooly] Failed to connect MCP:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/mcp/disconnect
 * Disconnect from MCP server
 */
router.post('/disconnect', (req, res) => {
  mcpClient.disconnect();
  res.json({ success: true });
});

/**
 * GET /api/tooly/mcp/tools
 * List available MCP tools
 */
router.get('/tools', async (req, res) => {
  try {
    const tools = await mcpClient.listTools();
    res.json({ tools });
  } catch (error: any) {
    console.error('[Tooly] Failed to list tools:', error);
    res.status(500).json({ error: error.message });
  }
});

export const mcpRouter = router;
