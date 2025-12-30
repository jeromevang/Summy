// Crash visibility - catch unhandled errors
process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { LMStudioClient } from '@lmstudio/sdk';

// Import new route modules
import { toolyRoutes, notificationsRoutes, analyticsRoutes, ragRoutes, sessionsRoutes, systemRoutes } from './routes/index.js';
import { notifications } from './services/notifications.js';
import { scheduleBackupCleanup } from './modules/tooly/rollback.js';
import { mcpOrchestrator } from './modules/tooly/orchestrator/mcp-orchestrator.js';
import { mcpClient } from './modules/tooly/mcp-client.js';
import { testSandbox } from './modules/tooly/test-sandbox.js';
import { prostheticPromptBuilder } from './modules/tooly/orchestrator/prosthetic-prompt-builder.js';
import { probeEngine } from './modules/tooly/probe-engine.js';
import { cacheService } from './services/cache/cache-service.js';
import { modelManager as enhancedModelManager } from './services/model-manager.js';
import { traceManager, tracingMiddleware, TraceStorage } from './services/tracing.js';
import { HealthCheckScheduler } from './services/health-checks.js';
import { logger, loggingMiddleware } from './services/enhanced-logger.js';
import { wsBroadcast } from './services/ws-broadcast.js';
import { systemMetrics } from './services/system-metrics.js';
import { modelManager as lmStudioModelManager } from './services/lmstudio-model-manager.js';
import { ideMapping, type IDEMapping } from './services/ide-mapping.js';
import { TOOL_SCHEMAS } from './modules/tooly/tool-prompts.js';
import { ALL_TOOLS, capabilities } from './modules/tooly/capabilities.js';
import { db, type ContextMessage, type ContextTurn } from './services/database.js';
import { dbManager } from './services/db/db-service.js';

// Modularized Services
import { addDebugEntry, debugLog } from './services/logger.js';
import { wsClients, broadcastToClients, broadcastStatus } from './services/broadcast-util.js';
import { loadServerSettings, saveServerSettings, type ServerSettings } from './services/settings-service.js';
import { SessionService, type ContextSession } from './services/session-service.js';
import { OpenAIProxy } from './services/openai-proxy.js';
import { CompressionEngine, type CompressionConfig } from './services/compression-engine.js';
import { getFullStatus, getSharedLMStudioClient, resetLMStudioClient } from './services/lmstudio-status.js';

export { addDebugEntry, broadcastToClients };

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server directory
console.log('🔧 DOTENV DEBUG: Loading .env from:', path.join(__dirname, '../.env'));
const dotenvResult = dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('🔧 DOTENV DEBUG: Result:', dotenvResult);
console.log('🔧 DOTENV DEBUG: OPENAI_API_KEY after dotenv:', process.env.OPENAI_API_KEY ? 'EXISTS' : 'MISSING');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(tracingMiddleware); // Add tracing middleware
app.use(loggingMiddleware); // Add enhanced logging middleware

