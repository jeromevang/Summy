/**
 * Cache Service
 * High-level service that provides caching for frequently accessed data
 */

import { caches, cacheInvalidation } from './cache-manager';
import { db } from '../database.js';
// Import types from tooly module
import type { ModelProfile } from '../../modules/tooly/capabilities.js';
import type { TestResult, ComboTestResult } from '../../modules/tooly/testing/test-types.js';
import { addDebugEntry } from '../logger';

export class CacheService {
  private static instance: CacheService;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Initialize cache service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Set up cache event listeners
    this.setupEventListeners();

    // Pre-warm critical caches
    await this.preWarmCaches();

    this.isInitialized = true;
    addDebugEntry('session', 'Cache service initialized');
  }

  /**
   * Get model profile with caching
   */
  async getModelProfile(modelId: string): Promise<ModelProfile | null> {
    const cacheKey = `model:${modelId}`;

    // Try cache first
    const cached = caches.modelProfiles.get<ModelProfile>(cacheKey);
    if (cached) {
      addDebugEntry('session', `Cache hit for model profile: ${modelId}`);
      return cached;
    }

    // Model profiles are not stored in database, only cached in memory
    addDebugEntry('session', `Cache miss for model profile: ${modelId}`);
    return null;
  }

  /**
   * Set model profile in cache
   */
  setModelProfile(modelId: string, profile: ModelProfile): void {
    const cacheKey = `model:${modelId}`;
    caches.modelProfiles.set(cacheKey, profile);
    addDebugEntry('session', `Set model profile in cache: ${modelId}`);
  }

  /**
   * Get test results with caching
   */
  async getTestResults(modelId: string, testMode?: string): Promise<TestResult[]> {
    const cacheKey = testMode ? `test:${modelId}:${testMode}` : `test:${modelId}`;

    // Try cache first
    const cached = caches.testResults.get<TestResult[]>(cacheKey);
    if (cached) {
      addDebugEntry('session', `Cache hit for test results: ${modelId}`);
      return cached;
    }

    // Test results are not stored in database, only cached in memory
    addDebugEntry('session', `Cache miss for test results: ${modelId}`);
    return [];
  }

  /**
   * Get combo test results with caching
   */
  async getComboResults(mainModelId: string, executorModelId: string): Promise<any | null> {
    const cacheKey = `combo:${mainModelId}:${executorModelId}`;
    
    // Try cache first
    const cached = caches.comboResults.get<ComboTestResult>(cacheKey);
    if (cached) {
      addDebugEntry('session', `Cache hit for combo results: ${mainModelId} + ${executorModelId}`);
      return cached;
    }

    // Fetch from database
    try {
      const result = await db.getComboResult(mainModelId, executorModelId);
      if (result) {
        caches.comboResults.set(cacheKey, result);
        addDebugEntry('session', `Cached combo results: ${mainModelId} + ${executorModelId}`);
      }
      return result;
    } catch (error) {
      addDebugEntry('error', `Failed to get combo results from database: ${error}`);
      return null;
    }
  }

  /**
   * Invalidate cache for a specific model
   */
  invalidateModel(modelId: string): void {
    cacheInvalidation.invalidateModelProfile(modelId);
    cacheInvalidation.invalidateTestResults(modelId);
    addDebugEntry('session', `Invalidated cache for model: ${modelId}`);
  }

  /**
   * Invalidate cache for a specific combo
   */
  invalidateCombo(mainModelId: string, executorModelId: string): void {
    cacheInvalidation.invalidateComboResults(mainModelId, executorModelId);
    addDebugEntry('session', `Invalidated cache for combo: ${mainModelId} + ${executorModelId}`);
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    cacheInvalidation.invalidateAll();
    addDebugEntry('session', 'Cleared all caches');
  }

  /**
   * Get cache statistics
   */
  getStats(): Record<string, any> {
    return {
      modelProfiles: caches.modelProfiles.getStats(),
      testResults: caches.testResults.getStats(),
      comboResults: caches.comboResults.getStats(),
      analytics: caches.analytics.getStats(),
      fileContent: caches.fileContent.getStats()
    };
  }

  /**
   * Setup cache event listeners
   */
  private setupEventListeners(): void {
    // Log cache events
    Object.values(caches).forEach((cache, name) => {
      cache.on('hit', (data) => {
        addDebugEntry('session', `Cache hit: ${name} - ${data.key}`);
      });

      cache.on('miss', (data) => {
        addDebugEntry('session', `Cache miss: ${name} - ${data.key}`);
      });

      cache.on('evict', (data) => {
        addDebugEntry('session', `Cache evicted: ${name} - ${data.key}`);
      });
    });
  }

  /**
   * Pre-warm critical caches
   */
  private async preWarmCaches(): Promise<void> {
    try {
      // Model profiles are not stored in database, skip pre-warming
      addDebugEntry('session', 'Pre-warming skipped for model profiles (not stored in database)');
    } catch (error) {
      addDebugEntry('error', `Failed to pre-warm caches: ${error}`);
    }
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();
