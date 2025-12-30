/**
 * Model Management Routes
 * API endpoints for advanced model management
 */

import express from 'express';
import { modelManager } from '../services/model-manager.js';
import { cacheService } from '../services/cache/cache-service.js';
import { addDebugEntry } from '../services/logger.js';

const router = express.Router();

// ============================================================
// MODEL DISCOVERY AND MANAGEMENT
// ============================================================

/**
 * Discover all available models
 */
router.get('/discover', async (req, res) => {
  try {
    addDebugEntry('request', 'Model discovery request');
    const result = await modelManager.discoverModels();
    res.json({
      success: true,
      data: result,
      message: `Discovered ${result.totalModels} models`
    });
  } catch (error) {
    addDebugEntry('error', `Model discovery failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Model discovery failed',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Get models failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Get model failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get model',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Update model failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update model',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Disable model failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to disable model',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Enable model failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to enable model',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Get recommendations failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: error.message
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
      message: `Best ${role} model: ${best.model.displayName}`
    });
  } catch (error) {
    addDebugEntry('error', `Get best model failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get best model',
      message: error.message
    });
  }
});

// ============================================================
// HEALTH CHECKS
// ============================================================

/**
 * Health check all models
 */
router.post('/health-check', async (req, res) => {
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
  } catch (error) {
    addDebugEntry('error', `Health check failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
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
  } catch (error) {
    addDebugEntry('error', `Health check model failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Clear model cache
 */
router.delete('/cache/clear', async (req, res) => {
  try {
    cacheService.clearAll();
    res.json({
      success: true,
      message: 'Model cache cleared'
    });
  } catch (error) {
    addDebugEntry('error', `Clear cache failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * Get cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = cacheService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    addDebugEntry('error', `Get cache stats failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats',
      message: error.message
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
    const models = Array.from(modelManager['models'].values());
    
    const stats = {
      total: models.length,
      byProvider: {
        lmstudio: models.filter(m => m.provider === 'lmstudio').length,
        openai: models.filter(m => m.provider === 'openai').length,
        azure: models.filter(m => m.provider === 'azure').length,
        openrouter: models.filter(m => m.provider === 'openrouter').length
      },
      byStatus: {
        tested: models.filter(m => m.status === 'tested').length,
        untested: models.filter(m => m.status === 'untested').length,
        failed: models.filter(m => m.status === 'failed').length,
        known_good: models.filter(m => m.status === 'known_good').length,
        disabled: models.filter(m => m.status === 'disabled').length
      },
      byRole: {
        main: models.filter(m => m.role === 'main').length,
        executor: models.filter(m => m.role === 'executor').length,
        both: models.filter(m => m.role === 'both').length,
        none: models.filter(m => m.role === 'none').length
      },
      byCategory: {
        general: models.filter(m => m.category === 'general').length,
        coding: models.filter(m => m.category === 'coding').length,
        creative: models.filter(m => m.category === 'creative').length,
        analysis: models.filter(m => m.category === 'analysis').length,
        specialized: models.filter(m => m.category === 'specialized').length
      },
      performance: {
        avgScore: models.reduce((sum, m) => sum + (m.score || 0), 0) / models.length || 0,
        avgLatency: models.reduce((sum, m) => sum + (m.avgLatency || 0), 0) / models.length || 0,
        healthyModels: models.filter(m => m.healthStatus === 'healthy').length,
        unhealthyModels: models.filter(m => m.healthStatus === 'unhealthy').length
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    addDebugEntry('error', `Get stats failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

export default router;