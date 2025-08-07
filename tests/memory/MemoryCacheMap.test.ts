/* eslint-disable no-undefined */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';

describe('MemoryCacheMap', () => {
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

  const comKey2: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '4' as UUID,
    loc: [{ kt: 'container', lk: 'container2' as UUID }]
  };

  // Test items
  const testItems: TestItem[] = [
    { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem,
    { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem,
    { key: comKey1, id: '3', name: 'Item 3', value: 300 } as TestItem,
    { key: comKey2, id: '4', name: 'Item 4', value: 400 } as TestItem
  ];

  let cacheMap: MemoryCacheMap<TestItem, 'test', 'container'>;

  beforeEach(() => {
    cacheMap = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
  });

  describe('Constructor', () => {
    it('should create an empty cache map', () => {
      expect(cacheMap.keys()).toHaveLength(0);
      expect(cacheMap.values()).toHaveLength(0);
    });

    it('should accept key type arrays', () => {
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(MemoryCacheMap);
    });
  });

  describe('Basic Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('set() and get()', () => {
      it('should store and retrieve items by primary key', () => {
        const retrieved = cacheMap.get(priKey1);
        expect(retrieved).toEqual(testItems[0]);
      });

      it('should store and retrieve items by composite key', () => {
        const retrieved = cacheMap.get(comKey1);
        expect(retrieved).toEqual(testItems[2]);
      });

      it('should return null for non-existent keys', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const retrieved = cacheMap.get(nonExistentKey);
        expect(retrieved).toBeNull();
      });

      it('should overwrite existing items', () => {
        const updatedItem: TestItem = { key: priKey1, id: '1', name: 'Updated Item 1', value: 999 } as TestItem;
        cacheMap.set(priKey1, updatedItem);

        const retrieved = cacheMap.get(priKey1);
        expect(retrieved).toEqual(updatedItem);
      });
    });

    describe('includesKey()', () => {
      it('should return true for existing primary keys', () => {
        expect(cacheMap.includesKey(priKey1)).toBe(true);
      });

      it('should return true for existing composite keys', () => {
        expect(cacheMap.includesKey(comKey1)).toBe(true);
      });

      it('should return false for non-existent keys', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        expect(cacheMap.includesKey(nonExistentKey)).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should remove items by primary key', () => {
        expect(cacheMap.includesKey(priKey1)).toBe(true);
        cacheMap.delete(priKey1);
        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.get(priKey1)).toBeNull();
      });

      it('should remove items by composite key', () => {
        expect(cacheMap.includesKey(comKey1)).toBe(true);
        cacheMap.delete(comKey1);
        expect(cacheMap.includesKey(comKey1)).toBe(false);
        expect(cacheMap.get(comKey1)).toBeNull();
      });

      it('should not affect other items', () => {
        cacheMap.delete(priKey1);
        expect(cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(cacheMap.get(comKey1)).toEqual(testItems[2]);
        expect(cacheMap.get(comKey2)).toEqual(testItems[3]);
      });
    });

    describe('keys() and values()', () => {
      it('should return all keys', () => {
        const keys = cacheMap.keys();
        expect(keys).toHaveLength(4);
        expect(keys).toContain(priKey1);
        expect(keys).toContain(priKey2);
        expect(keys).toContain(comKey1);
        expect(keys).toContain(comKey2);
      });

      it('should return all values', () => {
        const values = cacheMap.values();
        expect(values).toHaveLength(4);
        expect(values).toContain(testItems[0]);
        expect(values).toContain(testItems[1]);
        expect(values).toContain(testItems[2]);
        expect(values).toContain(testItems[3]);
      });
    });

    describe('clear()', () => {
      it('should remove all items from the cache', () => {
        expect(cacheMap.keys()).toHaveLength(4);
        cacheMap.clear();
        expect(cacheMap.keys()).toHaveLength(0);
        expect(cacheMap.values()).toHaveLength(0);
      });

      it('should allow adding items after clearing', () => {
        cacheMap.clear();
        cacheMap.set(priKey1, testItems[0]);
        expect(cacheMap.get(priKey1)).toEqual(testItems[0]);
      });
    });
  });

  describe('Location-based Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('allIn()', () => {
      it('should return all items when location array is empty', () => {
        const items = cacheMap.allIn([]);
        expect(items).toHaveLength(4);
        expect(items).toEqual(expect.arrayContaining(testItems));
      });

      it('should return items in specific location', () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = cacheMap.allIn(location);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[2]);
      });

      it('should return multiple items in same location', () => {
        // Add another item in container1
        const extraComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '5' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const extraItem: TestItem = { key: extraComKey, id: '5', name: 'Item 5', value: 500 } as TestItem;
        cacheMap.set(extraComKey, extraItem);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = cacheMap.allIn(location);
        expect(items).toHaveLength(2);
        expect(items).toContain(testItems[2]);
        expect(items).toContain(extraItem);
      });

      it('should return empty array for non-existent location', () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'nonexistent' as UUID }];
        const items = cacheMap.allIn(location);
        expect(items).toHaveLength(0);
      });
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('contains()', () => {
      it('should return true when items match query in all locations', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 1').toQuery();
        const result = cacheMap.contains(query, []);
        expect(result).toBe(true);
      });

      it('should return false when no items match query', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent Item').toQuery();
        const result = cacheMap.contains(query, []);
        expect(result).toBe(false);
      });

      it('should return true when items match query in specific location', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 3').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const result = cacheMap.contains(query, location);
        expect(result).toBe(true);
      });

      it('should return false when items match query but not in specified location', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 1').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const result = cacheMap.contains(query, location);
        expect(result).toBe(false);
      });
    });

    describe('queryIn()', () => {
      it('should return matching items from all locations', () => {
        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const items = cacheMap.queryIn(query, []);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[0]);
      });

      it('should return matching items from specific location', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 3').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = cacheMap.queryIn(query, location);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[2]);
      });

      it('should return empty array when no items match', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent').toQuery();
        const items = cacheMap.queryIn(query, []);
        expect(items).toHaveLength(0);
      });

      it('should use empty array as default for locations parameter', () => {
        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const items = cacheMap.queryIn(query);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[0]);
      });
    });
  });

  describe('Key Normalization', () => {
    it('should handle string and number primary keys consistently', () => {
      const stringKey: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
      const numberKey: PriKey<'test'> = { kt: 'test', pk: 123 as any };

      const item1: TestItem = { key: stringKey, id: '1', name: 'String Key', value: 100 } as TestItem;
      const item2: TestItem = { key: numberKey, id: '2', name: 'Number Key', value: 200 } as TestItem;

      cacheMap.set(stringKey, item1);
      cacheMap.set(numberKey, item2);

      // Due to normalization, should only have 1 key (normalized behavior prevents duplicates)
      expect(cacheMap.keys()).toHaveLength(1);

      // Both keys should retrieve the most recently set item (item2)
      // since they normalize to the same internal key
      expect(cacheMap.get(numberKey)).toEqual(item2);

      // New key objects with same normalized values should also work
      expect(cacheMap.get({ kt: 'test', pk: '123' as UUID })).toEqual(item2);
      expect(cacheMap.get({ kt: 'test', pk: 123 as any })).toEqual(item2);
    });

    it('should handle string and number location keys consistently', () => {
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

      cacheMap.set(stringLocKey, item1);
      cacheMap.set(numberLocKey, item2);

      // Both should be in the same normalized location
      const location: LocKeyArray<'container'> = [{ kt: 'container', lk: '456' as UUID }];
      const items = cacheMap.allIn(location);
      expect(items).toHaveLength(2);
      expect(items).toContain(item1);
      expect(items).toContain(item2);
    });
  });

  describe('clone()', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    it('should create a new instance with copied data', () => {
      const cloned = cacheMap.clone();
      expect(cloned).toBeInstanceOf(MemoryCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should copy all items to the clone', () => {
      const cloned = cacheMap.clone();
      expect(cloned.keys()).toHaveLength(4);
      expect(cloned.values()).toEqual(expect.arrayContaining(testItems));
    });

    it('should not share state with original cache', () => {
      const cloned = cacheMap.clone();

      // Modify original
      const newItem: TestItem = { key: { kt: 'test', pk: 'new' as UUID }, id: 'new', name: 'New Item', value: 999 } as TestItem;
      cacheMap.set(newItem.key, newItem);

      // Clone should not be affected
      expect(cacheMap.keys()).toHaveLength(5);
      expect(cloned.keys()).toHaveLength(4);
      expect(cloned.get(newItem.key)).toBeNull();
    });

    it('should allow independent modifications', () => {
      const cloned = cacheMap.clone();

      // Modify clone
      cloned.delete(priKey1);

      // Original should not be affected
      expect(cacheMap.get(priKey1)).toEqual(testItems[0]);
      expect(cloned.get(priKey1)).toBeNull();
    });
  });

  describe('TTL Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('getWithTTL()', () => {
      it('should return item when within TTL', () => {
        const result = cacheMap.getWithTTL(priKey1, 60000); // 60 seconds
        expect(result).toEqual(testItems[0]);
      });

      it('should return null for non-existent key', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const result = cacheMap.getWithTTL(nonExistentKey, 60000);
        expect(result).toBeNull();
      });

      it('should return null when TTL is 0 (caching disabled)', () => {
        const result = cacheMap.getWithTTL(priKey1, 0);
        expect(result).toBeNull();
      });

      it('should return null when item has expired', () => {
        // Set an item fresh, then test with very short TTL after a delay
        const shortTTL = 1; // 1ms

        // Set the item fresh to ensure timing is controlled
        cacheMap.set(priKey1, testItems[0]);

        // First call should return the item
        const immediate = cacheMap.getWithTTL(priKey1, shortTTL);
        expect(immediate).toEqual(testItems[0]);

        // Wait a bit and try again - should be expired
        return new Promise(resolve => {
          setTimeout(() => {
            const expired = cacheMap.getWithTTL(priKey1, shortTTL);
            expect(expired).toBeNull();
            // Verify item was actually removed from cache
            expect(cacheMap.includesKey(priKey1)).toBe(false);
            resolve(undefined);
          }, 5);
        });
      });

      it('should work with composite keys', () => {
        const result = cacheMap.getWithTTL(comKey1, 60000);
        expect(result).toEqual(testItems[2]);
      });

      it('should handle different TTL values for same key', () => {
        // Short TTL should work
        const shortResult = cacheMap.getWithTTL(priKey1, 1000);
        expect(shortResult).toEqual(testItems[0]);

        // Long TTL should also work
        const longResult = cacheMap.getWithTTL(priKey1, 86400000); // 24 hours
        expect(longResult).toEqual(testItems[0]);
      });
    });

    it('should update timestamp when setting items', () => {
      const newItem: TestItem = { key: priKey1, id: '1', name: 'New Item', value: 999 } as TestItem;
      cacheMap.set(priKey1, newItem);

      // Item should be fresh
      const result = cacheMap.getWithTTL(priKey1, 1000);
      expect(result).toEqual(newItem);
    });
  });

  describe('Query Result Caching', () => {
    const queryHash1 = 'query_hash_1';
    const queryHash2 = 'query_hash_2';
    const itemKeys = [priKey1, priKey2];

    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('setQueryResult() and getQueryResult()', () => {
      it('should store and retrieve query results without TTL', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should store and retrieve query results with TTL', () => {
        const ttl = 60000; // 60 seconds
        cacheMap.setQueryResult(queryHash1, itemKeys, ttl);
        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should return null for non-existent query hash', () => {
        const result = cacheMap.getQueryResult('non_existent');
        expect(result).toBeNull();
      });

      it('should return independent copies of item keys', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        const result1 = cacheMap.getQueryResult(queryHash1);
        const result2 = cacheMap.getQueryResult(queryHash1);

        expect(result1).toEqual(itemKeys);
        expect(result2).toEqual(itemKeys);
        expect(result1).not.toBe(result2); // Different array instances
        expect(result1).not.toBe(itemKeys); // Not the original array
      });

      it('should handle empty item keys arrays', () => {
        const emptyKeys: any[] = [];
        cacheMap.setQueryResult(queryHash1, emptyKeys);
        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual([]);
        expect(result).not.toBe(emptyKeys);
      });

      it('should handle query result expiration', () => {
        const shortTTL = 1; // 1ms
        cacheMap.setQueryResult(queryHash1, itemKeys, shortTTL);

        // Should be available immediately
        const immediate = cacheMap.getQueryResult(queryHash1);
        expect(immediate).toEqual(itemKeys);

        // Should expire after delay
        return new Promise(resolve => {
          setTimeout(() => {
            const expired = cacheMap.getQueryResult(queryHash1);
            expect(expired).toBeNull();
            resolve(undefined);
          }, 5);
        });
      });

      it('should overwrite existing query results', () => {
        const newKeys = [comKey1, comKey2];

        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(cacheMap.getQueryResult(queryHash1)).toEqual(itemKeys);

        cacheMap.setQueryResult(queryHash1, newKeys);
        expect(cacheMap.getQueryResult(queryHash1)).toEqual(newKeys);
      });
    });

    describe('hasQueryResult()', () => {
      it('should return true for existing query results', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);
      });

      it('should return false for non-existent query results', () => {
        expect(cacheMap.hasQueryResult('non_existent')).toBe(false);
      });

      it('should return false for expired query results', () => {
        const shortTTL = 1; // 1ms
        cacheMap.setQueryResult(queryHash1, itemKeys, shortTTL);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);

        return new Promise(resolve => {
          setTimeout(() => {
            expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
            resolve(undefined);
          }, 5);
        });
      });

      it('should clean up expired entries when checked', () => {
        const shortTTL = 1;
        cacheMap.setQueryResult(queryHash1, itemKeys, shortTTL);

        return new Promise(resolve => {
          setTimeout(() => {
            // hasQueryResult should remove expired entry
            expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
            // Subsequent getQueryResult should also return null
            expect(cacheMap.getQueryResult(queryHash1)).toBeNull();
            resolve(undefined);
          }, 5);
        });
      });
    });

    describe('deleteQueryResult()', () => {
      it('should remove existing query results', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);

        cacheMap.deleteQueryResult(queryHash1);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(cacheMap.getQueryResult(queryHash1)).toBeNull();
      });

      it('should not affect other query results', () => {
        const otherKeys = [comKey1];

        cacheMap.setQueryResult(queryHash1, itemKeys);
        cacheMap.setQueryResult(queryHash2, otherKeys);

        cacheMap.deleteQueryResult(queryHash1);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);
        expect(cacheMap.getQueryResult(queryHash2)).toEqual(otherKeys);
      });

      it('should handle deletion of non-existent query results gracefully', () => {
        expect(() => cacheMap.deleteQueryResult('non_existent')).not.toThrow();
      });
    });

    describe('clearQueryResults()', () => {
      it('should remove all query results', () => {
        const otherKeys = [comKey1];

        cacheMap.setQueryResult(queryHash1, itemKeys);
        cacheMap.setQueryResult(queryHash2, otherKeys);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);

        cacheMap.clearQueryResults();

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(false);
      });

      it('should not affect item cache', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);

        expect(cacheMap.keys()).toHaveLength(4);
        cacheMap.clearQueryResults();
        expect(cacheMap.keys()).toHaveLength(4); // Items should remain
      });

      it('should allow adding new query results after clearing', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        cacheMap.clearQueryResults();

        cacheMap.setQueryResult(queryHash2, itemKeys);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);
      });
    });
  });

  describe('Invalidation Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('invalidateItemKeys()', () => {
      it('should remove specified item keys', () => {
        const keysToInvalidate = [priKey1, comKey1];

        expect(cacheMap.includesKey(priKey1)).toBe(true);
        expect(cacheMap.includesKey(comKey1)).toBe(true);
        expect(cacheMap.includesKey(priKey2)).toBe(true);
        expect(cacheMap.includesKey(comKey2)).toBe(true);

        cacheMap.invalidateItemKeys(keysToInvalidate);

        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.includesKey(comKey1)).toBe(false);
        expect(cacheMap.includesKey(priKey2)).toBe(true);
        expect(cacheMap.includesKey(comKey2)).toBe(true);
      });

      it('should handle empty keys array', () => {
        expect(cacheMap.keys()).toHaveLength(4);
        cacheMap.invalidateItemKeys([]);
        expect(cacheMap.keys()).toHaveLength(4);
      });

      it('should handle non-existent keys gracefully', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        expect(() => cacheMap.invalidateItemKeys([nonExistentKey])).not.toThrow();
        expect(cacheMap.keys()).toHaveLength(4);
      });

      it('should handle mixed existing and non-existent keys', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const keysToInvalidate = [priKey1, nonExistentKey, comKey1];

        cacheMap.invalidateItemKeys(keysToInvalidate);

        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.includesKey(comKey1)).toBe(false);
        expect(cacheMap.includesKey(priKey2)).toBe(true);
        expect(cacheMap.includesKey(comKey2)).toBe(true);
      });
    });

    describe('invalidateLocation()', () => {
      it('should invalidate all primary items when location is empty', () => {
        expect(cacheMap.includesKey(priKey1)).toBe(true);
        expect(cacheMap.includesKey(priKey2)).toBe(true);
        expect(cacheMap.includesKey(comKey1)).toBe(true);
        expect(cacheMap.includesKey(comKey2)).toBe(true);

        cacheMap.invalidateLocation([]);

        // Primary keys should be invalidated
        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.includesKey(priKey2)).toBe(false);
        // Composite keys should remain
        expect(cacheMap.includesKey(comKey1)).toBe(true);
        expect(cacheMap.includesKey(comKey2)).toBe(true);
      });

      it('should invalidate items in specific location', () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(cacheMap.includesKey(comKey1)).toBe(true);
        expect(cacheMap.includesKey(comKey2)).toBe(true);

        cacheMap.invalidateLocation(location);

        // Only items in container1 should be invalidated
        expect(cacheMap.includesKey(comKey1)).toBe(false);
        expect(cacheMap.includesKey(comKey2)).toBe(true);
        // Primary keys should remain
        expect(cacheMap.includesKey(priKey1)).toBe(true);
        expect(cacheMap.includesKey(priKey2)).toBe(true);
      });

      it('should clear all query results when invalidating location', () => {
        const queryHash = 'test_query';
        cacheMap.setQueryResult(queryHash, [priKey1, comKey1]);

        expect(cacheMap.hasQueryResult(queryHash)).toBe(true);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        cacheMap.invalidateLocation(location);

        expect(cacheMap.hasQueryResult(queryHash)).toBe(false);
      });

      it('should handle non-existent locations gracefully', () => {
        const nonExistentLocation: LocKeyArray<'container'> = [{ kt: 'container', lk: 'nonexistent' as UUID }];

        expect(() => cacheMap.invalidateLocation(nonExistentLocation)).not.toThrow();
        expect(cacheMap.keys()).toHaveLength(4); // All items should remain
      });

      it('should invalidate multiple items in same location', () => {
        // Add another item to container1
        const extraComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '5' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const extraItem: TestItem = { key: extraComKey, id: '5', name: 'Item 5', value: 500 } as TestItem;
        cacheMap.set(extraComKey, extraItem);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(cacheMap.includesKey(comKey1)).toBe(true);
        expect(cacheMap.includesKey(extraComKey)).toBe(true);

        cacheMap.invalidateLocation(location);

        expect(cacheMap.includesKey(comKey1)).toBe(false);
        expect(cacheMap.includesKey(extraComKey)).toBe(false);
        expect(cacheMap.includesKey(comKey2)).toBe(true); // Different location
      });
    });
  });

  describe('Constructor with Initial Data', () => {
    it('should initialize with provided data', () => {
      const initialData = {
        [JSON.stringify(priKey1)]: testItems[0],
        [JSON.stringify(comKey1)]: testItems[2]
      };

      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], initialData);

      expect(cache.get(priKey1)).toEqual(testItems[0]);
      expect(cache.get(comKey1)).toEqual(testItems[2]);
      expect(cache.keys()).toHaveLength(2);
    });

    it('should handle empty initial data', () => {
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], {});
      expect(cache.keys()).toHaveLength(0);
    });

    it('should handle invalid JSON keys in initial data gracefully', () => {
      const initialData = {
        'invalid-json': testItems[0],
        [JSON.stringify(priKey1)]: testItems[0]
      };

      // Should not throw and should only include valid entries
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], initialData);
      expect(cache.keys()).toHaveLength(1);
      expect(cache.get(priKey1)).toEqual(testItems[0]);
    });

    it('should handle undefined initial data', () => {
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], undefined);
      expect(cache.keys()).toHaveLength(0);
    });
  });

  describe('clone() with Query Results', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    it('should copy query result cache to clone', () => {
      const queryHash = 'test_query';
      const itemKeys = [priKey1, priKey2];

      cacheMap.setQueryResult(queryHash, itemKeys);
      const cloned = cacheMap.clone();

      expect(cloned.hasQueryResult(queryHash)).toBe(true);
      expect(cloned.getQueryResult(queryHash)).toEqual(itemKeys);
    });

    it('should not share query result cache with original', () => {
      const queryHash1 = 'query1';
      const queryHash2 = 'query2';
      const itemKeys = [priKey1, priKey2];

      cacheMap.setQueryResult(queryHash1, itemKeys);
      const cloned = cacheMap.clone();

      // Modify original
      cacheMap.setQueryResult(queryHash2, [comKey1]);
      cacheMap.deleteQueryResult(queryHash1);

      // Clone should not be affected
      expect(cloned.hasQueryResult(queryHash1)).toBe(true);
      expect(cloned.hasQueryResult(queryHash2)).toBe(false);

      // Original should be modified
      expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
      expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);
    });

    it('should copy query results with TTL correctly', () => {
      const queryHash = 'ttl_query';
      const itemKeys = [priKey1];
      const ttl = 60000; // 60 seconds

      cacheMap.setQueryResult(queryHash, itemKeys, ttl);
      const cloned = cacheMap.clone();

      expect(cloned.hasQueryResult(queryHash)).toBe(true);
      expect(cloned.getQueryResult(queryHash)).toEqual(itemKeys);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string keys', () => {
      const emptyKey: PriKey<'test'> = { kt: 'test', pk: '' as UUID };
      const item: TestItem = { key: emptyKey, id: 'empty', name: 'Empty Key', value: 0 } as TestItem;

      cacheMap.set(emptyKey, item);
      expect(cacheMap.get(emptyKey)).toEqual(item);
      expect(cacheMap.includesKey(emptyKey)).toBe(true);
    });

    it('should handle complex objects as item values', () => {
      const complexItem: TestItem & { nested: { data: string[] } } = {
        key: priKey1,
        id: '1',
        name: 'Complex Item',
        value: 100,
        nested: { data: ['a', 'b', 'c'] }
      } as TestItem & { nested: { data: string[] } };

      // @ts-ignore
      cacheMap.set(priKey1, complexItem as any);
      const retrieved = cacheMap.get(priKey1);
      expect(retrieved).toEqual(complexItem);
    });

    it('should handle null and undefined values gracefully', () => {
      const nullItem = null as any;
      const undefinedItem = undefined as any;

      cacheMap.set(priKey1, nullItem);
      cacheMap.set(priKey2, undefinedItem);

      expect(cacheMap.get(priKey1)).toBeNull();
      expect(cacheMap.get(priKey2)).toBeUndefined();
      expect(cacheMap.includesKey(priKey1)).toBe(true);
      expect(cacheMap.includesKey(priKey2)).toBe(true);
    });

    it('should handle very large numbers of items', () => {
      const itemCount = 10000;
      const startTime = performance.now();

      // Add many items
      for (let i = 0; i < itemCount; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: i.toString() as UUID };
        const item: TestItem = { key, id: i.toString(), name: `Item ${i}`, value: i } as TestItem;
        cacheMap.set(key, item);
      }

      const setTime = performance.now() - startTime;
      expect(cacheMap.keys()).toHaveLength(itemCount);

      // Test retrieval performance
      const retrievalStart = performance.now();
      for (let i = 0; i < 100; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: (i * 100).toString() as UUID };
        const retrieved = cacheMap.get(key);
        expect(retrieved?.value).toBe(i * 100);
      }
      const retrievalTime = performance.now() - retrievalStart;

      // Performance should be reasonable (these are generous thresholds)
      expect(setTime).toBeLessThan(10000); // 10 seconds for 10k items (increased for CI)
      expect(retrievalTime).toBeLessThan(500); // 500ms for 100 retrievals (increased for CI)
    });

    it('should handle special characters in keys', () => {
      const specialKeys = [
        { kt: 'test', pk: 'key with spaces' as UUID },
        { kt: 'test', pk: 'key-with-dashes' as UUID },
        { kt: 'test', pk: 'key_with_underscores' as UUID },
        { kt: 'test', pk: 'key.with.dots' as UUID },
        { kt: 'test', pk: 'key/with/slashes' as UUID },
        { kt: 'test', pk: 'key"with"quotes' as UUID },
        { kt: 'test', pk: 'key\'with\'apostrophes' as UUID },
        { kt: 'test', pk: 'key\\with\\backslashes' as UUID }
      ] as PriKey<'test'>[];

      specialKeys.forEach((key, index) => {
        const item: TestItem = { key, id: index.toString(), name: `Special ${index}`, value: index } as TestItem;
        cacheMap.set(key, item);
        expect(cacheMap.get(key)).toEqual(item);
        expect(cacheMap.includesKey(key)).toBe(true);
      });

      expect(cacheMap.keys()).toHaveLength(specialKeys.length);
    });

    it('should handle Unicode characters in keys', () => {
      const unicodeKeys = [
        { kt: 'test', pk: 'café' as UUID },
        { kt: 'test', pk: '日本語' as UUID },
        { kt: 'test', pk: '🔑🌟' as UUID },
        { kt: 'test', pk: 'ñoño' as UUID },
        { kt: 'test', pk: 'αβγ' as UUID }
      ] as PriKey<'test'>[];

      unicodeKeys.forEach((key, index) => {
        const item: TestItem = { key, id: index.toString(), name: `Unicode ${index}`, value: index } as TestItem;
        cacheMap.set(key, item);
        expect(cacheMap.get(key)).toEqual(item);
        expect(cacheMap.includesKey(key)).toBe(true);
      });

      expect(cacheMap.keys()).toHaveLength(unicodeKeys.length);
    });

    it('should handle very long key values', () => {
      const longPk = 'a'.repeat(10000);
      const longKey: PriKey<'test'> = { kt: 'test', pk: longPk as UUID };
      const item: TestItem = { key: longKey, id: '1', name: 'Long Key Item', value: 1 } as TestItem;

      cacheMap.set(longKey, item);
      expect(cacheMap.get(longKey)).toEqual(item);
      expect(cacheMap.includesKey(longKey)).toBe(true);
    });

    it('should handle rapid operations without conflicts', () => {
      const operations = 1000;
      const keys: PriKey<'test'>[] = [];

      // Rapid set operations
      for (let i = 0; i < operations; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `rapid_${i}` as UUID };
        const item: TestItem = { key, id: i.toString(), name: `Rapid ${i}`, value: i } as TestItem;
        keys.push(key);
        cacheMap.set(key, item);
      }

      expect(cacheMap.keys()).toHaveLength(operations);

      // Rapid get operations
      keys.forEach((key, index) => {
        const retrieved = cacheMap.get(key);
        expect(retrieved?.value).toBe(index);
      });

      // Rapid delete operations
      for (let i = 0; i < operations / 2; i++) {
        cacheMap.delete(keys[i]);
      }

      expect(cacheMap.keys()).toHaveLength(operations / 2);
    });
  });
});
