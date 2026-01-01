import { Router, Request, Response } from 'express';
import { capabilities } from '../../modules/tooly/capabilities.js';
import { 
  validateTestExecution, 
  expensiveOperationRateLimit,
  sanitizeInput
} from '../../middleware/validation.js';

const router: Router = Router();

/**
 * POST /api/tooly/models/:modelId/test
 * Run capability tests for a model
 */
router.post('/models/:modelId/test', expensiveOperationRateLimit, validateTestExecution, async (req: Request, res: Response) => {
  try {
    const modelId = sanitizeInput(decodeURIComponent(req.params.modelId || ''));
    const body = sanitizeInput(req.body || {});

    let provider = body.provider;
    if (!provider) {
      const profile = await capabilities.getProfile(modelId);
      provider = profile?.provider || 'lmstudio';
    }
    const tools = body.tools;
    const testMode = (req.query.mode as string) || body.testMode || 'manual';
    const isBaseline = body.isBaseline === true || req.query.isBaseline === 'true';

    res.json({ success: true, provider, tools, testMode, isBaseline });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const testingRouter = router;
