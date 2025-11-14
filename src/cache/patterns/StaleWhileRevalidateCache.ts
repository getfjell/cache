/**
 * Stale-While-Revalidate Cache Pattern
 *
 * Returns cached data immediately (even if stale) while fetching fresh data
 * in the background. This keeps the UI responsive while ensuring eventual
 * data freshness.
 */

import { TTLCalculator } from '../../ttl/TTLCalculator.js';
import { ItemCache } from '../layers/ItemCache.js';
import { CachedItem } from '../types/TwoLayerTypes.js';

export interface StaleWhileRevalidateOptions {
  /** TTL calculator for determining staleness */
  ttlCalculator: TTLCalculator;
  /** Maximum number of concurrent background refreshes */
  maxConcurrentRefreshes?: number;
  /** How long to wait before giving up on a refresh (milliseconds) */
  refreshTimeout?: number;
  /** Whether to extend TTL on refresh failures */
  extendTTLOnError?: boolean;
  /** Error TTL extension duration (seconds) */
  errorTTLExtension?: number;
}

export interface RefreshContext<T> {
  /** The cached item being refreshed */
  cachedItem: CachedItem<T>;
  /** Original TTL for this item */
  originalTTL: number;
  /** When the refresh started */
  refreshStartedAt: Date;
}

/**
 * Cache that implements the stale-while-revalidate pattern
 */
export class StaleWhileRevalidateCache<T> {
  private itemCache: ItemCache<T>;
  private pendingRefreshes: Map<string, Promise<T | null>>;
  private refreshContexts: Map<string, RefreshContext<T>>;
  private options: Required<StaleWhileRevalidateOptions>;

  constructor(
    itemCache: ItemCache<T>,
    options: StaleWhileRevalidateOptions
  ) {
    this.itemCache = itemCache;
    this.pendingRefreshes = new Map();
    this.refreshContexts = new Map();
    
    this.options = {
      maxConcurrentRefreshes: 10,
      refreshTimeout: 30000, // 30 seconds
      extendTTLOnError: true,
      errorTTLExtension: 300, // 5 minutes
      ...options
    };
  }

  /**
   * Get item from cache with stale-while-revalidate behavior
   */
  async get(
    key: string,
    fetcher: () => Promise<T | null>,
    ttl: number,
    itemType?: string
  ): Promise<T | null> {
    // First, try to get from cache
    const cachedItem = await this.itemCache.getRaw(key);

    if (cachedItem) {
      const isExpired = this.options.ttlCalculator.isExpired(
        cachedItem.createdAt,
        ttl
      );

      if (!isExpired) {
        // Data is still valid
        const isStale = this.options.ttlCalculator.isStale(
          cachedItem.createdAt,
          ttl
        );

        if (isStale) {
          // Data is stale but not expired - trigger background refresh
          this.revalidateInBackground(key, fetcher, ttl, cachedItem);
        }

        return cachedItem.data;
      }

      // Data is expired - check if refresh is in progress
      const pendingRefresh = this.pendingRefreshes.get(key);
      if (pendingRefresh) {
        // Return stale data while refresh completes
        // Wait briefly to see if refresh finishes quickly
        try {
          const raceResult = await Promise.race([
            pendingRefresh,
            new Promise(resolve => setTimeout(resolve, 100)) // 100ms grace period
          ]);

          if (raceResult && typeof raceResult === 'object') {
            // Fresh data available
            return raceResult as T;
          }
        } catch (error) {
          // Refresh failed, but we can still return stale data
          console.warn('Background refresh failed:', error);
        }

        // Still refreshing or failed, return stale data
        return cachedItem.data;
      }

      // No refresh in progress for expired data, start one but return stale data immediately
      this.revalidateInBackground(key, fetcher, ttl, cachedItem);
      return cachedItem.data;
    }

    // No cached data or cache miss - fetch synchronously
    return this.fetchAndCache(key, fetcher, ttl, itemType);
  }

  /**
   * Force refresh of cached item
   */
  async refresh(key: string, fetcher: () => Promise<T | null>, ttl: number): Promise<T | null> {
    // Cancel any pending refresh for this key
    this.cancelRefresh(key);
    
    return this.fetchAndCache(key, fetcher, ttl);
  }

  /**
   * Check if key is currently being refreshed
   */
  isRefreshing(key: string): boolean {
    return this.pendingRefreshes.has(key);
  }

