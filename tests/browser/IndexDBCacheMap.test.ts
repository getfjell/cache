/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexDBCacheMap } from '../../src/browser/IndexDBCacheMap';
import { AsyncIndexDBCacheMap } from '../../src/browser/AsyncIndexDBCacheMap';
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';

// Mock IndexedDB
Object.defineProperty(global, 'indexedDB', {
  value: {
    open: vi.fn().mockImplementation(() => ({
      result: {
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({ result: null }),
            put: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            openCursor: vi.fn().mockReturnValue({ result: null })
          })
        }),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false)
        },
        createObjectStore: vi.fn()
      },
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null
    }))
  },
  writable: true
});

describe('IndexDBCacheMap (Synchronous Wrapper)', () => {
  // Test data types
  interface TestItem extends Item<'test', 'container'> {
    id: string;
    name: string;
    value: number;
  }

  // Test keys
  const priKey1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
  const priKey2: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };
  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '3' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  let cacheMap: IndexDBCacheMap<TestItem, 'test', 'container'>;
  let testItem1: TestItem;
  let testItem2: TestItem;
  let testItem3: TestItem;

  beforeEach(() => {
    cacheMap = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

    testItem1 = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;
    testItem2 = { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem;
    testItem3 = { key: comKey1, id: '3', name: 'Item 3', value: 300 } as TestItem;
  });

  describe('Constructor', () => {
    it('should create wrapper with default parameters', () => {
      const cache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(IndexDBCacheMap);
      expect(cache.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });

    it('should create wrapper with custom parameters', () => {
      const cache = new IndexDBCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'custom-db',
        'custom-store',
        2
      );
      expect(cache).toBeInstanceOf(IndexDBCacheMap);
      expect(cache.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });

    it('should have correct implementationType', () => {
      expect(cacheMap.implementationType).toBe('browser/indexedDB');
    });

    it('should provide correct cache information', () => {
      const cacheInfo = cacheMap.getCacheInfo();
      expect(cacheInfo.implementationType).toBe('browser/indexedDB');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });

    it('should provide access to async cache instance', () => {
      expect(cacheMap.asyncCache).toBeDefined();
      expect(cacheMap.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });
  });

  describe('Synchronous Memory Cache Operations', () => {
    describe('get() and set()', () => {
      it('should store and retrieve items synchronously', () => {
        // Set item
        cacheMap.set(priKey1, testItem1);

        // Get item immediately (from memory cache)
        const retrieved = cacheMap.get(priKey1);
        expect(retrieved).toEqual(testItem1);
      });

      it('should return null for non-existent keys', () => {
        const result = cacheMap.get(priKey1);
        expect(result).toBeNull();
      });

      it('should handle multiple items', () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(priKey2, testItem2);

        expect(cacheMap.get(priKey1)).toEqual(testItem1);
        expect(cacheMap.get(priKey2)).toEqual(testItem2);
      });
    });

    describe('includesKey()', () => {
      it('should return true for existing keys', () => {
        cacheMap.set(priKey1, testItem1);
        expect(cacheMap.includesKey(priKey1)).toBe(true);
      });

      it('should return false for non-existent keys', () => {
        expect(cacheMap.includesKey(priKey1)).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should remove items from memory cache', () => {
        cacheMap.set(priKey1, testItem1);
        expect(cacheMap.includesKey(priKey1)).toBe(true);

        cacheMap.delete(priKey1);
        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.get(priKey1)).toBeNull();
      });
    });

    describe('keys()', () => {
      it('should return all keys', () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(priKey2, testItem2);

        const keys = cacheMap.keys();
        expect(keys).toHaveLength(2);
        expect(keys).toContain(priKey1);
        expect(keys).toContain(priKey2);
      });

      it('should return empty array when no items', () => {
        const keys = cacheMap.keys();
        expect(keys).toEqual([]);
      });
    });

    describe('values()', () => {
      it('should return all values', () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(priKey2, testItem2);

        const values = cacheMap.values();
        expect(values).toHaveLength(2);
        expect(values).toContain(testItem1);
        expect(values).toContain(testItem2);
      });
    });

    describe('clear()', () => {
      it('should remove all items from memory cache', () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(priKey2, testItem2);
        expect(cacheMap.keys()).toHaveLength(2);

        cacheMap.clear();
        expect(cacheMap.keys()).toHaveLength(0);
      });
    });

    describe('allIn()', () => {
      it('should return items in specified locations', () => {
        cacheMap.set(comKey1, testItem3);
        cacheMap.set(priKey1, testItem1); // This has no location

        const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = cacheMap.allIn(locations);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItem3);
      });

      it('should return all items when locations is empty', () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(comKey1, testItem3);

        const items = cacheMap.allIn([]);
        expect(items).toHaveLength(2);
      });
    });
  });

  describe('TTL Support', () => {
    it('should support getWithTTL', () => {
      cacheMap.set(priKey1, testItem1);

      // Should get the item within TTL
      const result = cacheMap.getWithTTL(priKey1, 1000);
      expect(result).toEqual(testItem1);
    });
  });

  describe('Background IndexedDB Sync', () => {
    it('should sync set operations to IndexedDB in background', () => {
      // This test verifies the async sync doesn't throw errors
      expect(() => {
        cacheMap.set(priKey1, testItem1);
      }).not.toThrow();
    });

    it('should sync delete operations to IndexedDB in background', () => {
      cacheMap.set(priKey1, testItem1);

      expect(() => {
        cacheMap.delete(priKey1);
      }).not.toThrow();
    });

    it('should sync clear operations to IndexedDB in background', () => {
      cacheMap.set(priKey1, testItem1);

      expect(() => {
        cacheMap.clear();
      }).not.toThrow();
    });
  });

  describe('Query Result Caching', () => {
    it('should support query result caching methods', () => {
      const queryHash = 'test-query-hash';
      const itemKeys = [priKey1, priKey2];

      expect(() => {
        cacheMap.setQueryResult(queryHash, itemKeys);
      }).not.toThrow();

      const result = cacheMap.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);

      expect(cacheMap.hasQueryResult(queryHash)).toBe(true);

      cacheMap.deleteQueryResult(queryHash);
      expect(cacheMap.hasQueryResult(queryHash)).toBe(false);
    });

    it('should support query result caching with TTL', () => {
      const queryHash = 'test-query-hash-ttl';
      const itemKeys = [priKey1];
      const ttl = 5000;

      expect(() => {
        cacheMap.setQueryResult(queryHash, itemKeys, ttl);
      }).not.toThrow();
    });
  });

  describe('Invalidation Methods', () => {
    it('should support item key invalidation', () => {
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(priKey2, testItem2);

      expect(() => {
        cacheMap.invalidateItemKeys([priKey1, priKey2]);
      }).not.toThrow();

      // Items should be removed from memory cache
      expect(cacheMap.includesKey(priKey1)).toBe(false);
      expect(cacheMap.includesKey(priKey2)).toBe(false);
    });

    it('should support location invalidation', () => {
      cacheMap.set(comKey1, testItem3);
      const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

      expect(() => {
        cacheMap.invalidateLocation(locations);
      }).not.toThrow();
    });

    it('should support clearing query results', () => {
      cacheMap.setQueryResult('query1', [priKey1]);
      cacheMap.setQueryResult('query2', [priKey2]);

      expect(() => {
        cacheMap.clearQueryResults();
      }).not.toThrow();

      expect(cacheMap.hasQueryResult('query1')).toBe(false);
      expect(cacheMap.hasQueryResult('query2')).toBe(false);
    });
  });

  describe('clone()', () => {
    it('should create a new wrapper instance', () => {
      const cloned = cacheMap.clone();

      expect(cloned).toBeInstanceOf(IndexDBCacheMap);
      expect(cloned).not.toBe(cacheMap);
      expect(cloned.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });

    it('should create independent wrapper instances', () => {
      const cloned = cacheMap.clone();

      // Wrappers are different instances
      expect(cloned).not.toBe(cacheMap);

      // But both have their own async cache instances
      expect(cloned.asyncCache).not.toBe(cacheMap.asyncCache);
    });

    it('should not share memory cache state', () => {
      cacheMap.set(priKey1, testItem1);
      const cloned = cacheMap.clone();

      // Cloned instance should start empty
      expect(cloned.get(priKey1)).toBeNull();
      expect(cloned.keys()).toHaveLength(0);
    });
  });

  describe('Resource Cleanup', () => {
    it('should provide destroy method for cleanup', () => {
      expect(typeof cacheMap.destroy).toBe('function');

      expect(() => {
        cacheMap.destroy();
      }).not.toThrow();
    });
  });

  describe('Integration with Memory Cache', () => {
    it('should demonstrate synchronous usage pattern', () => {
      // This is the correct usage pattern for IndexDBCacheMap

      // Synchronous operations work immediately with memory cache
      cacheMap.set(priKey1, testItem1);
      expect(cacheMap.get(priKey1)).toEqual(testItem1);
      expect(cacheMap.includesKey(priKey1)).toBe(true);

      cacheMap.set(priKey2, testItem2);
      expect(cacheMap.keys()).toHaveLength(2);
      expect(cacheMap.values()).toHaveLength(2);

      cacheMap.delete(priKey1);
      expect(cacheMap.includesKey(priKey1)).toBe(false);
      expect(cacheMap.keys()).toHaveLength(1);
    });

    it('should provide access to async cache for advanced operations', async () => {
      // For operations that need to be explicitly async or for direct IndexedDB access
      expect(cacheMap.asyncCache).toBeDefined();
      expect(typeof cacheMap.asyncCache.get).toBe('function');
      expect(typeof cacheMap.asyncCache.set).toBe('function');
    });
  });
});
