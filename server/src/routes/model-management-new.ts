/**
 * Model Management Routes
 * API endpoints for advanced model management
 */

import express, { Router } from 'express';
import { modelManager } from '../services/model-manager.js';
import { cacheService } from '../services/cache/cache-service.js';
import { addDebugEntry } from '../services/logger.js';

const router: Router = express.Router();

// ============================================================
// MODEL DISCOVERY AND MANAGEMENT
// ============================================================

/**
 * Discover all available models
 */
router.get('/discover', async (_req, res) => {
  try {
    addDebugEntry('request', 'Model discovery request');
    const result = await modelManager.discoverModels();
    res.json({
      success: true,
      data: result,
      message: `Discovered ${result.totalModels} models`
    });
  } catch (err: any) {
    addDebugEntry('error', `Model discovery failed: ${err}`);
    res.status(500).json({
      success: false,
      error: 'Model discovery failed',
      message: err?.message || 'Unknown error'
    });
  }
});

/**
 * Get models with filtering
 */
router.get('/list', async (req, res) => {
  try {
    const {
      provider,
      role,
      category,
      status,
      minScore,
      maxLatency,
      limit = 50,
      offset = 0
    } = req.query;

    const criteria = {
      provider: provider as any,
      role: role as any,
      category: category as any,
      status: status as any,
      minScore: minScore ? parseFloat(minScore as string) : undefined,
      maxLatency: maxLatency ? parseFloat(maxLatency as string) : undefined
    };

    const models = modelManager.getModels(criteria);
    const total = models.length;
    const paginated = models.slice(offset as number, (offset as number) + (limit as number));

    res.json({
      success: true,
      data: {
        models: paginated,
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (err: any) {
    addDebugEntry('error', `Get models failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: err.message
    });
  }
});

/**
 * Get model by ID
 */
router.get('/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const model = modelManager.getModel(modelId);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model ${modelId} not found`
      });
    }

    res.json({
      success: true,
      data: model
    });
  } catch (err: any) {
    addDebugEntry('error', `Get model failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get model',
      message: err.message
    });
  }
});

/**
 * Update model metadata
 */
router.patch('/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const updates = req.body;

    const model = modelManager.getModel(modelId);
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model ${modelId} not found`
      });
    }

    modelManager.updateModel(modelId, updates);

    res.json({
      success: true,
      data: modelManager.getModel(modelId),
      message: `Updated model ${modelId}`
    });
  } catch (err: any) {
    addDebugEntry('error', `Update model failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update model',
      message: err.message
    });
  }
});

/**
 * Disable a model
 */
router.post('/:modelId/disable', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { reason } = req.body;

    const model = modelManager.getModel(modelId);
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model ${modelId} not found`
      });
    }

    modelManager.disableModel(modelId, reason || 'Manual disable');

    res.json({
      success: true,
      message: `Disabled model ${modelId}: ${reason || 'Manual disable'}`
    });
  } catch (err: any) {
    addDebugEntry('error', `Disable model failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to disable model',
      message: err.message
    });
  }
});

/**
 * Enable a model
 */
router.post('/:modelId/enable', async (req, res) => {
  try {
    const { modelId } = req.params;

    const model = modelManager.getModel(modelId);
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model ${modelId} not found`
      });
    }

    modelManager.enableModel(modelId);

    res.json({
      success: true,
      message: `Enabled model ${modelId}`
    });
  } catch (err: any) {
    addDebugEntry('error', `Enable model failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to enable model',
      message: err.message
    });
  }
});

// ============================================================
// MODEL RECOMMENDATIONS
// ============================================================

/**
 * Get model recommendations
 */
router.post('/recommendations', async (req, res) => {
  try {
    const { role, minScore, maxLatency, preferredProviders } = req.body;

    const recommendations = modelManager.getRecommendations({
      role: role || 'both',
      minScore: minScore || 70,
      maxLatency: maxLatency || 10000,
      preferredProviders: preferredProviders || []
    });

    res.json({
      success: true,
      data: {
        recommendations,
        total: recommendations.length
      },
      message: `Found ${recommendations.length} recommendations`
    });
  } catch (err: any) {
    addDebugEntry('error', `Get recommendations failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: err.message
    });
  }
});

/**
 * Get best model for a specific role
 */
