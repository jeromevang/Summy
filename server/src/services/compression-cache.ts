/**
 * Compression Cache Service
 *
 * Caches message analysis results to enable incremental compression.
 * Dramatically reduces hook execution time for long conversations.
 *
 * Part of Smart Context Compression System
 */

import crypto from 'crypto';
import type { MessageScore } from '../modules/tooly/context/index.js';

// ============================================================
// TYPES
// ============================================================

interface CacheEntry {
  messageHash: string;
  messageIndex: number;
  score: MessageScore;
  timestamp: number;
}

interface SessionCache {
  sessionId: string;
  entries: Map<string, CacheEntry>;
  lastUpdated: number;
}

// ============================================================
// COMPRESSION CACHE SERVICE
// ============================================================

class CompressionCacheService {
  private cache: Map<string, SessionCache>;
  private readonly defaultTTL: number = 3600000;  // 1 hour
  private readonly maxEntriesPerSession: number = 500;  // Max cached messages per session

  constructor() {
    this.cache = new Map();

    // Periodic cleanup
    setInterval(() => this.cleanup(), 300000);  // Every 5 minutes
  }

  /**
   * Get cached scores for a session
   */
  getSessionScores(sessionId: string, messages: string[]): MessageScore[] | null {
    const sessionCache = this.cache.get(sessionId);

    if (!sessionCache) {
      return null;
    }

    // Check if all messages are cached
    const scores: MessageScore[] = [];

    for (let i = 0; i < messages.length; i++) {
      const messageHash = this.hashMessage(messages[i], i);
      const entry = sessionCache.entries.get(messageHash);

      if (!entry || this.isExpired(entry.timestamp)) {
        return null;  // Cache miss or expired
      }

      scores.push(entry.score);
    }

    console.log(`[CompressionCache] Cache hit for session ${sessionId}: ${messages.length} messages`);
    return scores;
  }

  /**
   * Get cached scores for new messages only (incremental)
   */
  getIncrementalScores(
    sessionId: string,
    allMessages: string[],
    lastCachedCount: number
  ): {
    cachedScores: MessageScore[];
    newMessages: string[];
    newMessageStartIndex: number;
  } | null {
    const sessionCache = this.cache.get(sessionId);

    if (!sessionCache || lastCachedCount === 0) {
      return null;
    }

    // Get cached scores for existing messages
    const cachedScores: MessageScore[] = [];

    for (let i = 0; i < lastCachedCount && i < allMessages.length; i++) {
      const messageHash = this.hashMessage(allMessages[i], i);
      const entry = sessionCache.entries.get(messageHash);

      if (!entry || this.isExpired(entry.timestamp)) {
        return null;  // Cache invalidated
      }

      cachedScores.push(entry.score);
    }

    // Get new messages
    const newMessages = allMessages.slice(lastCachedCount);

    console.log(
      `[CompressionCache] Incremental cache hit for session ${sessionId}: ` +
      `${cachedScores.length} cached, ${newMessages.length} new`
    );

    return {
      cachedScores,
      newMessages,
      newMessageStartIndex: lastCachedCount
    };
  }

  /**
   * Cache scores for a session
   */
  cacheScores(sessionId: string, messages: string[], scores: MessageScore[]): void {
    if (messages.length !== scores.length) {
      console.warn('[CompressionCache] Message and score count mismatch');
      return;
    }

    // Get or create session cache
    let sessionCache = this.cache.get(sessionId);

    if (!sessionCache) {
      sessionCache = {
        sessionId,
        entries: new Map(),
        lastUpdated: Date.now()
      };
      this.cache.set(sessionId, sessionCache);
    }

    // Cache each message score
    const now = Date.now();

    for (let i = 0; i < messages.length; i++) {
      const messageHash = this.hashMessage(messages[i], i);

      sessionCache.entries.set(messageHash, {
        messageHash,
        messageIndex: i,
        score: scores[i],
        timestamp: now
      });
    }

    sessionCache.lastUpdated = now;

    // Prune old entries if needed
    this.pruneSessionCache(sessionId);

    console.log(
      `[CompressionCache] Cached ${messages.length} scores for session ${sessionId} ` +
      `(total: ${sessionCache.entries.size})`
    );
  }

  /**
   * Update cache with new scores (incremental)
   */
  updateCache(sessionId: string, newMessages: string[], newScores: MessageScore[], startIndex: number): void {
    let sessionCache = this.cache.get(sessionId);

    if (!sessionCache) {
      sessionCache = {
        sessionId,
        entries: new Map(),
        lastUpdated: Date.now()
      };
      this.cache.set(sessionId, sessionCache);
    }

    const now = Date.now();

    for (let i = 0; i < newMessages.length; i++) {
      const globalIndex = startIndex + i;
      const messageHash = this.hashMessage(newMessages[i], globalIndex);

      sessionCache.entries.set(messageHash, {
        messageHash,
        messageIndex: globalIndex,
        score: newScores[i],
        timestamp: now
      });
    }

    sessionCache.lastUpdated = now;

    console.log(
      `[CompressionCache] Updated cache with ${newMessages.length} new scores for session ${sessionId}`
    );
  }

