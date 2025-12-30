import { Router } from 'express';
import modelRoutes from './model-routes.js';
import testRoutes from './test-routes.js';
import baselineRoutes from './baseline-routes.js';
import mcpRoutes from './mcp-routes.js';
import actionRoutes from './action-routes.js';
import { addSecurityHeaders, auditLog, apiRateLimit, sanitizeInput } from '../../middleware/validation.js';

const router = Router();

// Apply security and audit middleware
router.use(addSecurityHeaders());
router.use(auditLog());
router.use(apiRateLimit);

// Input sanitization
router.use((req, res, next) => {
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') req.query[key] = sanitizeInput(value);
    }
  }
  next();
});

// Combine sub-routes
router.use('/', modelRoutes);
router.use('/', testRoutes);
router.use('/', baselineRoutes);
router.use('/', mcpRoutes);
router.use('/', actionRoutes);

export default router;