router.get('/best/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const { minScore, maxLatency } = req.query;

    const recommendations = modelManager.getRecommendations({
      role: role as any,
      minScore: minScore ? parseFloat(minScore as string) : 70,
      maxLatency: maxLatency ? parseFloat(maxLatency as string) : 10000
    });

    const best = recommendations[0];

    if (!best) {
      return res.status(404).json({
        success: false,
        error: 'No suitable model found',
        message: `No ${role} model found with the specified criteria`
      });
    }

    res.json({
      success: true,
      data: best,
      message: `Best ${role} model: ${best.displayName}`
    });
  } catch (err: any) {
    addDebugEntry('error', `Get best model failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get best model',
      message: err.message
    });
  }
});

// ============================================================
// HEALTH CHECKS
// ============================================================

/**
 * Health check all models
 */
router.post('/health-check', async (_req, res) => {
  try {
    addDebugEntry('request', 'Health check all models');
    const results = await modelManager.healthCheckAll();

    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const unhealthyCount = results.filter(r => r.status !== 'healthy').length;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          healthy: healthyCount,
          unhealthy: unhealthyCount,
          successRate: results.length > 0 ? (healthyCount / results.length) * 100 : 0
        }
      },
      message: `Health check completed: ${healthyCount} healthy, ${unhealthyCount} unhealthy`
    });
  } catch (err: any) {
    addDebugEntry('error', `Health check failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: err.message
    });
  }
});

/**
 * Health check specific model
 */
router.post('/:modelId/health-check', async (req, res) => {
  try {
    const { modelId } = req.params;
    const result = await modelManager.healthCheckModel(modelId);

    res.json({
      success: true,
      data: result,
      message: `Health check for ${modelId}: ${result.status}`
    });
  } catch (err: any) {
    addDebugEntry('error', `Health check model failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: err.message
    });
  }
});

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Clear model cache
 */
router.delete('/cache/clear', async (_req, res) => {
  try {
    cacheService.clearAll();
    res.json({
      success: true,
      message: 'Model cache cleared'
    });
  } catch (err: any) {
    addDebugEntry('error', `Clear cache failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: err.message
    });
  }
});

/**
 * Get cache statistics
 */
router.get('/cache/stats', async (_req, res) => {
  try {
    const stats = cacheService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (err: any) {
    addDebugEntry('error', `Get cache stats failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats',
      message: err.message
    });
  }
});

// ============================================================
// STATISTICS AND METRICS
// ============================================================

/**
 * Get model statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const models = modelManager.getModels();
    
    const stats = {
      total: models.length,
      byProvider: {
        lmstudio: models.filter((m: any) => m.provider === 'lmstudio').length,
        openai: models.filter((m: any) => m.provider === 'openai').length,
        azure: models.filter((m: any) => m.provider === 'azure').length,
        openrouter: models.filter((m: any) => m.provider === 'openrouter').length
      },
      byStatus: {
        tested: models.filter((m: any) => m.status === 'tested').length,
        untested: models.filter((m: any) => m.status === 'untested').length,
        failed: models.filter((m: any) => m.status === 'failed').length,
        known_good: models.filter((m: any) => m.status === 'known_good').length,
        disabled: models.filter((m: any) => m.status === 'disabled').length
      },
      byRole: {
        main: models.filter((m: any) => m.role === 'main').length,
        executor: models.filter((m: any) => m.role === 'executor').length,
        both: models.filter((m: any) => m.role === 'both').length,
        none: models.filter((m: any) => m.role === 'none').length
      },
      byCategory: {
        general: models.filter((m: any) => m.category === 'general').length,
        coding: models.filter((m: any) => m.category === 'coding').length,
        creative: models.filter((m: any) => m.category === 'creative').length,
        analysis: models.filter((m: any) => m.category === 'analysis').length,
        specialized: models.filter((m: any) => m.category === 'specialized').length
      },
      performance: {
        avgScore: models.reduce((sum, m: any) => sum + (m.score || 0), 0) / models.length || 0,
        avgLatency: models.reduce((sum, m: any) => sum + (m.avgLatency || 0), 0) / models.length || 0,
        healthyModels: models.filter((m: any) => m.healthStatus === 'healthy').length,
        unhealthyModels: models.filter((m: any) => m.healthStatus === 'unhealthy').length
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (err: any) {
    addDebugEntry('error', `Get stats failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: err.message
    });
  }
});

export default router;