// General request logging middleware - captures EVERYTHING from ngrok
app.use((req, res, next) => {
  // Skip logging internal endpoints and dashboard polling to reduce noise
  if (req.url === '/health' || req.url === '/debug' || req.url.startsWith('/debug/') || req.url === '/api/sessions') {
    return next();
  }
  
  // Skip logging dashboard polling requests
  if (req.headers['x-dashboard-request']) {
    return next();
  }

  addDebugEntry('request', `INCOMING: ${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    timestamp: new Date().toISOString()
  });

  // Continue to next middleware
  next();
});

// Configuration
const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists
fs.ensureDirSync(SESSIONS_DIR);

// Status interval (uses broadcast-util)
setInterval(() => broadcastStatus(getFullStatus), 30000);

// WebSocket connection handling (Imports are already handled)
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);
  wsBroadcast.registerClient(ws);

  // Send initial full status (check LM Studio on new connection)
  const status = await getFullStatus(true);
  ws.send(JSON.stringify({
    type: 'status',
    data: status,
    timestamp: new Date().toISOString()
  }));

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
    wsBroadcast.unregisterClient(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Connection error:', error);
    wsClients.delete(ws);
    wsBroadcast.unregisterClient(ws);
  });
});

// Context types and service logic now handled in services/session-service.ts and services/compression-engine.ts

const listSessions = async (): Promise<ContextSession[]> => {
  const dbSessions = db.listContextSessions(100, 0);
  return dbSessions.map(s => ({
    id: s.id,
    name: s.name,
    ide: s.ide,
    created: s.createdAt,
    conversations: []
  }));
};

// Extend Express Request type for our custom properties
declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      requestBody?: any;
    }
  }
}

// Parse SSE streaming response from OpenAI
// Note: Logic for agentic loops, session management, and proxy handling
// has been moved to modular services in src/services/ and src/modules/tooly/.
// -----------------------------------------------------------------------------

// Modular routes
app.use('/api/tooly', toolyRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/context-sessions', sessionsRoutes); // Legacy alias
app.use('/api', systemRoutes);

// Shared proxy routes
app.post('/chat/completions', OpenAIProxy.proxyToOpenAI);
app.post('/v1/chat/completions', OpenAIProxy.proxyToOpenAI);

// Initialize notification service with WebSocket server
notifications.initialize(wss);

// Schedule backup cleanup (every hour)
scheduleBackupCleanup(60 * 60 * 1000);

// Debug routes
app.get('/debug', (req, res) => {
    try {
        // Get server uptime
        const uptime = process.uptime();

        // Get session count
        const sessionsDir = path.join(__dirname, '../../sessions');
        let sessionCount = 0;
        try {
            if (fs.existsSync(sessionsDir)) {
                sessionCount = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json')).length;
            }
        } catch (e) { }

        // Get last activity
        let lastActivity = null;
        if (debugLog.length > 0) {
            lastActivity = debugLog[0].timestamp;
        }

        res.json({
            entries: debugLog,
            sessionCount,
            uptime,
            lastActivity
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/debug/clear', (req, res) => {
    try {
        debugLog.length = 0;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoints
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/detailed', async (req, res) => {
  try {
    const { HealthCheckOrchestrator } = await import('./services/health-checks.js');
    const summary = await HealthCheckOrchestrator.runAllChecks();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
app.get('/health/components', async (req, res) => {
  try {
    const { HealthCheckOrchestrator } = await import('./services/health-checks.js');
    const components = await HealthCheckOrchestrator.getComponentHealth();
    res.json(components);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Summy proxy server running on port ${PORT}`);
  console.log(`📁 Sessions stored in: ${SESSIONS_DIR}`);
  console.log(`🔌 WebSocket server ready for real-time updates`);
  console.log('✅ SERVER STARTED - Manual proxy (no http-proxy-middleware):');
  console.log('  📝 General logging middleware: ACTIVE');
  console.log('  🤖 Manual proxy routes: POST /chat/completions, /v1/chat/completions');
  console.log('  📊 API routes: /api/*');
  console.log('  🔧 Tooly routes: /api/tooly/*');
  console.log('  🔔 Notifications: /api/notifications/*');
  console.log('  📈 Analytics: /api/analytics/*');

  // Initialize cache service
  try {
    await cacheService.initialize();
    console.log('  🚀 Cache service initialized');
  } catch (error) {
    console.error('❌ Cache service initialization failed:', error);
  }

  // Initialize model manager
  try {
    await enhancedModelManager.initialize();
    console.log('  🤖 Model manager initialized');
  } catch (error) {
    console.error('❌ Model manager initialization failed:', error);
  }

  // Initialize tracing system
  try {
    await TraceStorage.initialize();
    console.log('  📍 Distributed tracing initialized');
  } catch (error) {
    console.error('❌ Tracing initialization failed:', error);
  }

  // Start health check scheduler
  try {
    HealthCheckScheduler.start(5); // Check every 5 minutes
    console.log('  🩺 Health check scheduler started');
  } catch (error) {
    console.error('❌ Health check scheduler failed:', error);
  }

  // Initialize enhanced logging
  try {
    const { LogFileManager } = await import('./services/enhanced-logger.js');
    await LogFileManager.getInstance();
    console.log('  📝 Enhanced logging system initialized');
  } catch (error) {
    console.error('❌ Enhanced logging initialization failed:', error);
  }

  // Startup cleanup: Unload any stale LLM models from LM Studio
  // (Embedding models are NOT touched - they use a separate API)
  try {
const { lmStudioModelManager } = await import('./services/lmstudio-model-manager.js');
await lmStudioModelManager.cleanupOnStartup();

    // Trigger automated ground truth sweep for all tests
    const { baselineEngine } = await import('./modules/tooly/baseline-engine.js');
    baselineEngine.autoGenerateBaselines().then(results => {
      if (results.length > 0) {
        console.log(`  🤖 [Baseline] Auto-generated ground truth for ${results.length} tests.`);
      }
    }).catch(err => {
      console.warn('  ⚠️ [Baseline] Auto-generation sweep failed:', err.message);
    });

  } catch (error) {
    console.log('  ⚠️ Startup initialization tasks skipped or failed');
  }

  // Start system metrics collection
  systemMetrics.start(1000); // Collect every 1 second
  console.log('  📊 System metrics: ACTIVE (CPU/GPU monitoring)');
  console.log('  🔌 WebSocket: Ready for real-time updates');
});

// Graceful shutdown handling - prevents EADDRINUSE on nodemon restarts
const gracefulShutdown = (signal: string) => {
  console.log(`\n⚡ Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');

    // Close WebSocket connections
    wss.clients.forEach(client => {
      client.close();
    });
    wss.close(() => {
      console.log('✅ WebSocket server closed');

      // Stop metrics collection
      systemMetrics.stop();
      console.log('✅ System metrics stopped');

      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

// Export wsBroadcast for use in routes
export { wsBroadcast };

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
