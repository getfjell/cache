import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache, createCache } from '../../src/Cache';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from '../../src/browser/SessionStorageCacheMap';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';
import { createCoordinate, createRegistry } from '@fjell/registry';

// Use browser storage mocks from test setup

describe('Cache Integration Tests', () => {
  // Test data types
  interface TestItem extends Item<'test'> {
    id: string;
    name: string;
    value: number;
  }

  interface ContainerItem extends Item<'item', 'container'> {
    id: string;
    title: string;
    containerId: string;
  }

  // Mock API
  const mockApi = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    all: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    exists: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCache with default MemoryCacheMap', () => {
    let cache: Cache<TestItem, 'test'>;

    beforeEach(() => {
      const coordinate = createCoordinate(['test']);
      const registry = createRegistry('cache');

      cache = createCache(mockApi as any, coordinate, registry);
    });

    it('should create cache with MemoryCacheMap by default', () => {
      expect(cache).toBeDefined();
      expect(cache.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(cache.api).toBe(mockApi);
      expect(cache.operations).toBeDefined();
    });

    it('should provide all expected cache operations', () => {
      expect(cache.operations.get).toBeDefined();
      expect(cache.operations.set).toBeDefined();
      expect(cache.operations.all).toBeDefined();
      expect(cache.operations.find).toBeDefined();
      expect(cache.operations.create).toBeDefined();
      expect(cache.operations.update).toBeDefined();
      expect(cache.operations.remove).toBeDefined();
    });

    it('should allow direct cache map operations', () => {
      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      cache.cacheMap.set(testKey, testItem);
      const retrieved = cache.cacheMap.get(testKey);

      expect(retrieved).toEqual(testItem);
    });

    it('should maintain consistency between cache map and operations', async () => {
      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      // Set via cache map
      cache.cacheMap.set(testKey, testItem);

      // Should be accessible via operations
      expect(cache.cacheMap.get(testKey)).toEqual(testItem);
      expect(cache.cacheMap.includesKey(testKey)).toBe(true);
    });
  });

  describe('Cache Factory Pattern', () => {
    const createTestCache = <V extends Item<S>, S extends string>(
      implementation: 'memory' | 'localStorage' | 'sessionStorage',
      keyTypes: [S]
    ) => {
      const coordinate = createCoordinate(keyTypes);
      const registry = createRegistry('cache');

      // Create base cache with MemoryCacheMap
      const baseCache = createCache(mockApi as any, coordinate, registry);

      // Replace the cache map with the desired implementation
      let cacheMap;
      switch (implementation) {
        case 'memory':
          cacheMap = new MemoryCacheMap<V, S>(keyTypes);
          break;
        case 'localStorage':
          cacheMap = new LocalStorageCacheMap<V, S>(keyTypes);
          break;
        case 'sessionStorage':
          cacheMap = new SessionStorageCacheMap<V, S>(keyTypes);
          break;
        default:
          throw new Error(`Unknown implementation: ${implementation}`);
      }

      return {
        ...baseCache,
        cacheMap
      };
    };

    it('should work with MemoryCacheMap', () => {
      const cache = createTestCache<TestItem, 'test'>('memory', ['test']);

      expect(cache.cacheMap).toBeInstanceOf(MemoryCacheMap);

      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      cache.cacheMap.set(testKey, testItem);
      expect(cache.cacheMap.get(testKey)).toEqual(testItem);
    });

    it('should work with LocalStorageCacheMap', () => {
      const cache = createTestCache<TestItem, 'test'>('localStorage', ['test']);

      expect(cache.cacheMap).toBeInstanceOf(LocalStorageCacheMap);

      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      cache.cacheMap.set(testKey, testItem);
      expect(cache.cacheMap.get(testKey)).toEqual(testItem);
    });

    it('should work with SessionStorageCacheMap', () => {
      const cache = createTestCache<TestItem, 'test'>('sessionStorage', ['test']);

      expect(cache.cacheMap).toBeInstanceOf(SessionStorageCacheMap);

      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      cache.cacheMap.set(testKey, testItem);
      expect(cache.cacheMap.get(testKey)).toEqual(testItem);
    });
  });

  describe('Cross-Implementation Compatibility', () => {
    it('should maintain same behavior across different implementations', () => {
      const implementations = ['memory', 'localStorage', 'sessionStorage'] as const;
      const testKey: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
      const testItem: TestItem = { key: testKey, id: '123', name: 'Test Item', value: 100 } as TestItem;

      implementations.forEach(impl => {
        let cacheMap;
        switch (impl) {
          case 'memory':
            cacheMap = new MemoryCacheMap<TestItem, 'test'>(['test']);
            break;
          case 'localStorage':
            cacheMap = new LocalStorageCacheMap<TestItem, 'test'>(['test'], `test-${impl}`);
            break;
          case 'sessionStorage':
            cacheMap = new SessionStorageCacheMap<TestItem, 'test'>(['test'], `test-${impl}`);
            break;
        }

        // All implementations should support the same basic operations
        cacheMap.set(testKey, testItem);
        expect(cacheMap.get(testKey)).toEqual(testItem);
        expect(cacheMap.includesKey(testKey)).toBe(true);
        expect(cacheMap.keys().some(k => JSON.stringify(k) === JSON.stringify(testKey))).toBe(true);
        expect(cacheMap.values().some(v => JSON.stringify(v) === JSON.stringify(testItem))).toBe(true);

        cacheMap.delete(testKey);
        expect(cacheMap.get(testKey)).toBeNull();
        expect(cacheMap.includesKey(testKey)).toBe(false);
      });
    });

    it('should handle key normalization consistently across implementations', () => {
      const implementations = [
        () => new MemoryCacheMap<TestItem, 'test'>(['test']),
        () => new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'norm-test-local'),
        () => new SessionStorageCacheMap<TestItem, 'test'>(['test'], 'norm-test-session')
      ];

      const stringKey: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
      const numberKey: PriKey<'test'> = { kt: 'test', pk: 123 as any };
      const stringItem: TestItem = { key: stringKey, id: '1', name: 'String Key', value: 100 } as TestItem;
      const numberItem: TestItem = { key: numberKey, id: '2', name: 'Number Key', value: 200 } as TestItem;

      implementations.forEach(createCacheMap => {
        const cacheMap = createCacheMap();

        cacheMap.set(stringKey, stringItem);
        cacheMap.set(numberKey, numberItem);

        // Due to normalization, the number key should overwrite the string key
        expect(cacheMap.get(stringKey)).toEqual(numberItem);
        expect(cacheMap.get(numberKey)).toEqual(numberItem);
        expect(cacheMap.keys()).toHaveLength(1);
      });
    });
  });

  describe('Complex Location-based Operations', () => {
    it('should work consistently across implementations for composite keys', () => {
      const implementations = [
        () => new MemoryCacheMap<ContainerItem, 'item', 'container'>(['item', 'container']),
        () => new LocalStorageCacheMap<ContainerItem, 'item', 'container'>(['item', 'container'], 'comp-test-local'),
        () => new SessionStorageCacheMap<ContainerItem, 'item', 'container'>(['item', 'container'], 'comp-test-session')
      ];

      const containerKey1: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1' as UUID,
        loc: [{ kt: 'container', lk: 'container-1' as UUID }]
      };

      const containerKey2: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '2' as UUID,
        loc: [{ kt: 'container', lk: 'container-2' as UUID }]
      };

      const item1: ContainerItem = { key: containerKey1, id: '1', title: 'Item 1', containerId: 'container-1' } as ContainerItem;
      const item2: ContainerItem = { key: containerKey2, id: '2', title: 'Item 2', containerId: 'container-2' } as ContainerItem;

      implementations.forEach(createCacheMap => {
        const cacheMap = createCacheMap();

        cacheMap.set(containerKey1, item1);
        cacheMap.set(containerKey2, item2);

        // Test location-based queries
        const container1Items = cacheMap.allIn([{ kt: 'container', lk: 'container-1' as UUID }]);
        expect(container1Items).toHaveLength(1);
        expect(container1Items[0]).toEqual(item1);

        const container2Items = cacheMap.allIn([{ kt: 'container', lk: 'container-2' as UUID }]);
        expect(container2Items).toHaveLength(1);
        expect(container2Items[0]).toEqual(item2);

        const allItems = cacheMap.allIn([]);
        expect(allItems).toHaveLength(2);
        expect(allItems.some(item => JSON.stringify(item) === JSON.stringify(item1))).toBe(true);
        expect(allItems.some(item => JSON.stringify(item) === JSON.stringify(item2))).toBe(true);
      });
    });
  });

  describe('Migration and Compatibility', () => {
    it('should maintain backward compatibility with existing cache usage', () => {
      // This test ensures that existing code using createCache still works
      const coordinate = createCoordinate(['test']);
      const registry = createRegistry('cache');

      const cache = createCache(mockApi as any, coordinate, registry);

      // These operations should work exactly as before
      expect(cache.coordinate).toBeDefined();
      expect(cache.registry).toBeDefined();
      expect(cache.api).toBeDefined();
      expect(cache.cacheMap).toBeDefined();
      expect(cache.operations).toBeDefined();

      // The cache map should be the default MemoryCacheMap
      expect(cache.cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should allow easy migration to different cache implementations', () => {
      // Example migration pattern
      const coordinate = createCoordinate(['test']);
      const registry = createRegistry('cache');

      // Old way (still works)
      const memoryCache = createCache(mockApi as any, coordinate, registry);
      expect(memoryCache.cacheMap).toBeInstanceOf(MemoryCacheMap);

      // New way - replace with browser storage
      const localStorageCache = {
        ...memoryCache,
        cacheMap: new LocalStorageCacheMap<TestItem, 'test'>(['test'])
      };
      expect(localStorageCache.cacheMap).toBeInstanceOf(LocalStorageCacheMap);

      // Both should have the same interface
      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      memoryCache.cacheMap.set(testKey, testItem);
      localStorageCache.cacheMap.set(testKey, testItem);

      expect(memoryCache.cacheMap.get(testKey)).toEqual(testItem);
      expect(localStorageCache.cacheMap.get(testKey)).toEqual(testItem);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large datasets efficiently across implementations', () => {
      const createLargeDataset = (size: number) => {
        return Array.from({ length: size }, (_, i) => {
          const key: PriKey<'test'> = { kt: 'test', pk: `item-${i}` as UUID };
          const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i } as TestItem;
          return { key, item };
        });
      };

      const dataset = createLargeDataset(100);
      const implementations = [
        () => new MemoryCacheMap<TestItem, 'test'>(['test']),
        () => new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'perf-test-local'),
        () => new SessionStorageCacheMap<TestItem, 'test'>(['test'], 'perf-test-session')
      ];

      implementations.forEach(createCacheMap => {
        const cacheMap = createCacheMap();
        const startTime = Date.now();

        // Insert all items
        dataset.forEach(({ key, item }) => {
          cacheMap.set(key, item);
        });

        // Verify all items
        dataset.forEach(({ key, item }) => {
          expect(cacheMap.get(key)).toEqual(item);
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within reasonable time
        expect(duration).toBeLessThan(1000); // 1 second
        expect(cacheMap.keys()).toHaveLength(100);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle storage errors gracefully in browser implementations', () => {
      // Test localStorage quota exceeded scenario
      const localCache = new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'error-test');

      // Mock storage error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const testKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testItem: TestItem = { key: testKey, id: '1', name: 'Test Item', value: 100 } as TestItem;

      expect(() => {
        localCache.set(testKey, testItem);
      }).toThrow('Failed to store item in localStorage');

      // Restore original method
      localStorage.setItem = originalSetItem;
    });

    it('should maintain cache integrity during partial failures', () => {
      const cacheMap = new MemoryCacheMap<TestItem, 'test'>(['test']);

      const testKey1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const testKey2: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };
      const testItem1: TestItem = { key: testKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;
      const testItem2: TestItem = { key: testKey2, id: '2', name: 'Item 2', value: 200 } as TestItem;

      // Insert first item successfully
      cacheMap.set(testKey1, testItem1);
      expect(cacheMap.get(testKey1)).toEqual(testItem1);

      // Second item should also work (no partial failure in memory cache)
      cacheMap.set(testKey2, testItem2);
      expect(cacheMap.get(testKey2)).toEqual(testItem2);

      // Both items should still be available
      expect(cacheMap.keys()).toHaveLength(2);
      expect(cacheMap.get(testKey1)).toEqual(testItem1);
    });
  });
});
