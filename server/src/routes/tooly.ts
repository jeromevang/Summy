/**
 * Tooly API Routes
 * Handles model discovery, testing, capabilities, logs, and rollback
 */

import { Router } from 'express';
import { modelDiscovery } from '../services/model-discovery.js';
import { analytics } from '../services/analytics.js';
import { db } from '../services/database.js';
import { capabilities, ALL_TOOLS } from '../modules/tooly/capabilities.js';
import { testEngine, TEST_DEFINITIONS } from '../modules/tooly/test-engine.js';
import { rollback } from '../modules/tooly/rollback.js';
import { mcpClient } from '../modules/tooly/mcp-client.js';

const router = Router();

// ============================================================
// MODEL DISCOVERY
// ============================================================

/**
 * GET /api/tooly/models
 * Discover available models from all providers
 */
router.get('/models', async (req, res) => {
  try {
    const settingsPath = './data/settings.json';
    const fs = await import('fs-extra');
    let settings: any = {};
    
    try {
      if (await fs.pathExists(settingsPath)) {
        settings = await fs.readJson(settingsPath);
      }
    } catch {
      // Use defaults
    }

    const discovery = await modelDiscovery.discoverAll({
      lmstudioUrl: settings.lmstudioUrl,
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName
    });

    // Combine all models into a single list
    const models = [
      ...discovery.lmstudio,
      ...discovery.openai,
      ...discovery.azure
    ];

    res.json({
      models,
      lastUpdated: discovery.lastUpdated,
      providers: {
        lmstudio: discovery.lmstudio.length > 0,
        openai: discovery.openai.length > 0,
        azure: discovery.azure.length > 0
      }
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to discover models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/models/:modelId
 * Get detailed profile for a specific model
 */
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const profile = await capabilities.getProfile(modelId);
    
    if (!profile) {
      res.status(404).json({ error: 'Model profile not found' });
      return;
    }
    
    res.json(profile);
  } catch (error: any) {
    console.error('[Tooly] Failed to get model profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tooly/models/:modelId/test
 * Run capability tests for a model
 */
router.post('/models/:modelId/test', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { provider = 'lmstudio', tools } = req.body;
    
    // Load settings
    const settingsPath = './data/settings.json';
    const fs = await import('fs-extra');
    let settings: any = {};
    
    try {
      if (await fs.pathExists(settingsPath)) {
        settings = await fs.readJson(settingsPath);
      }
    } catch {
      // Use defaults
    }

    const testSettings = {
      lmstudioUrl: settings.lmstudioUrl || 'http://localhost:1234',
      openaiApiKey: process.env.OPENAI_API_KEY,
      azureResourceName: settings.azureResourceName,
      azureApiKey: settings.azureApiKey,
      azureDeploymentName: settings.azureDeploymentName,
      azureApiVersion: settings.azureApiVersion
    };

    let result;
    if (tools && Array.isArray(tools)) {
      result = await testEngine.runTestsForTools(modelId, provider, tools, testSettings);
    } else {
      result = await testEngine.runAllTests(modelId, provider, testSettings);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[Tooly] Failed to run tests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/tools/:tool
 * Toggle a tool for a model
 */
router.put('/models/:modelId/tools/:tool', async (req, res) => {
  try {
    const { modelId, tool } = req.params;
    const { enabled } = req.body;
    
    await capabilities.toggleTool(modelId, tool, enabled);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to toggle tool:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tooly/models/:modelId/prompt
 * Update custom system prompt for a model
 */
router.put('/models/:modelId/prompt', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { systemPrompt } = req.body;
    
    await capabilities.updateSystemPrompt(modelId, systemPrompt);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tooly] Failed to update prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TEST DEFINITIONS
// ============================================================

/**
 * GET /api/tooly/tests
 * Get all test definitions
 */
router.get('/tests', (req, res) => {
  res.json({
    tests: TEST_DEFINITIONS,
    totalTests: TEST_DEFINITIONS.length,
    tools: ALL_TOOLS
  });
});

/**
 * GET /api/tooly/tests/:tool
 * Get tests for a specific tool
 */
router.get('/tests/:tool', (req, res) => {
  const { tool } = req.params;
  const tests = testEngine.getTestsForTool(tool);
  res.json({ tests, tool, count: tests.length });
});

// ============================================================
// EXECUTION LOGS
// ============================================================

/**
 * GET /api/tooly/logs
 * Get execution logs with optional filters
 */
router.get('/logs', (req, res) => {
  try {
    const { tool, status, sessionId, limit = 50, offset = 0 } = req.query;
    
    const logs = db.getExecutionLogs({
      tool: tool as string,
      status: status as string,
      sessionId: sessionId as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
    
    res.json({ logs });
  } catch (error: any) {
    console.error('[Tooly] Failed to get logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/logs/:id
 * Get specific execution log with backups
 */
router.get('/logs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const log = db.getExecutionLog(id);
    
    if (!log) {
      res.status(404).json({ error: 'Log not found' });
      return;
    }
    
    const backups = rollback.getBackupsForExecution(id);
    res.json({ log, backups });
  } catch (error: any) {
    console.error('[Tooly] Failed to get log:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ROLLBACK
// ============================================================

/**
 * POST /api/tooly/backups/:id/restore
 * Restore a file from backup
 */
router.post('/backups/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await rollback.restore(id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('[Tooly] Failed to restore backup:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tooly/backups/:id/status
 * Check if backup can still be restored
 */
router.get('/backups/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const canRestore = rollback.canRestore(id);
    const timeRemaining = rollback.getTimeRemaining(id);
    
    res.json({
      canRestore,
      timeRemaining,
      timeRemainingFormatted: timeRemaining !== null 
        ? rollback.formatTimeRemaining(timeRemaining) 
        : null
    });
  } catch (error: any) {
    console.error('[Tooly] Failed to get backup status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// MCP STATUS
// ============================================================

/**
 * GET /api/tooly/mcp/status
 * Get MCP connection status
 */
router.get('/mcp/status', (req, res) => {
  res.json(mcpClient.getStatus());
});

/**
 * POST /api/tooly/mcp/connect
 * Connect to MCP server
 */
router.post('/mcp/connect', async (req, res) => {
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
router.post('/mcp/disconnect', (req, res) => {
  mcpClient.disconnect();
  res.json({ success: true });
});

/**
 * GET /api/tooly/mcp/tools
 * List available MCP tools
 */
router.get('/mcp/tools', async (req, res) => {
  try {
    const tools = await mcpClient.listTools();
    res.json({ tools });
  } catch (error: any) {
    console.error('[Tooly] Failed to list tools:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

