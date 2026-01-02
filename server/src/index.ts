/**
 * Summy Server Main Entry Point
 *
 * This file sets up and starts the Summy backend server, including:
 * - Global unhandled error/rejection logging.
 * - Express.js application setup with middleware (CORS, JSON parsing, tracing, logging).
 * - Configuration loading from environment variables.
 * - WebSocket server initialization for real-time communication.
 * - Integration of modular API routes.
 * - Proxy routes for OpenAI compatibility.
 * - Initialization and scheduling of various services (notifications, cache, tracing, health checks, system metrics).
 * - Automated tasks like backup cleanup and baseline generation.
 * - Graceful shutdown procedures.
 */

// --- Crash visibility - catch unhandled errors ---
/**
 * Global handler for uncaught exceptions. Logs the error and prevents the process from crashing silently.
 * @param err - The uncaught exception.
 */
process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/**
 * Global handler for unhandled promise rejections. Logs the error and prevents silent failures.
 * @param err - The unhandled promise rejection.
 */
process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

// --- Module Imports ---
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Import new route modules
import { toolyRoutes, notificationsRoutes, analyticsRoutes, ragRoutes, sessionsRoutes, systemRoutes, mcpRoutes, workspaceRouter, apiBridgeRouter, teamRouter, gitRouter, teamsEnhancedRouter, workspaceEnhancedRouter, healthRouter, hooksRouter } from './routes/index.js';
// Services
import { notifications } from './services/notifications.js';
import { scheduleBackupCleanup } from './modules/tooly/rollback.js';
import { cacheService } from './services/cache/cache-service.js';
import { tracingMiddleware, TraceStorage } from './services/tracing.js';
import { HealthCheckScheduler } from './services/health-checks.js';
import { loggingMiddleware } from './services/enhanced-logger.js';
import { wsBroadcast } from './services/ws-broadcast.js';
import { systemMetrics } from './services/system-metrics.js';
import { initializeHookLogger } from './services/hook-logger.js';

// Modularized Services with exports
import { addDebugEntry, debugLog } from './services/logger.js';
import { wsClients, broadcastStatus } from './services/broadcast-util.js';
import { OpenAIProxy } from './services/openai-proxy.js';
import { getFullStatus } from './services/lmstudio-status.js';

// New Improvements: Middleware and Error Handling (Improvements #5, #13)
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';

// Export addDebugEntry for external use if needed (e.g., within tool implementations)
export { addDebugEntry };

// --- ES module equivalent of __dirname and __filename ---
/** The current file path. */
const __filename = fileURLToPath(import.meta.url);
/** The directory name of the current file. */
const __dirname = path.dirname(__filename);

// --- Load environment variables ---
console.log('🔧 DOTENV DEBUG: Loading .env from:', path.join(__dirname, '../.env'));
const dotenvResult = dotenv.config({ path: path.join(__dirname, '../.env') });
if (dotenvResult.error) {
  console.error('⚠️ DOTENV ERROR:', dotenvResult.error);
}
console.log('🔧 DOTENV DEBUG: OPENAI_API_KEY after dotenv:', process.env['OPENAI_API_KEY'] ? 'EXISTS' : 'MISSING');

// --- Express App Setup ---
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env['PORT'] || 3001;

// --- Global Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies
app.use(tracingMiddleware); // Middleware for distributed tracing
app.use(loggingMiddleware); // Enhanced logging for requests and responses
app.use(requestIdMiddleware); // Request ID tracking (Improvement #13)

/**
 * General request logging middleware.
 * Captures and logs incoming HTTP requests, filtering out noisy internal endpoints and dashboard polls.
 */
app.use((req, _res, next) => {
  // Skip logging internal endpoints and dashboard polling to reduce noise
  if (req.url === '/health' || req.url === '/debug' || req.url.startsWith('/debug/') || req.url === '/api/sessions') {
    return next();
  }
  
  // Skip logging dashboard polling requests identified by a custom header
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

  next(); // Continue to next middleware
});

// --- Configuration ---
/** Directory for storing session files. */
const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists before starting
fs.ensureDirSync(SESSIONS_DIR);

// --- WebSocket Server Setup ---
/**
 * Interval for broadcasting system status to connected WebSocket clients.
 * Uses `getFullStatus` from `lmstudio-status.js` to get the status.
 */
setInterval(() => broadcastStatus(getFullStatus), 30000);

/**
 * Handles new WebSocket connections.
 * - Registers the client.
 * - Sends initial full system status.
 * - Sets up close and error handlers.
 */
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws); // Add to a generic list of clients
  wsBroadcast.registerClient(ws); // Register with the broadcast service

  // Send initial full status (activates LM Studio check on new connection)
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

// --- Extend Express Request type for custom properties ---
/**
 * Augment the Express Request interface to include custom properties
 * used across the application, such as `sessionId` and `requestBody`.
 */
declare global {
  namespace Express {
    interface Request {
      /** Optional ID for the current session. */
      sessionId?: string;
      /** Optional parsed request body, potentially used before standard body parsing middleware. */
      requestBody?: any;
      /** The trace ID for the current request. */
      traceId?: string;
    }
  }
}

