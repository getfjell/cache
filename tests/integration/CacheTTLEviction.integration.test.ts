import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache, createCache } from '../../src/Cache';
import { createOptions } from '../../src/Options';
import { ClientApi } from '@fjell/client-api';
import { Coordinate, Registry } from '@fjell/registry';
import { Item } from '@fjell/core';

// Mock types for testing
interface TestItem extends Item<'test', 'location'> {
  id: string;
  data: string;
}

// Mock implementations
const mockApi = {
  get: vi.fn(),
  set: vi.fn(),
  all: vi.fn(),
  query: vi.fn()
} as unknown as ClientApi<TestItem, 'test', 'location'>;

const mockCoordinate: Coordinate<'test', 'location'> = {
  kta: ['test', 'location']
};

const mockRegistry = {} as Registry;

describe('Cache TTL and Eviction Integration', () => {
  let cache: Cache<TestItem, 'test', 'location'>;

  describe('TTL functionality at Cache level', () => {
    beforeEach(() => {
      const options = createOptions({
        cacheType: 'memory',
        ttl: 1000, // 1 second TTL
        memoryConfig: {
          maxItems: 10
        }
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
    });

    it('should expose TTL configuration in cache info', () => {
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.defaultTTL).toBe(1000);
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.implementationType).toBe('memory/memory');
    });

    it('should manage TTL independently of CacheMap implementation', () => {
      expect(cache.ttlManager.isTTLEnabled()).toBe(true);
      expect(cache.ttlManager.getDefaultTTL()).toBe(1000);

      // TTL configuration should be updateable
      cache.ttlManager.updateConfig({ defaultTTL: 2000 });
      expect(cache.ttlManager.getDefaultTTL()).toBe(2000);
    });

    it('should validate TTL items correctly', () => {

      // Set up metadata as if item was added
      const now = Date.now();
      cache.cacheMap.setMetadata('item1', {
        key: 'item1',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 1000,
        ttl: 1000
      });

      // Item should be valid initially
      expect(cache.ttlManager.validateItem('item1', cache.cacheMap)).toBe(true);
      expect(cache.ttlManager.isExpired('item1', cache.cacheMap)).toBe(false);

      // Simulate time passing by updating metadata
      cache.cacheMap.setMetadata('item1', {
        key: 'item1',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000, // Expired
        ttl: 1000
      });

      expect(cache.ttlManager.validateItem('item1', cache.cacheMap)).toBe(false);
      expect(cache.ttlManager.isExpired('item1', cache.cacheMap)).toBe(true);
    });
  });

  describe('Eviction functionality at Cache level', () => {
    beforeEach(() => {
      const options = createOptions({
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 2
        },
        evictionConfig: {
          type: 'lru'
        }
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
    });

    it('should expose eviction configuration in cache info', () => {
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.evictionPolicy).toBe('lru');
      expect(cacheInfo.supportsEviction).toBe(true);
      expect(cacheInfo.implementationType).toBe('memory/memory');
    });

    it('should manage eviction independently of CacheMap implementation', () => {
      expect(cache.evictionManager.isEvictionSupported()).toBe(true);
      expect(cache.evictionManager.getEvictionStrategyName()).toBe('lru');
    });

    it('should perform eviction when cache limits are exceeded', () => {
      // Set up cache state to simulate being at capacity
      cache.cacheMap.getCurrentSize = () => ({ itemCount: 2, sizeBytes: 200 });
      cache.cacheMap.getSizeLimits = () => ({ maxItems: 2, maxSizeBytes: null });

      const now = Date.now();

      // Add metadata for existing items
      cache.cacheMap.setMetadata('item1', {
        key: 'item1',
        addedAt: now - 2000,
        lastAccessedAt: now - 2000,
        accessCount: 1,
        estimatedSize: 100
      });

      cache.cacheMap.setMetadata('item2', {
        key: 'item2',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      });

      // Adding a new item should trigger eviction
      const evictedKeys = cache.evictionManager.onItemAdded(
        'item3',
        { id: 'item3', data: 'new data' },
        cache.cacheMap
      );

      expect(evictedKeys).toEqual(['item1']); // Oldest item should be evicted
      expect(cache.cacheMap.getMetadata('item3')).not.toBeNull();
    });
  });

  describe('Combined TTL and Eviction', () => {
    beforeEach(() => {
      const options = createOptions({
        cacheType: 'memory',
        ttl: 5000, // 5 second TTL
        memoryConfig: {
          maxItems: 3
        },
        evictionConfig: {
          type: 'lru'
        }
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
    });

    it('should expose both TTL and eviction in cache info', () => {
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.defaultTTL).toBe(5000);
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.evictionPolicy).toBe('lru');
      expect(cacheInfo.supportsEviction).toBe(true);
      expect(cacheInfo.implementationType).toBe('memory/memory');
    });

    it('should handle TTL expiration and eviction together', () => {
      const now = Date.now();

      // Add items with different TTL states
      cache.cacheMap.setMetadata('expired-item', {
        key: 'expired-item',
        addedAt: now - 10000,
        lastAccessedAt: now - 10000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000, // Expired
        ttl: 5000
      });

      cache.cacheMap.setMetadata('valid-item', {
        key: 'valid-item',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000, // Valid
        ttl: 5000
      });

      // Find expired items for cleanup
      const expiredKeys = cache.ttlManager.findExpiredItems(cache.cacheMap);
      expect(expiredKeys).toEqual(['expired-item']);

      // Valid items should not be expired
      expect(cache.ttlManager.isExpired('valid-item', cache.cacheMap)).toBe(false);
    });

    it('should allow dynamic configuration updates', async () => {
      // Update TTL configuration
      cache.ttlManager.updateConfig({ defaultTTL: 10000 });
      expect(cache.getCacheInfo().defaultTTL).toBe(10000);

      // Update eviction strategy
      const { LRUEvictionStrategy } = await import('../../src/eviction/strategies/LRUEvictionStrategy');
      cache.evictionManager.setEvictionStrategy(new LRUEvictionStrategy());
      expect(cache.getCacheInfo().evictionPolicy).toBe('lru');

      // Disable eviction
      cache.evictionManager.setEvictionStrategy(null);
      expect(cache.getCacheInfo().supportsEviction).toBe(false);
      expect(cache.getCacheInfo().evictionPolicy).toBeUndefined();
    });
  });

  describe('Cache without TTL or Eviction', () => {
    beforeEach(() => {
      const options = createOptions({
        cacheType: 'memory'
        // No TTL or eviction configuration
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
    });

    it('should show no TTL or eviction support in cache info', () => {
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(false);
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.supportsEviction).toBe(false);
      expect(cacheInfo.implementationType).toBe('memory/memory');
    });

    it('should handle operations gracefully without TTL or eviction', () => {
      expect(cache.ttlManager.isTTLEnabled()).toBe(false);
      expect(cache.evictionManager.isEvictionSupported()).toBe(false);

      // Operations should work without errors
      cache.ttlManager.onItemAdded('test-key', cache.cacheMap);
      cache.evictionManager.onItemAdded('test-key', { test: 'data' }, cache.cacheMap);

      expect(cache.ttlManager.validateItem('test-key', cache.cacheMap)).toBe(true);
      expect(cache.evictionManager.performEviction(cache.cacheMap)).toEqual([]);
    });
  });
});
