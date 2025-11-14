/**
 * Stale-While-Revalidate Cache Tests
 *
 * Tests the background refresh pattern functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaleWhileRevalidateCache } from '../../src/cache/patterns/StaleWhileRevalidateCache.js';
import { ItemCache } from '../../src/cache/layers/ItemCache.js';
import { TTLCalculator } from '../../src/ttl/TTLCalculator.js';
import { TTLConfig } from '../../src/ttl/TTLConfig.js';

// Mock data interface
interface TestItem {
  id: string;
  value: number;
  updatedAt: string;
}

describe('StaleWhileRevalidateCache', () => {
  let itemCache: ItemCache<TestItem>;
  let ttlCalculator: TTLCalculator;
  let staleCache: StaleWhileRevalidateCache<TestItem>;
  let mockFetcher: ReturnType<typeof vi.fn>;
  let testConfig: TTLConfig;

  beforeEach(() => {
    // Setup TTL config
    testConfig = {
      item: {
        default: 300, // 5 minutes for testing
        byType: {
          'test': 180 // 3 minutes
        }
      },
      query: {
        complete: 60,  // 1 minute
        faceted: 30    // 30 seconds
      },
      adjustments: {
        staleWhileRevalidate: true
      }
    };

    // Create instances
    itemCache = new ItemCache<TestItem>({ defaultTTL: 300, debug: false });
    ttlCalculator = new TTLCalculator(testConfig);
    
    staleCache = new StaleWhileRevalidateCache(itemCache, {
      ttlCalculator,
      maxConcurrentRefreshes: 5,
      refreshTimeout: 1000, // 1 second for testing
      extendTTLOnError: true,
      errorTTLExtension: 60 // 1 minute
    });

    // Create mock fetcher
    mockFetcher = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    staleCache.clearPendingRefreshes();
  });

  describe('Basic Cache Operations', () => {
    it('should fetch and cache on first request', async () => {
      const testItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };
      mockFetcher.mockResolvedValue(testItem);

      const result = await staleCache.get('test-key', mockFetcher, 300);

      expect(result).toEqual(testItem);
      expect(mockFetcher).toHaveBeenCalledOnce();
      
      // Verify it's cached
      const cachedResult = await itemCache.get('test-key');
      expect(cachedResult).toEqual(testItem);
    });

    it('should return cached data on second request', async () => {
      const testItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };
      mockFetcher.mockResolvedValue(testItem);

      // First request
      await staleCache.get('test-key', mockFetcher, 300);
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Second request should use cache
      const result = await staleCache.get('test-key', mockFetcher, 300);
      
      expect(result).toEqual(testItem);
      expect(mockFetcher).toHaveBeenCalledTimes(1); // No additional calls
    });
  });

  describe('Stale-While-Revalidate Behavior', () => {
    it('should return stale data while refreshing in background', async () => {
      const originalItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };
      const updatedItem: TestItem = { id: '1', value: 200, updatedAt: '2024-01-15T10:30:00Z' };

      // First request - cache the original item
      mockFetcher.mockResolvedValue(originalItem);
      await staleCache.get('test-key', mockFetcher, 300);

      // Move time forward to make data stale (but not expired)
      // Mock the TTL calculator to consider data stale
      const originalIsStale = ttlCalculator.isStale;
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(false);

      // Setup fetcher to return updated data
      mockFetcher.mockResolvedValue(updatedItem);

      // Request again - should return stale data immediately
      const result = await staleCache.get('test-key', mockFetcher, 300);

      expect(result).toEqual(originalItem); // Returns stale data immediately
      expect(staleCache.isRefreshing('test-key')).toBe(true); // Background refresh started

      // Wait for background refresh to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify background refresh was called
      expect(mockFetcher).toHaveBeenCalledTimes(2);

      // Restore original method
      ttlCalculator.isStale = originalIsStale;
    });

    it('should handle expired data with ongoing refresh', async () => {
      const originalItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };

      // Cache the original item
      mockFetcher.mockResolvedValue(originalItem);
      await staleCache.get('test-key', mockFetcher, 300);

      // Mock TTL calculator to show data is expired
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(true);

      // Setup a slow fetcher
      const updatedItem: TestItem = { id: '1', value: 200, updatedAt: '2024-01-15T10:30:00Z' };
      const slowFetchPromise = new Promise<TestItem>(resolve => {
        setTimeout(() => resolve(updatedItem), 200); // 200ms delay
      });
      mockFetcher.mockReturnValue(slowFetchPromise);

      // Request should return stale data and start background refresh
      const result = await staleCache.get('test-key', mockFetcher, 300);

      // Should return stale data immediately (new logic handles expired data with stale-while-revalidate)
      expect(result).toEqual(originalItem);

      // Background refresh should be running
      expect(staleCache.isRefreshing('test-key')).toBe(true);

      // Wait for background refresh to complete
      await new Promise(resolve => setTimeout(resolve, 250));
    });
  });

  describe('Error Handling', () => {
    it('should extend TTL on fetch error', async () => {
      const originalItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };

      // First request - cache the item
      mockFetcher.mockResolvedValue(originalItem);
      await staleCache.get('test-key', mockFetcher, 300);

      // Mock stale data
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(false);

      // Setup fetcher to fail
      const fetchError = new Error('Network error');
      mockFetcher.mockRejectedValue(fetchError);

      // Request should return stale data and handle error
      const result = await staleCache.get('test-key', mockFetcher, 300);

      expect(result).toEqual(originalItem); // Returns stale data

      // Wait for background error handling
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify the item is still cached (TTL extended)
      const cachedAfterError = await itemCache.getRaw('test-key');
      expect(cachedAfterError).toBeTruthy();
    });

    it('should handle refresh timeout', async () => {
      const originalItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };

      // Cache original item
      mockFetcher.mockResolvedValue(originalItem);
      await staleCache.get('test-key', mockFetcher, 300);

      // Mock stale (but not expired) data to trigger background refresh
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(false);

      // Setup fetcher with delay longer than refresh timeout (1 second)
      const slowPromise = new Promise(resolve =>
        setTimeout(() => resolve({ id: '1', value: 200, updatedAt: '2024-01-15T10:30:00Z' }), 2000)
      );
      mockFetcher.mockReturnValue(slowPromise);

      // Request should return stale data immediately and start background refresh
      const result = await staleCache.get('test-key', mockFetcher, 300);

      // Should return stale data immediately
      expect(result).toEqual(originalItem);
      
      // Background refresh should be running
      expect(staleCache.isRefreshing('test-key')).toBe(true);
    }, 10000); // 10 second timeout for this test
  });

  describe('Concurrent Refresh Management', () => {
    it('should not start duplicate refreshes for same key', async () => {
      const originalItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };

      // Cache the item
      mockFetcher.mockResolvedValue(originalItem);
      await staleCache.get('test-key', mockFetcher, 300);

      // Mock stale data
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(false);

      // Setup slow fetcher
      let resolveCount = 0;
      mockFetcher.mockImplementation(() => {
        resolveCount++;
        return new Promise(resolve =>
          setTimeout(() => resolve({ id: '1', value: 200, updatedAt: '2024-01-15T10:30:00Z' }), 100)
        );
      });

      // Make multiple concurrent requests
      const promises = [
        staleCache.get('test-key', mockFetcher, 300),
        staleCache.get('test-key', mockFetcher, 300),
        staleCache.get('test-key', mockFetcher, 300)
      ];

      await Promise.all(promises);

      // Should only have started one background refresh
      expect(resolveCount).toBe(1);
    });

    it('should respect max concurrent refresh limit', async () => {
      // Create cache with limit of 1
      const limitedCache = new StaleWhileRevalidateCache(itemCache, {
        ttlCalculator,
        maxConcurrentRefreshes: 1
      });

      // Cache multiple items
      for (let i = 1; i <= 3; i++) {
        mockFetcher.mockResolvedValue({ id: i.toString(), value: i * 100, updatedAt: '2024-01-15T10:00:00Z' });
        await limitedCache.get(`key-${i}`, mockFetcher, 300);
      }

      // Mock all data as stale
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(false);

      // Setup slow fetcher
      mockFetcher.mockImplementation(() => new Promise(() => {})); // Never resolves

      // Request all items - should only start 1 refresh due to limit
      await Promise.all([
        limitedCache.get('key-1', mockFetcher, 300),
        limitedCache.get('key-2', mockFetcher, 300),
        limitedCache.get('key-3', mockFetcher, 300)
      ]);

      const status = limitedCache.getRefreshStatus();
      expect(status.pendingRefreshes).toBeLessThanOrEqual(1);
    });
  });

  describe('Refresh Management', () => {
    it('should allow forced refresh', async () => {
      const originalItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };
      const updatedItem: TestItem = { id: '1', value: 200, updatedAt: '2024-01-15T10:30:00Z' };

      // Cache original item
      mockFetcher.mockResolvedValue(originalItem);
      await staleCache.get('test-key', mockFetcher, 300);

      // Force refresh
      mockFetcher.mockResolvedValue(updatedItem);
      const refreshResult = await staleCache.refresh('test-key', mockFetcher, 300);

      expect(refreshResult).toEqual(updatedItem);
      expect(mockFetcher).toHaveBeenCalledTimes(2);

      // Verify cache updated
      const cachedResult = await itemCache.get('test-key');
      expect(cachedResult).toEqual(updatedItem);
    });

    it('should provide refresh status information', async () => {
      const status = staleCache.getRefreshStatus();

      expect(status).toHaveProperty('pendingRefreshes');
      expect(status).toHaveProperty('maxConcurrent');
      expect(status).toHaveProperty('activeRefreshes');
      expect(Array.isArray(status.activeRefreshes)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null fetcher results', async () => {
      mockFetcher.mockResolvedValue(null);

      const result = await staleCache.get('test-key', mockFetcher, 300);

      expect(result).toBeNull();
      expect(mockFetcher).toHaveBeenCalledOnce();

      // Should not cache null results
      const cachedResult = await itemCache.get('test-key');
      expect(cachedResult).toBeNull();
    });

    it('should handle empty key', async () => {
      const testItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };
      mockFetcher.mockResolvedValue(testItem);

      const result = await staleCache.get('', mockFetcher, 300);

      expect(result).toEqual(testItem);
    });

    it('should clean up after refresh completion', async () => {
      const testItem: TestItem = { id: '1', value: 100, updatedAt: '2024-01-15T10:00:00Z' };
      mockFetcher.mockResolvedValue(testItem);

      await staleCache.get('test-key', mockFetcher, 300);

      // Mock stale data to trigger background refresh
      ttlCalculator.isStale = vi.fn().mockReturnValue(true);
      ttlCalculator.isExpired = vi.fn().mockReturnValue(false);

      await staleCache.get('test-key', mockFetcher, 300);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have cleaned up pending refreshes
      expect(staleCache.getRefreshStatus().pendingRefreshes).toBe(0);
    });
  });
});
