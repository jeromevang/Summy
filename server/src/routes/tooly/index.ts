import { Router } from 'express';
import { modelsRouter } from './models.js';
import { testingRouter } from './testing.js';
import { probesRouter } from './probes.js';
import { configRouter } from './config.js';
import { logsRouter } from './logs.js';
import { mcpRouter } from './mcp.js';
import { ideRouter } from './ide.js';
import { leaderboardRouter } from './leaderboard.js';
import { baselineRouter } from './baseline.js';
import { customTestsRouter } from './custom-tests.js';
import { hardwareRouter } from './hardware.js';
import { controllerRouter } from './controller.js';
import { comboTestRouter } from './combo-test.js';
import { failuresRouter } from './failures.js';

import { 
  addSecurityHeaders,
  auditLog,
  apiRateLimit,
  sanitizeInput
} from '../../middleware/validation.js';

const router: Router = Router();

// Apply security and audit middleware to all routes
router.use(addSecurityHeaders());
router.use(auditLog());
router.use(apiRateLimit);

// Apply input sanitization to all routes
router.use((req, _res, next) => {
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        req.query[key] = sanitizeInput(value);
      }
    }
  }
  next();
});

// Mount sub-routers
router.use('/', modelsRouter);
router.use('/', testingRouter);
router.use('/', probesRouter);
router.use('/', configRouter);
router.use('/', logsRouter);
router.use('/mcp', mcpRouter);
router.use('/', ideRouter);
router.use('/', leaderboardRouter);
router.use('/', baselineRouter);
router.use('/', customTestsRouter);
router.use('/', hardwareRouter);
router.use('/', controllerRouter);
router.use('/', comboTestRouter);
router.use('/', failuresRouter);

export default router;
export const toolyRouter = router;