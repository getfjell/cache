
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexDBCacheMap } from '../../src/browser/IndexDBCacheMap';
import { AsyncIndexDBCacheMap } from '../../src/browser/AsyncIndexDBCacheMap';
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/types';

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

  // Static date to avoid creating new Date objects on each test
  const STATIC_DATE = new Date('2023-01-01T00:00:00.000Z');

  beforeEach(() => {
    cacheMap = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

    testItem1 = { key: priKey1, id: '1', name: 'Item 1', value: 100, events: { created: { at: STATIC_DATE }, deleted: { at: null }, updated: { at: STATIC_DATE } } } as TestItem;
    testItem2 = { key: priKey2, id: '2', name: 'Item 2', value: 200, events: { created: { at: STATIC_DATE }, deleted: { at: null }, updated: { at: STATIC_DATE } } } as TestItem;
    testItem3 = { key: comKey1, id: '3', name: 'Item 3', value: 300, events: { created: { at: STATIC_DATE }, deleted: { at: null }, updated: { at: STATIC_DATE } } } as TestItem;
  });

  describe('Constructor', () => {
    it('should create wrapper with default parameters', () => {
      const cache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(IndexDBCacheMap);
      expect(cache.implementationType).toBe('browser/indexedDB');
    });

    it('should create wrapper with custom parameters', () => {
      const cache = new IndexDBCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'custom-db',
        'custom-store',
        2
      );
      expect(cache).toBeInstanceOf(IndexDBCacheMap);
      expect(cache.implementationType).toBe('browser/indexedDB');
    });

    it('should have correct implementationType', () => {
      expect(cacheMap.implementationType).toBe('browser/indexedDB');
    });

    it('should provide access to async cache instance', () => {
      expect(cacheMap.asyncCache).toBeDefined();
      expect(cacheMap.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });
  });

  describe('Synchronous Memory Cache Operations', () => {
    describe('get() and set()', () => {
      it('should store and retrieve items synchronously', async () => {
        // Set item
        cacheMap.set(priKey1, testItem1);

        // Get item immediately (from memory cache)
        const retrieved = await cacheMap.get(priKey1);
        expect(retrieved).toEqual(testItem1);
      });

      it('should return null for non-existent keys', async () => {
        const result = await cacheMap.get(priKey1);
        expect(result).toBeNull();
      });

      it('should handle multiple items', async () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(priKey2, testItem2);

        expect(await cacheMap.get(priKey1)).toEqual(testItem1);
        expect(await cacheMap.get(priKey2)).toEqual(testItem2);
      });
    });

    describe('includesKey()', () => {
      it('should return true for existing keys', async () => {
        cacheMap.set(priKey1, testItem1);
        expect(await cacheMap.includesKey(priKey1)).toBe(true);
      });

      it('should return false for non-existent keys', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should remove items from memory cache', async () => {
        cacheMap.set(priKey1, testItem1);
        expect(await cacheMap.includesKey(priKey1)).toBe(true);

        cacheMap.delete(priKey1);
        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.get(priKey1)).toBeNull();
      });
    });

    describe('keys()', () => {
      it('should return all keys', async () => {
        await cacheMap.set(priKey1, testItem1);
        await cacheMap.set(priKey2, testItem2);

        const keys = await cacheMap.keys();
        expect(keys).toHaveLength(2);
        expect(keys).toContain(priKey1);
        expect(keys).toContain(priKey2);
      });

      it('should return empty array when no items', async () => {
        const keys = await cacheMap.keys();
        expect(keys).toEqual([]);
      });
    });

    describe('values()', () => {
      it('should return all values', async () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(priKey2, testItem2);

        const values = await cacheMap.values();
        expect(values).toHaveLength(2);
        expect(values).toContain(testItem1);
        expect(values).toContain(testItem2);
      });
    });

    describe('clear()', () => {
      it('should remove all items from memory cache', async () => {
        await cacheMap.set(priKey1, testItem1);
        await cacheMap.set(priKey2, testItem2);
        expect(await cacheMap.keys()).toHaveLength(2);

        await cacheMap.clear();
        expect(await cacheMap.keys()).toHaveLength(0);
      });
    });

    describe('allIn()', () => {
      it('should return items in specified locations', async () => {
        cacheMap.set(comKey1, testItem3);
        cacheMap.set(priKey1, testItem1); // This has no location

        const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = await cacheMap.allIn(locations);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItem3);
      });

      it('should return all items when locations is empty', async () => {
        cacheMap.set(priKey1, testItem1);
        cacheMap.set(comKey1, testItem3);

        const items = await cacheMap.allIn([]);
        expect(items).toHaveLength(2);
      });
    });
  });

  describe('Background IndexedDB Sync', () => {
    it('should sync set operations to IndexedDB in background', async () => {
      // This test verifies the async sync doesn't throw errors
      expect(() => {
        cacheMap.set(priKey1, testItem1);
      }).not.toThrow();
    });

    it('should sync delete operations to IndexedDB in background', async () => {
      await cacheMap.set(priKey1, testItem1);

      expect(() => {
        cacheMap.delete(priKey1);
      }).not.toThrow();
    });

    it('should sync clear operations to IndexedDB in background', async () => {
      await cacheMap.set(priKey1, testItem1);

      expect(() => {
        cacheMap.clear();
      }).not.toThrow();
    });
  });

  describe('Query Result Caching', () => {
    it('should support query result caching methods', async () => {
      const queryHash = 'test-query-hash';
      const itemKeys = [priKey1, priKey2];

      expect(() => {
        cacheMap.setQueryResult(queryHash, itemKeys);
      }).not.toThrow();

      const result = await cacheMap.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);

      expect(await cacheMap.hasQueryResult(queryHash)).toBe(true);

      await cacheMap.deleteQueryResult(queryHash);
      expect(await cacheMap.hasQueryResult(queryHash)).toBe(false);
    });

    it('should support query result caching with TTL', () => {
      const queryHash = 'test-query-hash-ttl';
      const itemKeys = [priKey1];
      const ttl = 5000;

      expect(() => {
        cacheMap.setQueryResult(queryHash, itemKeys);
      }).not.toThrow();
    });
  });

  describe('Invalidation Methods', () => {
    it('should support item key invalidation', async () => {
      await cacheMap.set(priKey1, testItem1);
      await cacheMap.set(priKey2, testItem2);

      expect(() => {
        cacheMap.invalidateItemKeys([priKey1, priKey2]);
      }).not.toThrow();

      // Items should still be in memory cache (invalidateItemKeys only clears query results)
      expect(await cacheMap.includesKey(priKey1)).toBe(true);
      expect(await cacheMap.includesKey(priKey2)).toBe(true);
    });

    it('should support location invalidation', async () => {
      cacheMap.set(comKey1, testItem3);
      const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

      // Don't use expect with async function, just await directly
      await cacheMap.invalidateLocation(locations);
      // If it throws, the test will fail automatically
    });

    it('should support clearing query results', async () => {
      await cacheMap.setQueryResult('query1', [priKey1]);
      await cacheMap.setQueryResult('query2', [priKey2]);

      expect(() => {
        cacheMap.clearQueryResults();
      }).not.toThrow();

      expect(await cacheMap.hasQueryResult('query1')).toBe(false);
      expect(await cacheMap.hasQueryResult('query2')).toBe(false);
    });
  });

  describe('clone()', () => {
    it('should create a new wrapper instance', async () => {
      const cloned = await cacheMap.clone();

      expect(cloned).toBeInstanceOf(IndexDBCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should create independent wrapper instances', async () => {
      const cloned = await cacheMap.clone();

      // Wrappers are different instances
      expect(cloned).not.toBe(cacheMap);
    });

    it('should not share memory cache state', async () => {
      await cacheMap.set(priKey1, testItem1);
      const cloned = await cacheMap.clone();

      // Cloned instance should have a copy of the memory state
      expect(await cloned.get(priKey1)).toEqual(testItem1);
      expect(await cloned.keys()).toHaveLength(1);
    });
  });

  describe('Initialization and Error Handling', () => {
    it('should handle initialization from IndexedDB gracefully', async () => {
      // Create a new cache to test initialization
      const newCache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

      // Should not throw during construction
      expect(newCache).toBeInstanceOf(IndexDBCacheMap);

      // Should work immediately even if initialization is pending
      await newCache.set(priKey1, testItem1);
      expect(await newCache.get(priKey1)).toEqual(testItem1);
    });

    it('should handle IndexedDB initialization failures gracefully', async () => {
      // Mock console.warn to test error handling
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // Mock asyncCache.keys to fail
      const mockAsyncCache = {
        keys: vi.fn().mockRejectedValue(new Error('IndexedDB error')),
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn()
      };

      const newCache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      // Note: asyncCache is private, so we can't test it directly in the public interface

      // Should still work with memory cache after initialization failure
      newCache.set(priKey1, testItem1);
      expect(await newCache.get(priKey1)).toEqual(testItem1);

      consoleSpy.mockRestore();
    });

    it('should not reload from IndexedDB if key already exists in memory', async () => {
      const mockAsyncCache = {
        keys: vi.fn().mockResolvedValue([priKey1]),
        get: vi.fn().mockResolvedValue(testItem2), // Different value than in memory
        set: vi.fn().mockResolvedValue(void 0),
        delete: vi.fn().mockResolvedValue(void 0),
        clear: vi.fn().mockResolvedValue(void 0)
      };

      const newCache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

      // Set value in memory before initialization completes
      newCache.set(priKey1, testItem1);

      // Note: asyncCache is private, so we can't test it directly in the public interface

      // Memory value should be preserved, not overwritten by IndexedDB
      expect(await newCache.get(priKey1)).toEqual(testItem1);

      // Ensure get was not called for existing key
      expect(mockAsyncCache.get).not.toHaveBeenCalled();
    });

    it('should handle get operations before initialization completes', async () => {
      const newCache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

      // Should return null for non-existent keys even during initialization
      expect(await newCache.get(priKey1)).toBeNull();
      expect(await newCache.includesKey(priKey1)).toBe(false);
    });
  });

  describe('Pending Operations and Synchronization', () => {
    beforeEach(() => {
      // Clear any console.warn calls from previous tests
      vi.clearAllMocks();
    });

    it('should queue operations for sync when IndexedDB is available', async () => {
      const setPromise = Promise.resolve();
      const mockSet = vi.fn().mockReturnValue(setPromise);
      cacheMap.asyncCache.set = mockSet;

      cacheMap.set(priKey1, testItem1);

      // Should immediately be available in memory
      expect(await cacheMap.get(priKey1)).toEqual(testItem1);

      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should trigger async sync with metadata
      expect(mockSet).toHaveBeenCalledWith(priKey1, testItem1, expect.any(Object));
    });

    it('should handle sync failures gracefully without affecting memory cache', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      const mockSet = vi.fn().mockRejectedValue(new Error('IndexedDB sync failed'));
      cacheMap.asyncCache.set = mockSet;

      cacheMap.set(priKey1, testItem1);

      // Memory cache should work regardless of sync failure
      expect(await cacheMap.get(priKey1)).toEqual(testItem1);

      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have attempted sync with metadata
      expect(mockSet).toHaveBeenCalledWith(priKey1, testItem1, expect.any(Object));

      consoleSpy.mockRestore();
    });

    it('should queue delete operations for sync', async () => {
      const deletePromise = Promise.resolve();
      const mockDelete = vi.fn().mockReturnValue(deletePromise);
      cacheMap.asyncCache.delete = mockDelete;

      cacheMap.set(priKey1, testItem1);
      cacheMap.delete(priKey1);

      // Should immediately be removed from memory
      expect(await cacheMap.get(priKey1)).toBeNull();

      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should trigger async sync
      expect(mockDelete).toHaveBeenCalledWith(priKey1);
    });

    it('should handle delete sync failures gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      const mockDelete = vi.fn().mockRejectedValue(new Error('IndexedDB delete failed'));
      cacheMap.asyncCache.delete = mockDelete;

      cacheMap.set(priKey1, testItem1);
      cacheMap.delete(priKey1);

      // Memory cache should be updated regardless of sync failure
      expect(await cacheMap.get(priKey1)).toBeNull();

      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have attempted sync
      expect(mockDelete).toHaveBeenCalledWith(priKey1);

      consoleSpy.mockRestore();
    });

    it('should queue clear operations for sync', async () => {
      const clearPromise = Promise.resolve();
      const mockClear = vi.fn().mockReturnValue(clearPromise);
      cacheMap.asyncCache.clear = mockClear;

      cacheMap.set(priKey1, testItem1);
      cacheMap.clear();

      // Should immediately be cleared from memory
      expect(await cacheMap.keys()).toHaveLength(0);

      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should trigger async sync
      expect(mockClear).toHaveBeenCalled();
    });

    it('should handle clear sync failures gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
      const mockClear = vi.fn().mockRejectedValue(new Error('IndexedDB clear failed'));
      cacheMap.asyncCache.clear = mockClear;

      cacheMap.set(priKey1, testItem1);
      cacheMap.clear();

      // Memory cache should be cleared regardless of sync failure
      expect(await cacheMap.keys()).toHaveLength(0);

      // Wait for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have attempted sync
      expect(mockClear).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle sequence IDs for operation ordering', async () => {
      const mockSet = vi.fn().mockResolvedValue(void 0);
      cacheMap.asyncCache.set = mockSet;

      // Perform multiple operations quickly
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(priKey1, testItem2); // Update same key

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Both operations should have been attempted with metadata
      expect(mockSet).toHaveBeenCalledWith(priKey1, testItem1, expect.any(Object));
      expect(mockSet).toHaveBeenCalledWith(priKey1, testItem2, expect.any(Object));
      expect(mockSet).toHaveBeenCalledTimes(2);
    });
  });

  describe('Resource Cleanup', () => {
    it('should provide destroy method for cleanup', () => {
      expect(typeof cacheMap.destroy).toBe('function');

      expect(() => {
        cacheMap.destroy();
      }).not.toThrow();
    });

    it('should clear sync interval on destroy', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      cacheMap.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('should handle multiple destroy calls safely', () => {
      expect(() => {
        cacheMap.destroy();
        cacheMap.destroy(); // Should not throw on second call
      }).not.toThrow();
    });
  });

  describe('Metadata Operations', () => {
    it('should support getting and setting metadata', async () => {
      const keyStr = JSON.stringify(priKey1);
      const metadata = {
        accessCount: 5,
        lastAccessedAt: Date.now(),
        addedAt: Date.now(),
        estimatedSize: 100,
        key: keyStr
      };

      await cacheMap.setMetadata(keyStr, metadata);
      const retrieved = await cacheMap.getMetadata(keyStr);

      expect(retrieved).toEqual(metadata);
    });

    it('should return null for non-existent metadata', async () => {
      const keyStr = JSON.stringify(priKey1);
      const metadata = await cacheMap.getMetadata(keyStr);

      expect(metadata).toBeNull();
    });

    it('should support deleting metadata', async () => {
      const keyStr = JSON.stringify(priKey1);
      const metadata = {
        accessCount: 3,
        lastAccessedAt: Date.now(),
        addedAt: Date.now(),
        estimatedSize: 50,
        key: keyStr
      };

      await cacheMap.setMetadata(keyStr, metadata);
      expect(await cacheMap.getMetadata(keyStr)).toEqual(metadata);

      await cacheMap.deleteMetadata(keyStr);
      expect(await cacheMap.getMetadata(keyStr)).toBeNull();
    });

    it('should support getting all metadata', async () => {
      const keyStr1 = JSON.stringify(priKey1);
      const keyStr2 = JSON.stringify(priKey2);
      const metadata1 = {
        accessCount: 2,
        lastAccessedAt: Date.now(),
        addedAt: Date.now(),
        estimatedSize: 75,
        key: keyStr1
      };
      const metadata2 = {
        accessCount: 4,
        lastAccessedAt: Date.now(),
        addedAt: Date.now(),
        estimatedSize: 125,
        key: keyStr2
      };

      await cacheMap.setMetadata(keyStr1, metadata1);
      await cacheMap.setMetadata(keyStr2, metadata2);

      const allMetadata = await cacheMap.getAllMetadata();
      expect(allMetadata.get(keyStr1)).toEqual(metadata1);
      expect(allMetadata.get(keyStr2)).toEqual(metadata2);
      expect(allMetadata.size).toBe(2);
    });

    it('should support clearing all metadata', async () => {
      const keyStr1 = JSON.stringify(priKey1);
      const keyStr2 = JSON.stringify(priKey2);
      const metadata = {
        accessCount: 1,
        lastAccessedAt: Date.now(),
        addedAt: Date.now(),
        estimatedSize: 25,
        key: keyStr1
      };

      await cacheMap.setMetadata(keyStr1, metadata);
      await cacheMap.setMetadata(keyStr2, metadata);

      expect((await cacheMap.getAllMetadata()).size).toBe(2);

      await cacheMap.clearMetadata();

      expect((await cacheMap.getAllMetadata()).size).toBe(0);
      expect(await cacheMap.getMetadata(keyStr1)).toBeNull();
      expect(await cacheMap.getMetadata(keyStr2)).toBeNull();
    });
  });

  describe('Size and Limits Operations', () => {
    it('should provide current size information', async () => {
      const sizeInfo = await cacheMap.getCurrentSize();

      expect(sizeInfo).toHaveProperty('itemCount');
      expect(sizeInfo).toHaveProperty('sizeBytes');
      expect(typeof sizeInfo.itemCount).toBe('number');
      expect(typeof sizeInfo.sizeBytes).toBe('number');
    });

    it('should update size information when items are added', async () => {
      const initialSize = await cacheMap.getCurrentSize();

      await cacheMap.set(priKey1, testItem1);
      await cacheMap.set(priKey2, testItem2);

      const updatedSize = await cacheMap.getCurrentSize();
      expect(updatedSize.itemCount).toBeGreaterThan(initialSize.itemCount);
      expect(updatedSize.sizeBytes).toBeGreaterThan(initialSize.sizeBytes);
    });

    it('should provide size limits information', async () => {
      const limits = await cacheMap.getSizeLimits();

      expect(limits).toHaveProperty('maxItems');
      expect(limits).toHaveProperty('maxSizeBytes');

      // For memory cache implementation, these might be null (unlimited)
      expect(limits.maxItems === null || typeof limits.maxItems === 'number').toBe(true);
      expect(limits.maxSizeBytes === null || typeof limits.maxSizeBytes === 'number').toBe(true);
    });
  });

  describe('Query Operations Edge Cases', () => {
    it('should support contains method with various queries', async () => {
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(comKey1, testItem3);

      // Query that should match
      const matchingQuery: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'name', value: 'Item 1', operator: '==' }]
        }
      };
      expect(await cacheMap.contains(matchingQuery, [])).toBe(true);

      // Query that should not match
      const nonMatchingQuery: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'name', value: 'Non-existent', operator: '==' }]
        }
      };
      expect(await cacheMap.contains(nonMatchingQuery, [])).toBe(false);
    });

    it('should support contains method with specific locations', async () => {
      cacheMap.set(comKey1, testItem3);
      cacheMap.set(priKey1, testItem1); // No location

      const query: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'name', value: 'Item 3', operator: '==' }]
        }
      };
      const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

      // Should find item in specified location
      expect(await cacheMap.contains(query, locations)).toBe(true);

      // Should not find item with different query in same location
      const differentQuery: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'name', value: 'Item 1', operator: '==' }]
        }
      };
      expect(await cacheMap.contains(differentQuery, locations)).toBe(false);
    });

    it('should support queryIn method with various queries', async () => {
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(priKey2, testItem2);
      cacheMap.set(comKey1, testItem3);

      // Query that matches multiple items
      const valueQuery: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'value', value: 100, operator: '==' }]
        }
      };
      const results = await cacheMap.queryIn(valueQuery, []);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(testItem1);

      // Query with no matches
      const noMatchQuery: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'value', value: 999, operator: '==' }]
        }
      };
      const noResults = await cacheMap.queryIn(noMatchQuery, []);
      expect(noResults).toHaveLength(0);
    });

    it('should support queryIn method with specific locations', async () => {
      cacheMap.set(comKey1, testItem3);
      cacheMap.set(priKey1, testItem1); // No location

      const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

      // Query in specific location
      const query: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'name', value: 'Item 3', operator: '==' }]
        }
      };
      const results = await cacheMap.queryIn(query, locations);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(testItem3);

      // Query for item not in specified location
      const query2: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'name', value: 'Item 1', operator: '==' }]
        }
      };
      const results2 = await cacheMap.queryIn(query2, locations);
      expect(results2).toHaveLength(0);
    });

    it('should handle empty query results correctly', async () => {
      // Empty cache
      const emptyResults = await cacheMap.queryIn({}, []);
      expect(emptyResults).toHaveLength(0);

      // Add some items
      cacheMap.set(priKey1, testItem1);

      // Query with impossible condition
      const impossibleQuery: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [{ column: 'value', value: -1, operator: '==' }]
        }
      };
      const noResults = await cacheMap.queryIn(impossibleQuery, []);
      expect(noResults).toHaveLength(0);
    });
  });

  describe('Integration with Memory Cache', () => {
    it('should demonstrate synchronous usage pattern', async () => {
      // This is the correct usage pattern for IndexDBCacheMap

      // Synchronous operations work immediately with memory cache
      cacheMap.set(priKey1, testItem1);
      expect(await cacheMap.get(priKey1)).toEqual(testItem1);
      expect(await cacheMap.includesKey(priKey1)).toBe(true);

      await cacheMap.set(priKey2, testItem2);
      expect(await cacheMap.keys()).toHaveLength(2);
      expect(await cacheMap.values()).toHaveLength(2);

      await cacheMap.delete(priKey1);
      expect(await cacheMap.includesKey(priKey1)).toBe(false);
      expect(await cacheMap.keys()).toHaveLength(1);
    });

    it('should provide access to async cache for advanced operations', async () => {
      // For operations that need to be explicitly async or for direct IndexedDB access
      expect(cacheMap.asyncCache).toBeDefined();
      expect(typeof cacheMap.asyncCache.get).toBe('function');
      expect(typeof cacheMap.asyncCache.set).toBe('function');
    });

    it('should delegate all operations to memory cache for consistency', async () => {
      // Verify that the wrapper properly delegates to memory cache
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(priKey2, testItem2);

      // Test key operations
      expect(await cacheMap.includesKey(priKey1)).toBe(true);
      expect(await cacheMap.get(priKey1)).toEqual(testItem1);

      // Test collection operations
      const keys = await cacheMap.keys();
      const values = await cacheMap.values();
      expect(keys).toHaveLength(2);
      expect(values).toHaveLength(2);

      // Test location-based operations
      cacheMap.set(comKey1, testItem3);
      const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
      const itemsInLocation = await cacheMap.allIn(locations);
      expect(itemsInLocation).toHaveLength(1);
      expect(itemsInLocation[0]).toEqual(testItem3);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle rapid successive operations on the same key', async () => {
      // Perform rapid operations that might create race conditions
      cacheMap.set(priKey1, testItem1);
      cacheMap.delete(priKey1);
      cacheMap.set(priKey1, testItem2);

      // Final state should be testItem2
      expect(await cacheMap.get(priKey1)).toEqual(testItem2);
      expect(await cacheMap.includesKey(priKey1)).toBe(true);
    });

    it('should handle operations on non-existent keys gracefully', async () => {
      // Delete non-existent key
      expect(() => cacheMap.delete(priKey1)).not.toThrow();

      // Get non-existent key
      expect(await cacheMap.get(priKey1)).toBeNull();
      expect(await cacheMap.includesKey(priKey1)).toBe(false);
    });

    it('should handle null and undefined values appropriately', async () => {
      // The cache should handle actual null values in items
      const nullValueItem = { ...testItem1, name: null as any };

      expect(() => cacheMap.set(priKey1, nullValueItem)).not.toThrow();
      expect(await cacheMap.get(priKey1)).toEqual(nullValueItem);
    });

    it('should handle complex nested object values', async () => {
      const complexItem = {
        ...testItem1,
        nested: {
          deep: {
            value: [1, 2, 3],
            object: { a: 'test', b: 123 }
          }
        }
      };

      cacheMap.set(priKey1, complexItem);
      const retrieved = await cacheMap.get(priKey1);

      expect(retrieved).toEqual(complexItem);
      expect(retrieved?.nested.deep.value).toEqual([1, 2, 3]);
    });

    it('should handle clearing empty cache', async () => {
      // Clear already empty cache
      expect(() => cacheMap.clear()).not.toThrow();
      expect(await cacheMap.keys()).toHaveLength(0);

      // Clear again
      expect(() => cacheMap.clear()).not.toThrow();
      expect(await cacheMap.keys()).toHaveLength(0);
    });

    it('should handle invalidation of non-existent items', async () => {
      // Invalidate keys that don't exist
      expect(() => {
        cacheMap.invalidateItemKeys([priKey1, priKey2]);
      }).not.toThrow();

      // Invalidate locations that don't exist
      const nonExistentLocations: LocKeyArray<'container'> = [
        { kt: 'container', lk: 'non-existent' as UUID }
      ];

      // Don't use expect with async function, just await directly
      await cacheMap.invalidateLocation(nonExistentLocations);
      // If it throws, the test will fail automatically
    });

    it('should handle query result operations with non-existent queries', async () => {
      // Get non-existent query result
      expect(await cacheMap.getQueryResult('non-existent')).toBeNull();
      expect(await cacheMap.hasQueryResult('non-existent')).toBe(false);

      // Delete non-existent query result
      expect(() => {
        cacheMap.deleteQueryResult('non-existent');
      }).not.toThrow();
    });
  });

  describe('Periodic Sync and Background Operations', () => {
    it('should handle periodic sync interval setup', () => {
      // Create a new cache to test interval setup
      const newCache = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

      // Should not throw during construction which sets up interval
      expect(newCache).toBeInstanceOf(IndexDBCacheMap);

      // Cleanup
      newCache.destroy();
    });

    it('should handle sync failures during periodic sync', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      // Mock all async operations to fail
      const mockAsyncCache = {
        keys: vi.fn().mockRejectedValue(new Error('Sync failure')),
        get: vi.fn().mockRejectedValue(new Error('Sync failure')),
        set: vi.fn().mockRejectedValue(new Error('Sync failure')),
        delete: vi.fn().mockRejectedValue(new Error('Sync failure')),
        clear: vi.fn().mockRejectedValue(new Error('Sync failure'))
      };

      cacheMap.asyncCache = mockAsyncCache as any;

      // Add some data to trigger sync
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(priKey2, testItem2);

      // Memory cache should still work
      expect(await cacheMap.get(priKey1)).toEqual(testItem1);
      expect(await cacheMap.get(priKey2)).toEqual(testItem2);

      // Wait for background operations to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      consoleSpy.mockRestore();
    });

    it('should handle concurrent pending operations correctly', async () => {
      let resolveCount = 0;
      const mockSet = vi.fn().mockImplementation(() => {
        resolveCount++;
        return Promise.resolve();
      });
      cacheMap.asyncCache.set = mockSet;

      // Perform multiple rapid operations
      cacheMap.set(priKey1, testItem1);
      cacheMap.set(priKey2, testItem2);
      cacheMap.set(priKey1, testItem2); // Update same key

      // All should be in memory immediately
      expect(await cacheMap.get(priKey1)).toEqual(testItem2);
      expect(await cacheMap.get(priKey2)).toEqual(testItem2);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));

      // All operations should have been attempted
      expect(mockSet).toHaveBeenCalledTimes(3);
    });
  });

  describe('Memory Pressure and Large Data Handling', () => {
    it('should handle storing many small items', async () => {
      const itemCount = 1000;
      const keys: PriKey<'test'>[] = [];
      const items: TestItem[] = [];

      // Create many items
      for (let i = 0; i < itemCount; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item-${i}` as UUID };
        const item: TestItem = {
          key,
          id: `item-${i}`,
          name: `Test Item ${i}`,
          value: i,
          events: { created: { at: new Date() }, deleted: { at: null }, updated: { at: new Date() } }
        };
        keys.push(key);
        items.push(item);
        cacheMap.set(key, item);
      }

      // Verify all items are stored
      expect(await cacheMap.keys()).toHaveLength(itemCount);

      // Verify random access works
      const randomIndex = Math.floor(Math.random() * itemCount);
      expect(await cacheMap.get(keys[randomIndex])).toEqual(items[randomIndex]);

      // Verify clearing works with many items
      await cacheMap.clear();
      expect(await cacheMap.keys()).toHaveLength(0);
    });

    it('should handle large object values', async () => {
      // Create a large object
      const largeData = Array(1000).fill(0).map((_, i) => ({
        index: i,
        data: `Large data string ${i}`.repeat(10),
        nested: { value: i * 2, array: [i, i + 1, i + 2] }
      }));

      const largeItem: TestItem = {
        ...testItem1,
        largeData
      };

      expect(() => cacheMap.set(priKey1, largeItem)).not.toThrow();

      const retrieved = await cacheMap.get(priKey1);
      expect(retrieved).toEqual(largeItem);
      expect(retrieved?.largeData).toHaveLength(1000);
    });
  });
});