// --- Modular Routes ---
// These routes handle specific API functionalities by delegating to modular routers.
app.use('/api/tooly', toolyRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/context-sessions', sessionsRoutes); // Legacy alias for sessions
app.use('/api', systemRoutes);
app.use('/api', workspaceRouter);
app.use('/api', apiBridgeRouter);
app.use('/api', teamRouter);
app.use('/api/git', gitRouter);
app.use('/api/hooks', hooksRouter);

// --- Enhanced Routes (Improvements #2, #3, #11) ---
app.use('/api', teamsEnhancedRouter); // Full Teams API with 12 endpoints
app.use('/api', workspaceEnhancedRouter); // Enhanced Workspace with git integration
app.use(healthRouter); // Health check endpoints (/health, /ready)

// --- Shared Proxy Routes ---
// These routes act as a proxy for OpenAI-compatible API calls, forwarding requests
// to the configured LLM provider (e.g., OpenAI, LM Studio).
app.post('/chat/completions', OpenAIProxy.proxyToOpenAI);
app.post('/v1/chat/completions', OpenAIProxy.proxyToOpenAI);

// --- Error Handlers (Improvement #5) ---
// MUST be after all routes
app.use(notFoundHandler); // Handle 404 errors
app.use(errorHandler); // Global error handler

// --- Service Initializations ---
// Initialize notification service with the WebSocket server instance
notifications.initialize(wss);

// Schedule cleanup for expired backups (e.g., every hour)
scheduleBackupCleanup(60 * 60 * 1000);

// --- Debug Routes ---
/**
 * Provides debug information about the server, including logs, session count, uptime, and last activity.
 */
app.get('/debug', (_req, res) => {
    try {
        const uptime = process.uptime(); // Get server uptime
        let sessionCount = 0;
        try {
            // Attempt to count session files, handle potential errors
            if (fs.existsSync(SESSIONS_DIR)) {
                sessionCount = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).length;
            }
        } catch (e) { /* istanbul ignore next */ } // Ignore if sessions directory cannot be read

        // Get timestamp of the most recent debug activity
        let lastActivity = null;
        if (debugLog.length > 0 && debugLog[0]) {
            lastActivity = debugLog[0].timestamp;
        }

        res.json({
            entries: debugLog,
            sessionCount,
            uptime,
            lastActivity
        });
    } catch (error: any) {
        /* istanbul ignore next */
        res.status(500).json({ error: error.message });
    }
});

/**
 * Clears all entries in the in-memory debug log.
 */
app.post('/debug/clear', (_req, res) => {
    try {
        debugLog.length = 0; // Clear the array
        res.json({ success: true });
    } catch (error: any) {
        /* istanbul ignore next */
        res.status(500).json({ error: error.message });
    }
});

// --- Health Check Endpoints ---
/**
 * Basic health check endpoint. Returns a simple 'ok' status.
 */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * Detailed health check endpoint. Runs all health checks and returns a summary.
 */
app.get('/health/detailed', async (_req, res) => {
  try {
    const { HealthCheckOrchestrator } = await import('./services/health-checks.js');
    const summary = await HealthCheckOrchestrator.runAllChecks();
    res.json(summary);
  } catch (error: any) {
    /* istanbul ignore next */
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * Component-specific health check endpoint. Returns the health status of individual components.
 */
app.get('/health/components', async (_req, res) => {
  try {
    const { HealthCheckOrchestrator } = await import('./services/health-checks.js');
    const components = await HealthCheckOrchestrator.getComponentHealth();
    res.json(components);
  } catch (error: any) {
    /* istanbul ignore next */
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// --- Start Server ---
/**
 * Starts the HTTP and WebSocket servers.
 * Performs initial service setups and background tasks.
 */
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

  // Initialize hook logger with WebSocket broadcasting
  try {
    initializeHookLogger(wsBroadcast.broadcast);
    console.log('  🪝 Hook logger initialized with WebSocket broadcasting');
  } catch (error) {
    console.error('❌ Hook logger initialization failed:', error);
  }

  // Initialize enhanced logging
  try {
    const { LogFileManager } = await import('./services/enhanced-logger.js');
    await LogFileManager.getInstance(); // Ensure LogFileManager is initialized
    console.log('  📝 Enhanced logging system initialized');
  } catch (error) {
    console.error('❌ Enhanced logging initialization failed:', error);
  }

  // Startup cleanup and background tasks (non-blocking)
  // LM Studio cleanup - fire and forget (don't block server startup)
  import('./services/lmstudio-model-manager.js')
    .then(({ modelManager }) => modelManager.cleanupOnStartup())
    .catch(err => {
      console.log('  ⚠️ LM Studio cleanup skipped:', err.message || 'Not available');
    });

  // Trigger automated ground truth sweep for all tests
  try {
    const { baselineEngine } = await import('./modules/tooly/baseline-engine.js');
    baselineEngine.autoGenerateBaselines().then(results => {
      if (results.length > 0) {
        console.log(`  🤖 [Baseline] Auto-generated ground truth for ${results.length} tests.`);
      }
    }).catch(err => {
      console.warn('  ⚠️ [Baseline] Auto-generation sweep failed:', err.message);
    });
  } catch (error) {
    console.log('  ⚠️ Baseline initialization skipped or failed');
  }

  // Start system metrics collection
  // systemMetrics.start(1000); // Collect every 1 second
  console.log('  📊 System metrics: DISABLED (CPU/GPU monitoring)');
  console.log('  🔌 WebSocket: Ready for real-time updates');
});

// --- Graceful Shutdown Handling ---
/**
 * Handles graceful shutdown of the server upon receiving termination signals.
 * Closes HTTP and WebSocket servers, stops services, and exits the process.
 * @param signal - The termination signal received (e.g., 'SIGTERM', 'SIGINT').
 */
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

      process.exit(0); // Exit successfully
    });
  });

  // Force exit after 5 seconds if graceful shutdown fails to prevent hung processes
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1); // Exit with error code
  }, 5000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Exports ---
/**
 * Exports the WebSocket broadcast service for direct use in other modules if necessary.
 */
export { wsBroadcast };
