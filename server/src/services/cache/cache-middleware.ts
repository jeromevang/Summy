/**
 * Cache Middleware for API Routes
 * Provides caching for frequently accessed endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { cacheService } from './cache-service';
import { addDebugEntry } from '../logger';

/**
 * Cache middleware for model profiles
 */
export const cacheModelProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const modelId = req.params.modelId;
  
  if (!modelId) {
    return next();
  }

  try {
    const profile = await cacheService.getModelProfile(modelId);
    if (profile) {
      res.set('X-Cache', 'HIT');
      res.json(profile);
      return;
    }
    
    // Store original json method
    const originalJson = res.json;
    res.json = function(body: any) {
      if (body && body.modelId) {
        cacheService.setModelProfile(body.modelId, body);
      }
      res.set('X-Cache', 'MISS');
      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    addDebugEntry('error', `Cache middleware error: ${error}`);
    next();
  }
};

/**
 * Cache middleware for test results
 */
export const cacheTestResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const modelId = req.params.modelId;
  const testMode = req.query.testMode as string;
  
  if (!modelId) {
    return next();
  }

  try {
    const results = await cacheService.getTestResults(modelId, testMode);
    if (results && results.length > 0) {
      res.set('X-Cache', 'HIT');
      res.json(results);
      return;
    }
    
    // Store original json method
    const originalJson = res.json;
    res.json = function(body: any) {
      if (Array.isArray(body) && body.length > 0) {
        // Cache the results
        const cacheKey = testMode ? `test:${modelId}:${testMode}` : `test:${modelId}`;
        // Note: We'll need to modify the cache service to handle this properly
      }
      res.set('X-Cache', 'MISS');
      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    addDebugEntry('error', `Cache middleware error: ${error}`);
    next();
  }
};

/**
 * Cache middleware for combo results
 */
export const cacheComboResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { mainModelId, executorModelId } = req.body;
  
  if (!mainModelId || !executorModelId) {
    return next();
  }

  try {
    const result = await cacheService.getComboResults(mainModelId, executorModelId);
    if (result) {
      res.set('X-Cache', 'HIT');
      res.json(result);
      return;
    }
    
    // Store original json method
    const originalJson = res.json;
    res.json = function(body: any) {
      if (body && body.mainModelId && body.executorModelId) {
        // Cache the result
        // Note: We'll need to modify the cache service to handle this properly
      }
      res.set('X-Cache', 'MISS');
      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    addDebugEntry('error', `Cache middleware error: ${error}`);
    next();
  }
};

/**
 * Cache invalidation middleware
 */
export const invalidateCache = (req: Request, res: Response, next: NextFunction): void => {
  // Invalidate cache after successful operations
  const originalJson = res.json;
  
  res.json = function(body: any) {
    try {
      // Invalidate relevant caches based on the operation
      if (req.method === 'POST' && req.path.includes('/test')) {
        // Test completed, invalidate model cache
        const modelId = req.params.modelId || (req.body && req.body.modelId);
        if (modelId) {
          cacheService.invalidateModel(modelId);
        }
      } else if (req.method === 'POST' && req.path.includes('/combo-test')) {
        // Combo test completed, invalidate combo cache
        const { mainModelId, executorModelId } = req.body;
        if (mainModelId && executorModelId) {
          cacheService.invalidateCombo(mainModelId, executorModelId);
        }
      }
    } catch (error) {
      addDebugEntry('error', `Cache invalidation error: ${error}`);
    }
    
    return originalJson.call(this, body);
  };

  next();
};

/**
 * Cache stats endpoint middleware
 */
export const cacheStatsMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  try {
    const stats = cacheService.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    addDebugEntry('error', `Cache stats error: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats'
    });
  }
};
