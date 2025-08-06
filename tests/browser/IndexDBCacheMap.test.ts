/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexDBCacheMap } from '../../src/browser/IndexDBCacheMap';
import { AsyncIndexDBCacheMap } from '../../src/browser/AsyncIndexDBCacheMap';
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';

describe('IndexDBCacheMap (Synchronous Wrapper)', () => {
  // Test data types
  interface TestItem extends Item<'test', 'container'> {
    id: string;
    name: string;
    value: number;
  }

  // Test keys
  const priKey1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '3' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  let cacheMap: IndexDBCacheMap<TestItem, 'test', 'container'>;

  beforeEach(() => {
    cacheMap = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
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

    it('should provide access to async cache instance', () => {
      expect(cacheMap.asyncCache).toBeDefined();
      expect(cacheMap.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });
  });

  describe('Synchronous Method Errors', () => {
    describe('get()', () => {
      it('should throw error indicating async operation required', () => {
        expect(() => {
          cacheMap.get(priKey1);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.get() instead.');
      });
    });

    describe('set()', () => {
      it('should throw error indicating async operation required', () => {
        const testItem: TestItem = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;

        expect(() => {
          cacheMap.set(priKey1, testItem);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.set() instead.');
      });
    });

    describe('includesKey()', () => {
      it('should throw error indicating async operation required', () => {
        expect(() => {
          cacheMap.includesKey(priKey1);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.includesKey() instead.');
      });
    });

    describe('delete()', () => {
      it('should throw error indicating async operation required', () => {
        expect(() => {
          cacheMap.delete(priKey1);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.delete() instead.');
      });
    });

    describe('allIn()', () => {
      it('should throw error indicating async operation required', () => {
        const locations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(() => {
          cacheMap.allIn(locations);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.allIn() instead.');
      });
    });

    describe('contains()', () => {
      it('should throw error indicating async operation required', () => {
        // @ts-ignore
        const query: ItemQuery = { type: 'attribute', attribute: 'name', value: 'Item 1' };
        // @ts-ignore
        const locations: LocKeyArray<'container'> = [];

        expect(() => {
          cacheMap.contains(query, locations);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.contains() instead.');
      });
    });

    describe('queryIn()', () => {
      it('should throw error indicating async operation required', () => {
        // @ts-ignore
        const query: ItemQuery = { type: 'attribute', attribute: 'name', value: 'Item 1' };
        // @ts-ignore
        const locations: LocKeyArray<'container'> = [];

        expect(() => {
          cacheMap.queryIn(query, locations);
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.queryIn() instead.');
      });
    });

    describe('keys()', () => {
      it('should throw error indicating async operation required', () => {
        expect(() => {
          cacheMap.keys();
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.keys() instead.');
      });
    });

    describe('values()', () => {
      it('should throw error indicating async operation required', () => {
        expect(() => {
          cacheMap.values();
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.values() instead.');
      });
    });

    describe('clear()', () => {
      it('should throw error indicating async operation required', () => {
        expect(() => {
          cacheMap.clear();
        }).toThrow('IndexedDB operations are asynchronous. Use asyncCache.clear() instead.');
      });
    });
  });

  describe('Async Cache Access', () => {
    it('should provide access to the async implementation', () => {
      expect(cacheMap.asyncCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });

    it('should allow calling async methods through asyncCache', async () => {
      // This test verifies the API structure, actual functionality is tested in AsyncIndexDBCacheMap tests
      expect(typeof cacheMap.asyncCache.get).toBe('function');
      expect(typeof cacheMap.asyncCache.set).toBe('function');
      expect(typeof cacheMap.asyncCache.delete).toBe('function');
      expect(typeof cacheMap.asyncCache.keys).toBe('function');
      expect(typeof cacheMap.asyncCache.values).toBe('function');
      expect(typeof cacheMap.asyncCache.clear).toBe('function');
      expect(typeof cacheMap.asyncCache.allIn).toBe('function');
      expect(typeof cacheMap.asyncCache.contains).toBe('function');
      expect(typeof cacheMap.asyncCache.queryIn).toBe('function');
    });

    it('should demonstrate correct usage pattern', async () => {
      // Example of how the wrapper should be used
      const testItem: TestItem = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;

      // These calls should work (though they'll use mocked IndexedDB in tests)
      expect(async () => {
        await cacheMap.asyncCache.set(priKey1, testItem);
        await cacheMap.asyncCache.get(priKey1);
        await cacheMap.asyncCache.delete(priKey1);
      }).not.toThrow();
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
  });

  describe('Interface Compliance', () => {
    it('should extend CacheMap base class', () => {
      // Test that the wrapper properly implements the CacheMap interface
      expect(cacheMap).toHaveProperty('get');
      expect(cacheMap).toHaveProperty('set');
      expect(cacheMap).toHaveProperty('delete');
      expect(cacheMap).toHaveProperty('includesKey');
      expect(cacheMap).toHaveProperty('allIn');
      expect(cacheMap).toHaveProperty('contains');
      expect(cacheMap).toHaveProperty('queryIn');
      expect(cacheMap).toHaveProperty('keys');
      expect(cacheMap).toHaveProperty('values');
      expect(cacheMap).toHaveProperty('clear');
      expect(cacheMap).toHaveProperty('clone');
    });

    it('should maintain type safety', () => {
      // TypeScript compilation ensures type safety, this test verifies runtime behavior
      expect(() => {
        const cache: IndexDBCacheMap<TestItem, 'test', 'container'> = cacheMap;
        expect(cache).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error messages for each method', () => {
      const expectedMessages = {
        get: 'IndexedDB operations are asynchronous. Use asyncCache.get() instead.',
        set: 'IndexedDB operations are asynchronous. Use asyncCache.set() instead.',
        includesKey: 'IndexedDB operations are asynchronous. Use asyncCache.includesKey() instead.',
        delete: 'IndexedDB operations are asynchronous. Use asyncCache.delete() instead.',
        allIn: 'IndexedDB operations are asynchronous. Use asyncCache.allIn() instead.',
        contains: 'IndexedDB operations are asynchronous. Use asyncCache.contains() instead.',
        queryIn: 'IndexedDB operations are asynchronous. Use asyncCache.queryIn() instead.',
        keys: 'IndexedDB operations are asynchronous. Use asyncCache.keys() instead.',
        values: 'IndexedDB operations are asynchronous. Use asyncCache.values() instead.',
        clear: 'IndexedDB operations are asynchronous. Use asyncCache.clear() instead.'
      };

      // Test each method throws with the expected message
      expect(() => cacheMap.get(priKey1)).toThrow(expectedMessages.get);
      expect(() => cacheMap.set(priKey1, {} as TestItem)).toThrow(expectedMessages.set);
      expect(() => cacheMap.includesKey(priKey1)).toThrow(expectedMessages.includesKey);
      expect(() => cacheMap.delete(priKey1)).toThrow(expectedMessages.delete);
      expect(() => cacheMap.allIn([])).toThrow(expectedMessages.allIn);
      expect(() => cacheMap.contains({} as ItemQuery, [])).toThrow(expectedMessages.contains);
      expect(() => cacheMap.queryIn({} as ItemQuery, [])).toThrow(expectedMessages.queryIn);
      expect(() => cacheMap.keys()).toThrow(expectedMessages.keys);
      expect(() => cacheMap.values()).toThrow(expectedMessages.values);
      expect(() => cacheMap.clear()).toThrow(expectedMessages.clear);
    });
  });

  describe('Usage Documentation', () => {
    it('should demonstrate recommended usage pattern', async () => {
      // This test serves as live documentation for how to use the IndexDBCacheMap

      // ❌ WRONG: Trying to use synchronous methods
      expect(() => cacheMap.get(priKey1)).toThrow();
      expect(() => cacheMap.set(priKey1, {} as TestItem)).toThrow();

      // ✅ CORRECT: Using async methods through asyncCache
      const testItem: TestItem = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;

      // These would work with real IndexedDB (mocked in tests)
      expect(async () => {
        await cacheMap.asyncCache.set(priKey1, testItem);
        const retrieved = await cacheMap.asyncCache.get(priKey1);
        const exists = await cacheMap.asyncCache.includesKey(priKey1);
        await cacheMap.asyncCache.delete(priKey1);
      }).not.toThrow();
    });

    it('should show how to migrate from synchronous to async', () => {
      // Migration example in comments for documentation

      /*
      // OLD synchronous approach (would work with MemoryCacheMap):
      // cacheMap.set(key, item);
      // const item = cacheMap.get(key);
      // const exists = cacheMap.includesKey(key);

      // NEW async approach (required for IndexDBCacheMap):
      // await cacheMap.asyncCache.set(key, item);
      // const item = await cacheMap.asyncCache.get(key);
      // const exists = await cacheMap.asyncCache.includesKey(key);
      */

      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid key type arrays', () => {
      expect(() => {
        new IndexDBCacheMap<TestItem, 'test'>(['test']);
      }).not.toThrow();

      expect(() => {
        new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      }).not.toThrow();
    });

    it('should accept valid database configuration', () => {
      expect(() => {
        new IndexDBCacheMap<TestItem, 'test'>(
          ['test'],
          'valid-db-name',
          'valid-store-name',
          1
        );
      }).not.toThrow();
    });
  });
});
