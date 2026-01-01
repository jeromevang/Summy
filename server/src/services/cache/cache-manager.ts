/**
 * Caching System for Summy
 * Implements Redis-like in-memory caching with TTL support
 */

import { EventEmitter } from 'events';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxItems?: number; // Maximum number of items in cache
  onEvict?: (key: string, value: any) => void; // Callback when item is evicted
}

export class CacheManager extends EventEmitter {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private options: Required<CacheOptions>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(options: CacheOptions = {}) {
    super();
    this.options = {
      ttl: 5 * 60 * 1000, // 5 minutes default
      maxItems: 1000,
      onEvict: () => {},
      ...options
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000); // Run every minute
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, options: Partial<CacheOptions> = {}): void {
    const ttl = options.ttl ?? this.options.ttl;
    const expiresAt = ttl ? Date.now() + ttl : null;

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Check if we need to evict items
    if (this.cache.size >= this.options.maxItems) {
      this.evictLeastUsed();
    }

    this.cache.set(key, entry);
    this.emit('set', { key, value, options });
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.emit('miss', { key });
      return null;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.emit('miss', { key });
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.emit('hit', { key, value: entry.value });
    return entry.value;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.emit('delete', { key, value: entry.value });
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalAccesses: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const totalItems = entries.length;

    return {
      size: totalItems,
      maxSize: this.options.maxItems,
      hitRate: totalItems > 0 ? totalAccesses / totalItems : 0,
      totalAccesses
    };
  }

  /**
   * Get all cache keys
   */
  _keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all cache values
   */
  _values(): any[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    // If still over capacity, evict least used
    if (this.cache.size > this.options.maxItems) {
      this.evictLeastUsed();
    }
  }

  /**
   * Evict least used items
   */
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by access count (ascending) then by last accessed (ascending)
    entries.sort((a, b) => {
      if (a[1].accessCount !== b[1].accessCount) {
        return a[1].accessCount - b[1].accessCount;
      }
      return a[1].lastAccessed - b[1].lastAccessed;
    });

    // Evict 10% of items
    const evictCount = Math.max(1, Math.floor(entries.length * 0.1));

    for (let i = 0; i < evictCount; i++) {
      const item = entries[i];
      if (!item) continue;
      const [key, entry] = item;
      this.cache.delete(key);
      this.options.onEvict(key, entry.value);
      this.emit('evict', { key, value: entry.value });
    }
  }

  /**
   * Close the cache and cleanup resources
   */
  _close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    this.emit('close');
  }
}

// Pre-configured cache instances for different use cases
export const caches = {
  // Model profiles cache - 10 minute TTL
  modelProfiles: new CacheManager({
    ttl: 10 * 60 * 1000,
    maxItems: 100,
    onEvict: (key, _value) => console.log(`Model profile evicted: ${key}`)
  }),

  // Test results cache - 5 minute TTL
  testResults: new CacheManager({
    ttl: 5 * 60 * 1000,
    maxItems: 500,
    onEvict: (key, _value) => console.log(`Test result evicted: ${key}`)
  }),

  // Combo results cache - 15 minute TTL
  comboResults: new CacheManager({
    ttl: 15 * 60 * 1000,
    maxItems: 200,
    onEvict: (key, _value) => console.log(`Combo result evicted: ${key}`)
  }),

  // Analytics cache - 30 minute TTL
  analytics: new CacheManager({
    ttl: 30 * 60 * 1000,
    maxItems: 1000,
    onEvict: (key, _value) => console.log(`Analytics evicted: ${key}`)
  }),

  // File content cache - 2 minute TTL
  fileContent: new CacheManager({
    ttl: 2 * 60 * 1000,
    maxItems: 200,
    onEvict: (key, _value) => console.log(`File content evicted: ${key}`)
  }) // Removed trailing comma here
};

// Cache middleware for Express routes
export function cacheMiddleware<T>(
  cache: CacheManager,
  keyGenerator: (req: any) => string,
  ttl?: number
) {
  return (req: any, res: any, next: any) => {
    const cacheKey = keyGenerator(req);

    // Try to get from cache
    const cached = cache.get<T>(cacheKey);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache the response
    res.json = function(body: T) {
      // Cache the response
      cache.set(cacheKey, body, { ttl });
      res.set('X-Cache', 'MISS');
      return originalJson.call(this, body);
    };

    next();
  };
}

// Cache invalidation helpers
export const cacheInvalidation = {
  invalidateModelProfile: (modelId: string) => {
    caches.modelProfiles.delete(`model:${modelId}`);
    caches.modelProfiles.delete(`profile:${modelId}`);
  },

  invalidateTestResults: (modelId: string) => {
    caches.testResults.delete(`test:${modelId}`);
    caches.testResults.delete(`baseline:${modelId}`);
  },

  invalidateComboResults: (mainModelId: string, executorModelId: string) => {
    caches.comboResults.delete(`combo:${mainModelId}:${executorModelId}`);
    caches.comboResults.delete(`combo:${executorModelId}:${mainModelId}`);
  },

  invalidateAll: () => {
    Object.values(caches).forEach(cache => cache.clear());
  }
};
