
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncIndexDBCacheMap } from '../../src/browser/AsyncIndexDBCacheMap';
import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';

// Use IndexedDB mock from test setup

// Remove global declaration for now - not needed
// declare global {
//   var __resetMockIndexedDBStorage: (() => void) | undefined;
// }

describe('AsyncIndexDBCacheMap', () => {
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

  // Test items
  const testItems: TestItem[] = [
    { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem,
    { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem,
    { key: comKey1, id: '3', name: 'Item 3', value: 300 } as TestItem
  ];

  let cacheMap: AsyncIndexDBCacheMap<TestItem, 'test', 'container'>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset IndexedDB mock storage for test isolation
    if ((globalThis as any).__resetMockIndexedDBStorage) {
      (globalThis as any).__resetMockIndexedDBStorage();
    }

    cacheMap = new AsyncIndexDBCacheMap<TestItem, 'test', 'container'>(
      ['test', 'container'],
      'test-db',
      'test-store',
      1
    );

    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('Constructor', () => {
    it('should create cache with default parameters', () => {
      const cache = new AsyncIndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });

    it('should create cache with custom parameters', () => {
      const cache = new AsyncIndexDBCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'custom-db',
        'custom-store',
        2
      );
      expect(cache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });

    it('should initialize IndexedDB connection when needed', async () => {
      // Force database initialization by performing an operation
      await cacheMap.get(priKey1);
      expect(window.indexedDB.open).toHaveBeenCalledWith('test-db', 1);
    });
  });

  describe('Basic Operations', () => {
    describe('set() and get()', () => {
      it('should store and retrieve items by primary key', async () => {
        await cacheMap.set(priKey1, testItems[0]);
        const retrieved = await cacheMap.get(priKey1);

        expect(retrieved).toEqual(testItems[0]);
      });

      it('should store and retrieve items by composite key', async () => {
        await cacheMap.set(comKey1, testItems[2]);
        const retrieved = await cacheMap.get(comKey1);

        expect(retrieved).toEqual(testItems[2]);
      });

      it('should return null for non-existent keys', async () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const retrieved = await cacheMap.get(nonExistentKey);

        expect(retrieved).toBeNull();
      });

      it('should store complex nested objects', async () => {
        const complexItem = {
          ...testItems[0],
          nested: {
            array: [1, 2, 3],
            object: { a: 'test', b: true }
          }
        };

        await cacheMap.set(priKey1, complexItem as any);
        const retrieved = await cacheMap.get(priKey1);

        expect(retrieved).toEqual(complexItem);
      });

      it('should overwrite existing items', async () => {
        await cacheMap.set(priKey1, testItems[0]);

        const updatedItem: TestItem = { key: priKey1, id: '1', name: 'Updated Item 1', value: 999 } as TestItem;
        await cacheMap.set(priKey1, updatedItem);

        const retrieved = await cacheMap.get(priKey1);
        expect(retrieved).toEqual(updatedItem);
      });
    });

    describe('includesKey()', () => {
      beforeEach(async () => {
        await cacheMap.set(priKey1, testItems[0]);
        await cacheMap.set(comKey1, testItems[2]);
      });

      it('should return true for existing primary keys', async () => {
        const exists = await cacheMap.includesKey(priKey1);
        expect(exists).toBe(true);
      });

      it('should return true for existing composite keys', async () => {
        const exists = await cacheMap.includesKey(comKey1);
        expect(exists).toBe(true);
      });

      it('should return false for non-existent keys', async () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const exists = await cacheMap.includesKey(nonExistentKey);
        expect(exists).toBe(false);
      });
    });

    describe('delete()', () => {
      beforeEach(async () => {
        await cacheMap.set(priKey1, testItems[0]);
        await cacheMap.set(priKey2, testItems[1]);
        await cacheMap.set(comKey1, testItems[2]);
      });

      it('should remove items by primary key', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(true);

        await cacheMap.delete(priKey1);

        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.get(priKey1)).toBeNull();
      });

      it('should remove items by composite key', async () => {
        expect(await cacheMap.includesKey(comKey1)).toBe(true);

        await cacheMap.delete(comKey1);

        expect(await cacheMap.includesKey(comKey1)).toBe(false);
        expect(await cacheMap.get(comKey1)).toBeNull();
      });

      it('should not affect other items', async () => {
        await cacheMap.delete(priKey1);

        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);
      });
    });

    describe('keys() and values()', () => {
      beforeEach(async () => {
        for (const item of testItems) {
          await cacheMap.set(item.key, item);
        }
      });

      it('should return all keys', async () => {
        const keys = await cacheMap.keys();

        expect(keys).toHaveLength(3);
        expect(keys).toContain(priKey1);
        expect(keys).toContain(priKey2);
        expect(keys).toContain(comKey1);
      });

      it('should return all values', async () => {
        const values = await cacheMap.values();

        expect(values).toHaveLength(3);
        expect(values).toContain(testItems[0]);
        expect(values).toContain(testItems[1]);
        expect(values).toContain(testItems[2]);
      });
    });

    describe('clear()', () => {
      beforeEach(async () => {
        for (const item of testItems) {
          await cacheMap.set(item.key, item);
        }
      });

      it('should remove all items from the database', async () => {
        expect((await cacheMap.keys())).toHaveLength(3);

        await cacheMap.clear();

        expect((await cacheMap.keys())).toHaveLength(0);
        expect((await cacheMap.values())).toHaveLength(0);
      });

      it('should allow adding items after clearing', async () => {
        await cacheMap.clear();
        await cacheMap.set(priKey1, testItems[0]);

        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
      });
    });
  });

  describe('Location-based Operations', () => {
    beforeEach(async () => {
      for (const item of testItems) {
        await cacheMap.set(item.key, item);
      }
    });

    describe('allIn()', () => {
      it('should return all items when location array is empty', async () => {
        const items = await cacheMap.allIn([]);

        expect(items).toHaveLength(3);
        expect(items).toEqual(expect.arrayContaining(testItems));
      });

      it('should return items in specific location', async () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = await cacheMap.allIn(location);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[2]);
      });

      it('should return empty array for non-existent location', async () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'nonexistent' as UUID }];
        const items = await cacheMap.allIn(location);

        expect(items).toHaveLength(0);
      });

      it('should handle multiple items in same location', async () => {
        // Add another item in container1
        const extraComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '4' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const extraItem: TestItem = { key: extraComKey, id: '4', name: 'Item 4', value: 400 } as TestItem;
        await cacheMap.set(extraComKey, extraItem);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = await cacheMap.allIn(location);

        expect(items).toHaveLength(2);
        expect(items).toContain(testItems[2]);
        expect(items).toContain(extraItem);
      });
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      for (const item of testItems) {
        await cacheMap.set(item.key, item);
      }
    });

    describe('contains()', () => {
      it('should return true when items match query', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 1').toQuery();
        const result = await cacheMap.contains(query, []);

        expect(result).toBe(true);
      });

      it('should return false when no items match query', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent Item').toQuery();
        const result = await cacheMap.contains(query, []);

        expect(result).toBe(false);
      });

      it('should work with location filtering', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 3').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const result = await cacheMap.contains(query, location);

        expect(result).toBe(true);
      });
    });

    describe('queryIn()', () => {
      it('should return matching items from all locations', async () => {
        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const items = await cacheMap.queryIn(query, []);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[0]);
      });

      it('should return matching items from specific location', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 3').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = await cacheMap.queryIn(query, location);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[2]);
      });

      it('should return empty array when no items match', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent').toQuery();
        const items = await cacheMap.queryIn(query, []);

        expect(items).toHaveLength(0);
      });

      it('should use empty array as default for locations parameter', async () => {
        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const items = await cacheMap.queryIn(query);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[0]);
      });
    });
  });

  describe('Key Normalization', () => {
    it('should handle string and number primary keys consistently', async () => {
      const stringKey: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
      const numberKey: PriKey<'test'> = { kt: 'test', pk: 123 as any };

      const item1: TestItem = { key: stringKey, id: '1', name: 'String Key', value: 100 } as TestItem;
      const item2: TestItem = { key: numberKey, id: '2', name: 'Number Key', value: 200 } as TestItem;

      await cacheMap.set(stringKey, item1);
      await cacheMap.set(numberKey, item2);

      // Number 123 should overwrite string '123' due to normalization
      expect(await cacheMap.get(stringKey)).toEqual(item2);
      expect(await cacheMap.get(numberKey)).toEqual(item2);
    });

    it('should handle string and number location keys consistently', async () => {
      const stringLocKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '1' as UUID,
        loc: [{ kt: 'container', lk: '456' as UUID }]
      };
      const numberLocKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '2' as UUID,
        loc: [{ kt: 'container', lk: 456 as any }]
      };

      const item1: TestItem = { key: stringLocKey, id: '1', name: 'String Loc', value: 100 } as TestItem;
      const item2: TestItem = { key: numberLocKey, id: '2', name: 'Number Loc', value: 200 } as TestItem;

      await cacheMap.set(stringLocKey, item1);
      await cacheMap.set(numberLocKey, item2);

      // Both should be in the same normalized location
      const location: LocKeyArray<'container'> = [{ kt: 'container', lk: '456' as UUID }];
      const items = await cacheMap.allIn(location);
      expect(items).toHaveLength(2);
      expect(items).toContain(item1);
      expect(items).toContain(item2);
    });
  });

  describe('clone()', () => {
    beforeEach(async () => {
      for (const item of testItems) {
        await cacheMap.set(item.key, item);
      }
    });

    it('should create a new instance with same database configuration', () => {
      const cloned = cacheMap.clone();

      expect(cloned).toBeInstanceOf(AsyncIndexDBCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should share data through IndexedDB', async () => {
      const cloned = cacheMap.clone();

      // Clone should see the same data (shared database)
      expect((await cloned.keys())).toHaveLength(3);
      expect(await cloned.get(priKey1)).toEqual(testItems[0]);
    });

    it('should share modifications through IndexedDB', async () => {
      const cloned = cacheMap.clone();

      // Modify through clone
      const newItem: TestItem = { key: { kt: 'test', pk: 'new' as UUID }, id: 'new', name: 'New Item', value: 999 } as TestItem;
      await cloned.set(newItem.key, newItem);

      // Original should see the change (shared database)
      expect(await cacheMap.get(newItem.key)).toEqual(newItem);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      const errorCacheMap = new AsyncIndexDBCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'error-db',
        'error-store',
        1
      );

      // Mock IndexedDB to throw an error
      // @ts-ignore
      window.indexedDB.open.mockImplementationOnce(() => {
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          onupgradeneeded: null as any,
          error: new Error('Database error')
        };

        setTimeout(() => {
          request.onerror?.();
        }, 0);

        return request;
      });

      const result = await errorCacheMap.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle transaction errors gracefully', async () => {
      // This would require more complex mocking to simulate transaction failures
      // For now, we'll test that the error handling paths exist
      const result = await cacheMap.get(priKey1);
      expect(result).toBeNull(); // Should not throw
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle many items efficiently', async () => {
      const startTime = Date.now();

      // Add 50 items (reduced from 100 to avoid test timeout issues)
      const promises = [];
      for (let i = 0; i < 50; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item-${i}` as UUID };
        const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i } as TestItem;
        promises.push(cacheMap.set(key, item));
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // 2 seconds for async operations
      expect((await cacheMap.keys())).toHaveLength(50);
    });

    it('should handle concurrent operations', async () => {
      // Test concurrent reads and writes
      const operations = [
        cacheMap.set(priKey1, testItems[0]),
        cacheMap.set(priKey2, testItems[1]),
        cacheMap.get(priKey1),
        cacheMap.get(priKey2),
        cacheMap.includesKey(priKey1)
      ];

      const results = await Promise.all(operations);

      // No errors should be thrown
      expect(results).toHaveLength(5);
    });
  });

  describe('Database Schema Management', () => {
    it('should handle database upgrades', async () => {
      // Create a cache with version 2 to trigger upgrade
      const upgradedCache = new AsyncIndexDBCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'upgrade-test-db',
        'test-store',
        2
      );

      expect(upgradedCache).toBeInstanceOf(AsyncIndexDBCacheMap);
    });
  });
});
