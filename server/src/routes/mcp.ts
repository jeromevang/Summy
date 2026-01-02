/**
 * MCP Server Management Routes
 *
 * Provides endpoints for managing the MCP server (restart, status, etc.)
 */

import { Router, Request, Response } from 'express';
import { mcpClient } from '../modules/tooly/mcp-client.js';

const router: Router = Router();

/**
 * POST /api/mcp/restart
 * Restart the MCP server to apply new configuration
 */
router.post('/restart', async (_req: Request, res: Response) => {
  try {
    console.log('[MCP API] Restart requested');

    // Restart MCP client (will respawn server with new settings)
    await mcpClient.restart();

    console.log('[MCP API] Restart successful');

    return res.json({
      success: true,
      message: 'MCP server restarted successfully'
    });
  } catch (error: any) {
    console.error('[MCP API] Restart failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to restart MCP server'
    });
  }
});

/**
 * GET /api/mcp/status
 * Get current MCP server status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const isConnected = mcpClient.isConnected();
    const connectionMode = mcpClient.getConnectionMode();

    return res.json({
      connected: isConnected,
      connectionMode,
      status: isConnected ? 'running' : 'disconnected'
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to get MCP status'
    });
  }
});

export default router;
