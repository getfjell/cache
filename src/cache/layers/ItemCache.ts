import { CachedItem, ItemCacheLayer } from '../types/TwoLayerTypes';
import LibLogger from '../../logger';

const logger = LibLogger.get('ItemCache');

/**
 * Item Cache Layer - Stores individual entities by their composite keys
 *
 * This layer is responsible for:
 * - Storing individual items with TTL
 * - Fast key-value lookups
 * - Automatic expiration handling
 * - Query-agnostic storage
 */
export class ItemCache<T> implements ItemCacheLayer<T> {
  private storage: Map<string, CachedItem<T>>;
  private defaultTTL: number;

  constructor(options: { defaultTTL?: number } = {}) {
    this.storage = new Map();
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour default
  }

  async get(key: string): Promise<T | null> {
    const cached = this.storage.get(key);

    if (!cached) {
      logger.debug('Cache miss for key', { key });
      return null;
    }

    // Check expiration
    if (cached.expiresAt < new Date()) {
      logger.debug('Expired item removed', { key });
      this.storage.delete(key);
      return null;
    }

    logger.debug('Cache hit for key', { key });
    return cached.data;
  }

  /**
   * Get raw cached item with metadata (for stale-while-revalidate pattern)
   */
  async getRaw(key: string): Promise<CachedItem<T> | null> {
    return this.storage.get(key) || null;
  }

  async set(key: string, item: T, ttl?: number): Promise<void> {
    const ttlSeconds = ttl || this.defaultTTL;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    this.storage.set(key, {
      data: item,
      createdAt: now,
      expiresAt: expiresAt
    });

    logger.debug('Stored item', { key, expiresAt: expiresAt.toISOString() });
  }

  async delete(key: string): Promise<void> {
    const existed = this.storage.delete(key);
    logger.debug('Deleted item', { key, existed });
  }

  async has(key: string): Promise<boolean> {
    const item = await this.get(key);
    return item !== null;
  }

  async clear(): Promise<void> {
    const count = this.storage.size;
    this.storage.clear();
    logger.debug('Cleared items', { count });
  }

  // ===== UTILITY METHODS =====

  /**
   * Get cache statistics
   */
  getStats() {
    const now = new Date();
    let expiredCount = 0;
    let validCount = 0;

    for (const [key, cached] of this.storage.entries()) {
      if (cached.expiresAt < now) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      total: this.storage.size,
      valid: validCount,
      expired: expiredCount
    };
  }

  /**
   * Clean up expired items
   */
  cleanup(): number {
    const now = new Date();
    let removedCount = 0;

    for (const [key, cached] of this.storage.entries()) {
      if (cached.expiresAt < now) {
        this.storage.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug('Cleaned up expired items', { removedCount });
    }

    return removedCount;
  }
}
