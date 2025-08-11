import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cache, createCache } from '../src/Cache';
import { createOptions } from '../src/Options';
import { ClientApi } from '@fjell/client-api';
import { Coordinate, Registry } from '@fjell/registry';
import { Item } from '@fjell/core';

// Mock types for testing
interface TestItem extends Item<'test', 'location'> {
  id: string;
  name: string;
  value: number;
}

// Mock implementations
const mockApi = {
  get: vi.fn(),
  set: vi.fn(),
  all: vi.fn(),
  query: vi.fn()
} as unknown as ClientApi<TestItem, 'test', 'location'>;

const mockCoordinate: Coordinate<'test', 'location'> = {
  kta: ['test', 'location'],
  scopes: []
};

const mockRegistry = {} as Registry;

describe('Cache', () => {
  let cache: Cache<TestItem, 'test', 'location'>;

  afterEach(() => {
    // Destroy cache to clean up resources
    if (cache) {
      cache.destroy();
    }
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  describe('getCacheInfo method', () => {
    it('should provide accurate cache information for basic memory cache', () => {
      const options = createOptions<TestItem, 'test', 'location'>({
        cacheType: 'memory'
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('memory/memory');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(false);
      expect(cacheInfo.supportsEviction).toBe(false);
    });

    it('should provide accurate cache information with TTL enabled', () => {
      const options = createOptions<TestItem, 'test', 'location'>({
        cacheType: 'memory',
        ttl: 5000
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('memory/memory');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBe(5000);
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });

    it('should provide accurate cache information with enhanced memory cache and eviction', () => {
      const options = createOptions<TestItem, 'test', 'location'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxItems: 100,
            maxSizeBytes: '1MB'
          }
        },
        evictionConfig: { type: 'lru' }
      });

      cache = createCache(mockApi, mockCoordinate, mockRegistry, options);
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('memory/enhanced');
      expect(cacheInfo.evictionPolicy).toBe('lru');
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(false);
      expect(cacheInfo.supportsEviction).toBe(true);
    });

  });
});