  /**
   * Get refresh status for debugging
   */
  getRefreshStatus(): {
    pendingRefreshes: number;
    maxConcurrent: number;
    activeRefreshes: Array<{
      key: string;
      startedAt: Date;
      originalTTL: number;
    }>;
    } {
    const activeRefreshes = Array.from(this.refreshContexts.entries()).map(
      ([key, context]) => ({
        key,
        startedAt: context.refreshStartedAt,
        originalTTL: context.originalTTL
      })
    );

    return {
      pendingRefreshes: this.pendingRefreshes.size,
      maxConcurrent: this.options.maxConcurrentRefreshes,
      activeRefreshes
    };
  }

  /**
   * Start background refresh for stale data
   */
  private revalidateInBackground(
    key: string,
    fetcher: () => Promise<T | null>,
    ttl: number,
    cachedItem: CachedItem<T>
  ): void {
    // Check if already refreshing
    if (this.pendingRefreshes.has(key)) {
      return;
    }

    // Check concurrent refresh limit
    if (this.pendingRefreshes.size >= this.options.maxConcurrentRefreshes) {
      return;
    }

    // Start refresh
    const refreshContext: RefreshContext<T> = {
      cachedItem,
      originalTTL: ttl,
      refreshStartedAt: new Date()
    };

    this.refreshContexts.set(key, refreshContext);

    const refreshPromise = this.performBackgroundRefresh(key, fetcher, ttl)
      .finally(() => {
        // Cleanup
        this.pendingRefreshes.delete(key);
        this.refreshContexts.delete(key);
      });

    this.pendingRefreshes.set(key, refreshPromise);
  }

  /**
   * Perform the actual background refresh
   */
  private async performBackgroundRefresh(
    key: string,
    fetcher: () => Promise<T | null>,
    ttl: number
  ): Promise<T | null> {
    try {
      // Add timeout to prevent hanging refreshes
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Refresh timeout')),
          this.options.refreshTimeout
        );
      });

      const refreshResult = await Promise.race([
        fetcher(),
        timeoutPromise
      ]);

      if (refreshResult) {
        // Successfully refreshed - update cache
        await this.itemCache.set(key, refreshResult, ttl);
        return refreshResult;
      }

      return null;

    } catch (error) {
      await this.handleRefreshError(key, error, ttl);
      throw error;
    }
  }

  /**
   * Handle refresh errors
   */
  private async handleRefreshError(key: string, error: unknown, originalTTL: number): Promise<void> {
    if (!this.options.extendTTLOnError) {
      return;
    }

    // Try to extend TTL of existing cached data to avoid hammering a failing API
    try {
      const existing = await this.itemCache.getRaw(key);
      if (existing) {
        // Extend TTL by the configured error extension duration
        await this.itemCache.set(
          key,
          existing.data,
          this.options.errorTTLExtension
        );
      }
    } catch (extendError) {
      // If we can't extend TTL, that's OK - just log it
      console.warn('Failed to extend TTL on refresh error:', extendError);
    }
  }

  /**
   * Fetch fresh data and cache it
   */
  private async fetchAndCache(
    key: string,
    fetcher: () => Promise<T | null>,
    ttl: number,
    itemType?: string
  ): Promise<T | null> {
    try {
      const data = await fetcher();

      if (data) {
        await this.itemCache.set(key, data, ttl);
      }

      return data;
    } catch (error) {
      await this.handleRefreshError(key, error, ttl);
      throw error;
    }
  }

  /**
   * Cancel pending refresh for a key
   */
  private cancelRefresh(key: string): void {
    this.pendingRefreshes.delete(key);
    this.refreshContexts.delete(key);
  }

  /**
   * Clear all pending refreshes (useful for cleanup)
   */
  clearPendingRefreshes(): void {
    this.pendingRefreshes.clear();
    this.refreshContexts.clear();
  }

  /**
   * Get statistics about cache behavior
   */
  getStats(): {
    pendingRefreshes: number;
    averageRefreshTime?: number;
    refreshSuccessRate?: number;
    } {
    return {
      pendingRefreshes: this.pendingRefreshes.size
      // TODO: Add refresh time tracking and success rate metrics
    };
  }
}

/**
 * Factory function to create a StaleWhileRevalidateCache
 */
export function createStaleWhileRevalidateCache<T>(
  itemCache: ItemCache<T>,
  options: StaleWhileRevalidateOptions
): StaleWhileRevalidateCache<T> {
  return new StaleWhileRevalidateCache(itemCache, options);
}