  /**
   * Invalidate cache for a session
   */
  invalidateSession(sessionId: string): void {
    this.cache.delete(sessionId);
    console.log(`[CompressionCache] Invalidated cache for session ${sessionId}`);
  }

  /**
   * Invalidate all cache
   */
  invalidateAll(): void {
    this.cache.clear();
    console.log('[CompressionCache] Cleared all cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalSessions: number;
    totalEntries: number;
    cacheSize: number;  // bytes
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let totalEntries = 0;
    let cacheSize = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const sessionCache of this.cache.values()) {
      totalEntries += sessionCache.entries.size;

      for (const entry of sessionCache.entries.values()) {
        // Rough size estimate
        cacheSize += JSON.stringify(entry.score).length;

        if (oldestEntry === null || entry.timestamp < oldestEntry) {
          oldestEntry = entry.timestamp;
        }

        if (newestEntry === null || entry.timestamp > newestEntry) {
          newestEntry = entry.timestamp;
        }
      }
    }

    return {
      totalSessions: this.cache.size,
      totalEntries,
      cacheSize,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Get session cache info
   */
  getSessionInfo(sessionId: string): {
    exists: boolean;
    entryCount: number;
    lastUpdated: Date | null;
    sizeBytes: number;
  } {
    const sessionCache = this.cache.get(sessionId);

    if (!sessionCache) {
      return {
        exists: false,
        entryCount: 0,
        lastUpdated: null,
        sizeBytes: 0
      };
    }

    let sizeBytes = 0;

    for (const entry of sessionCache.entries.values()) {
      sizeBytes += JSON.stringify(entry.score).length;
    }

    return {
      exists: true,
      entryCount: sessionCache.entries.size,
      lastUpdated: new Date(sessionCache.lastUpdated),
      sizeBytes
    };
  }

  /**
   * Check if cache is available for a session
   */
  hasCachedScores(sessionId: string): boolean {
    return this.cache.has(sessionId);
  }

  /**
   * Get cached message count for a session
   */
  getCachedMessageCount(sessionId: string): number {
    const sessionCache = this.cache.get(sessionId);
    return sessionCache ? sessionCache.entries.size : 0;
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  /**
   * Hash message for cache key
   */
  private hashMessage(message: string, index: number): string {
    // Combine message content and index for unique key
    const data = `${index}:${message}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.defaultTTL;
  }

  /**
   * Prune old entries from session cache
   */
  private pruneSessionCache(sessionId: string): void {
    const sessionCache = this.cache.get(sessionId);

    if (!sessionCache) {
      return;
    }

    // Remove expired entries
    for (const [hash, entry] of sessionCache.entries) {
      if (this.isExpired(entry.timestamp)) {
        sessionCache.entries.delete(hash);
      }
    }

    // Limit cache size (keep most recent)
    if (sessionCache.entries.size > this.maxEntriesPerSession) {
      const entries = Array.from(sessionCache.entries.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

      sessionCache.entries.clear();

      for (let i = 0; i < this.maxEntriesPerSession; i++) {
        sessionCache.entries.set(entries[i][0], entries[i][1]);
      }

      console.log(
        `[CompressionCache] Pruned session ${sessionId} cache to ${this.maxEntriesPerSession} entries`
      );
    }
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedEntries = 0;

    for (const [sessionId, sessionCache] of this.cache) {
      // Remove expired entries
      let removedEntries = 0;

      for (const [hash, entry] of sessionCache.entries) {
        if (this.isExpired(entry.timestamp)) {
          sessionCache.entries.delete(hash);
          removedEntries++;
        }
      }

      cleanedEntries += removedEntries;

      // Remove empty session caches or very old ones
      if (
        sessionCache.entries.size === 0 ||
        now - sessionCache.lastUpdated > this.defaultTTL
      ) {
        this.cache.delete(sessionId);
        cleanedSessions++;
      }
    }

    if (cleanedSessions > 0 || cleanedEntries > 0) {
      console.log(
        `[CompressionCache] Cleanup: removed ${cleanedSessions} sessions and ${cleanedEntries} entries`
      );
    }
  }

  /**
   * Export cache state (for debugging)
   */
  exportState(): any {
    const state: any = {};

    for (const [sessionId, sessionCache] of this.cache) {
      state[sessionId] = {
        entryCount: sessionCache.entries.size,
        lastUpdated: new Date(sessionCache.lastUpdated).toISOString(),
        entries: Array.from(sessionCache.entries.values()).map(entry => ({
          messageIndex: entry.messageIndex,
          score: entry.score.score,
          type: entry.score.type,
          timestamp: new Date(entry.timestamp).toISOString()
        }))
      };
    }

    return state;
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const compressionCache = new CompressionCacheService();
