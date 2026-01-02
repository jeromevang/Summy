/**
 * Routes Index
 * Exports all route modules for easy import
 */

export { default as toolyRoutes } from './tooly/index.js';
export { default as notificationsRoutes } from './notifications.js';
export { default as analyticsRoutes } from './analytics.js';
export { default as ragRoutes } from './rag.js';
export { default as sessionsRoutes } from './sessions.js';
export { default as systemRoutes } from './system.js';
export { default as mcpRoutes } from './mcp.js';
export { workspaceRouter } from './workspace.js';
export { apiBridgeRouter } from './api-bridge.js';
export { teamRouter } from './team.js';
export { gitRouter } from './git.js';

// Enhanced Routes (Improvement #2 and #3)
export { teamsEnhancedRouter } from './teams-enhanced.js';
export { workspaceEnhancedRouter } from './workspace-enhanced.js';

// Health Check Routes (Improvement #11)
export { healthRouter } from './health.js';

