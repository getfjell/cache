import { CachedItem, ItemCacheLayer } from '../types/TwoLayerTypes';

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
  private debug: boolean;

  constructor(options: { defaultTTL?: number; debug?: boolean } = {}) {
    this.storage = new Map();
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour default
    this.debug = options.debug || false;
  }

  async get(key: string): Promise<T | null> {
    const cached = this.storage.get(key);

    if (!cached) {
      if (this.debug) {
        console.log(`[ItemCache] Cache miss for key: ${key}`);
      }
      return null;
    }

    // Check expiration
    if (cached.expiresAt < new Date()) {
      if (this.debug) {
        console.log(`[ItemCache] Expired item removed: ${key}`);
      }
      this.storage.delete(key);
      return null;
    }

    if (this.debug) {
      console.log(`[ItemCache] Cache hit for key: ${key}`);
    }
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

    if (this.debug) {
      console.log(`[ItemCache] Stored item: ${key} (expires: ${expiresAt.toISOString()})`);
    }
  }

  async delete(key: string): Promise<void> {
    const existed = this.storage.delete(key);
    if (this.debug) {
      console.log(`[ItemCache] Deleted item: ${key} (existed: ${existed})`);
    }
  }

  async has(key: string): Promise<boolean> {
    const item = await this.get(key);
    return item !== null;
  }

  async clear(): Promise<void> {
    const count = this.storage.size;
    this.storage.clear();
    if (this.debug) {
      console.log(`[ItemCache] Cleared ${count} items`);
    }
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

    if (this.debug && removedCount > 0) {
      console.log(`[ItemCache] Cleaned up ${removedCount} expired items`);
    }

    return removedCount;
  }
}
