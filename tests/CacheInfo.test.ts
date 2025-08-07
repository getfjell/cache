import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { EnhancedMemoryCacheMap } from '../src/memory/EnhancedMemoryCacheMap';
import { LocalStorageCacheMap } from '../src/browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from '../src/browser/SessionStorageCacheMap';
import { IndexDBCacheMap } from '../src/browser/IndexDBCacheMap';
import { CacheSizeConfig } from '../src/Options';
import { Item, PriKey, UUID } from '@fjell/core';

describe('CacheInfo Interface and getCacheInfo() Method', () => {
  interface TestItem extends Item<'test'> {
    id: string;
    name: string;
    value: number;
  }

  const priKey: PriKey<'test'> = { kt: 'test', pk: 'item1' as UUID };
  const testItem: TestItem = { key: priKey, id: 'item1', name: 'Test Item', value: 100 } as TestItem;

  describe('CacheInfo interface compliance', () => {
    it('should have consistent CacheInfo structure across all implementations', () => {
      const implementations = [
        () => new MemoryCacheMap<TestItem, 'test'>(['test']),
        () => new EnhancedMemoryCacheMap<TestItem, 'test'>(['test']),
        () => new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-info'),
        () => new SessionStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-info'),
        () => new IndexDBCacheMap<TestItem, 'test'>(['test'])
      ];

      implementations.forEach(createCache => {
        const cache = createCache();
        const cacheInfo = cache.getCacheInfo();

        // Required properties
        expect(cacheInfo).toHaveProperty('implementationType');
        expect(cacheInfo).toHaveProperty('supportsTTL');
        expect(cacheInfo).toHaveProperty('supportsEviction');

        // Type checks
        expect(typeof cacheInfo.implementationType).toBe('string');
        expect(typeof cacheInfo.supportsTTL).toBe('boolean');
        expect(typeof cacheInfo.supportsEviction).toBe('boolean');

        // Optional properties (when present)
        if (cacheInfo.evictionPolicy) {
          expect(typeof cacheInfo.evictionPolicy).toBe('string');
        }
        if (cacheInfo.defaultTTL) {
          expect(typeof cacheInfo.defaultTTL).toBe('number');
        }
      });
    });
  });

  describe('MemoryCacheMap cache info', () => {
    let cache: MemoryCacheMap<TestItem, 'test'>;

    beforeEach(() => {
      cache = new MemoryCacheMap<TestItem, 'test'>(['test']);
    });

    it('should provide accurate basic memory cache information', () => {
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('memory/memory');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });

    it('should maintain consistent cache info after operations', () => {
      const initialInfo = cache.getCacheInfo();

      // Perform cache operations
      cache.set(priKey, testItem);
      cache.get(priKey);
      cache.delete(priKey);

      const afterOpsInfo = cache.getCacheInfo();
      expect(afterOpsInfo).toEqual(initialInfo);
    });
  });

  describe('EnhancedMemoryCacheMap cache info', () => {
    it('should provide accurate enhanced memory cache information with default config', () => {
      const cache = new EnhancedMemoryCacheMap<TestItem, 'test'>(['test']);
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('memory/enhanced');
      expect(cacheInfo.evictionPolicy).toBe('lru'); // Default policy
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(true);
    });

    it('should reflect custom eviction policies correctly', () => {
      const evictionPolicies = ['lru', 'lfu', 'fifo', 'mru', 'random', 'arc', '2q'] as const;

      evictionPolicies.forEach(policy => {
        const config: CacheSizeConfig = {
          maxItems: 100,
          evictionPolicy: policy
        };

        const cache = new EnhancedMemoryCacheMap<TestItem, 'test'>(['test'], config);
        const cacheInfo = cache.getCacheInfo();

        expect(cacheInfo.evictionPolicy).toBe(policy);
        expect(cacheInfo.supportsEviction).toBe(true);
      });
    });

    it('should maintain consistent cache info during eviction operations', () => {
      const config: CacheSizeConfig = {
        maxItems: 2,
        evictionPolicy: 'lru'
      };

      const cache = new EnhancedMemoryCacheMap<TestItem, 'test'>(['test'], config);
      const initialInfo = cache.getCacheInfo();

      // Force eviction by exceeding maxItems
      for (let i = 0; i < 5; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` as UUID };
        const item: TestItem = { key, id: `item${i}`, name: `Item ${i}`, value: i } as TestItem;
        cache.set(key, item);
      }

      const afterEvictionInfo = cache.getCacheInfo();
      expect(afterEvictionInfo).toEqual(initialInfo);
    });
  });

  describe('Browser-based cache implementations', () => {
    beforeEach(() => {
      // Reset browser storage mocks
      if (typeof window !== 'undefined') {
        if (window.localStorage && typeof (window.localStorage as any).__resetStore === 'function') {
          (window.localStorage as any).__resetStore();
        }
        if (window.sessionStorage && typeof (window.sessionStorage as any).__resetStore === 'function') {
          (window.sessionStorage as any).__resetStore();
        }
      }
    });

    it('should provide accurate localStorage cache information', () => {
      const cache = new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-info');
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('browser/localStorage');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });

    it('should provide accurate sessionStorage cache information', () => {
      const cache = new SessionStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-info');
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('browser/sessionStorage');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });

    it('should provide accurate indexedDB cache information', () => {
      const cache = new IndexDBCacheMap<TestItem, 'test'>(['test']);
      const cacheInfo = cache.getCacheInfo();

      expect(cacheInfo.implementationType).toBe('browser/indexedDB');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });
  });

  describe('Cache info consistency', () => {
    it('should maintain cache info consistency after TTL operations', () => {
      const cache = new MemoryCacheMap<TestItem, 'test'>(['test']);
      const initialInfo = cache.getCacheInfo();

      // Perform TTL operations
      cache.set(priKey, testItem);
      cache.getWithTTL(priKey, 1000); // Get with 1 second TTL
      cache.getWithTTL(priKey, 0); // Get with 0 TTL (disable cache)

      const afterTTLInfo = cache.getCacheInfo();
      expect(afterTTLInfo).toEqual(initialInfo);
    });

    it('should provide the same cache info from multiple calls', () => {
      const cache = new EnhancedMemoryCacheMap<TestItem, 'test'>(['test'], {
        maxItems: 50,
        evictionPolicy: 'lfu'
      });

      const info1 = cache.getCacheInfo();
      const info2 = cache.getCacheInfo();
      const info3 = cache.getCacheInfo();

      expect(info1).toEqual(info2);
      expect(info2).toEqual(info3);
    });
  });

  describe('Implementation type format validation', () => {
    it('should follow the "<category>/<implementation>" format for all implementations', () => {
      const implementations = [
        { cache: () => new MemoryCacheMap<TestItem, 'test'>(['test']), expectedFormat: /^memory\/memory$/ },
        { cache: () => new EnhancedMemoryCacheMap<TestItem, 'test'>(['test']), expectedFormat: /^memory\/enhanced$/ },
        { cache: () => new LocalStorageCacheMap<TestItem, 'test'>(['test']), expectedFormat: /^browser\/localStorage$/ },
        { cache: () => new SessionStorageCacheMap<TestItem, 'test'>(['test']), expectedFormat: /^browser\/sessionStorage$/ },
        { cache: () => new IndexDBCacheMap<TestItem, 'test'>(['test']), expectedFormat: /^browser\/indexedDB$/ }
      ];

      implementations.forEach(({ cache, expectedFormat }) => {
        const cacheInstance = cache();
        const cacheInfo = cacheInstance.getCacheInfo();

        expect(cacheInfo.implementationType).toMatch(expectedFormat);
        expect(cacheInfo.implementationType).toMatch(/^[a-zA-Z]+\/[a-zA-Z]+$/);
        expect(cacheInfo.implementationType.split('/').length).toBe(2);
      });
    });
  });
});
