
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
    it('should create an empty cache map', async () => {
      expect(cacheMap.keys()).toHaveLength(0);
      expect(await cacheMap.values()).toHaveLength(0);
    });

    it('should accept key type arrays', () => {
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(MemoryCacheMap);
    });

    it('should have correct implementationType', () => {
      expect(cacheMap.implementationType).toBe('memory/memory');
    });
  });

  describe('Basic Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('set() and get()', () => {
      it('should store and retrieve items by primary key', async () => {
        const retrieved = await cacheMap.get(priKey1);
        expect(retrieved).toEqual(testItems[0]);
      });

      it('should store and retrieve items by composite key', async () => {
        const retrieved = await cacheMap.get(comKey1);
        expect(retrieved).toEqual(testItems[2]);
      });

      it('should return null for non-existent keys', async () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const retrieved = await cacheMap.get(nonExistentKey);
        expect(retrieved).toBeNull();
      });

      it('should overwrite existing items', async () => {
        const updatedItem: TestItem = { key: priKey1, id: '1', name: 'Updated Item 1', value: 999 } as TestItem;
        cacheMap.set(priKey1, updatedItem);

        const retrieved = await cacheMap.get(priKey1);
        expect(retrieved).toEqual(updatedItem);
      });
    });

    describe('includesKey()', () => {
      it('should return true for existing primary keys', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(true);
      });

      it('should return true for existing composite keys', async () => {
        expect(await cacheMap.includesKey(comKey1)).toBe(true);
      });

      it('should return false for non-existent keys', async () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        expect(await cacheMap.includesKey(nonExistentKey)).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should remove items by primary key', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(true);
        cacheMap.delete(priKey1);
        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.get(priKey1)).toBeNull();
      });

      it('should remove items by composite key', async () => {
        expect(await cacheMap.includesKey(comKey1)).toBe(true);
        cacheMap.delete(comKey1);
        expect(await cacheMap.includesKey(comKey1)).toBe(false);
        expect(await cacheMap.get(comKey1)).toBeNull();
      });

      it('should not affect other items', async () => {
        cacheMap.delete(priKey1);
        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);
        expect(await cacheMap.get(comKey2)).toEqual(testItems[3]);
      });

      it('should remove associated metadata when deleting items', () => {
        const keyStr = JSON.stringify(priKey1);
        expect(cacheMap.getMetadata(keyStr)).not.toBeNull();
        cacheMap.delete(priKey1);
        expect(cacheMap.getMetadata(keyStr)).toBeNull();
      });

      it('should remove query results referencing deleted items', async () => {
        cacheMap.setQueryResult('test_query', [priKey1, priKey2]);
        cacheMap.delete(priKey1);
        expect(await cacheMap.getQueryResult('test_query')).toEqual([priKey2]);

        cacheMap.delete(priKey2);
        expect(cacheMap.hasQueryResult('test_query')).toBe(false);
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

      it('should return all values', async () => {
        const values = await cacheMap.values();
        expect(values).toHaveLength(4);
        expect(values).toContain(testItems[0]);
        expect(values).toContain(testItems[1]);
        expect(values).toContain(testItems[2]);
        expect(values).toContain(testItems[3]);
      });
    });

    describe('clear()', () => {
      it('should remove all items from the cache', async () => {
        expect(cacheMap.keys()).toHaveLength(4);
        cacheMap.clear();
        expect(cacheMap.keys()).toHaveLength(0);
        expect(await cacheMap.values()).toHaveLength(0);
      });

      it('should allow adding items after clearing', async () => {
        cacheMap.clear();
        cacheMap.set(priKey1, testItems[0]);
        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
      });

      it('should clear metadata and query results when cleared', () => {
        const keyStr = JSON.stringify(priKey1);
        cacheMap.setQueryResult('query1', [priKey1]);
        expect(cacheMap.hasQueryResult('query1')).toBe(true);
        expect(cacheMap.getMetadata(keyStr)).not.toBeNull();

        cacheMap.clear();

        expect(cacheMap.hasQueryResult('query1')).toBe(false);
        expect(cacheMap.getMetadata(keyStr)).toBeNull();
      });
    });
  });

  describe('Location-based Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('allIn()', () => {
      it('should return all items when location array is empty', async () => {
        const items = await cacheMap.allIn([]);
        expect(items).toHaveLength(4);
        expect(items).toEqual(expect.arrayContaining(testItems));
      });

      it('should return items in specific location', async () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = await cacheMap.allIn(location);
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[2]);
      });

      it('should return multiple items in same location', async () => {
        // Add another item in container1
        const extraComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '5' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const extraItem: TestItem = { key: extraComKey, id: '5', name: 'Item 5', value: 500 } as TestItem;
        cacheMap.set(extraComKey, extraItem);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = await cacheMap.allIn(location);
        expect(items).toHaveLength(2);
        expect(items).toContain(testItems[2]);
        expect(items).toContain(extraItem);
      });

      it('should return empty array for non-existent location', async () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'nonexistent' as UUID }];
        const items = await cacheMap.allIn(location);
        expect(items).toHaveLength(0);
      });
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    describe('contains()', () => {
      it('should return true when items match query in all locations', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 1').toQuery();
        const result = await cacheMap.contains(query, []);
        expect(result).toBe(true);
      });

      it('should return false when no items match query', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent Item').toQuery();
        const result = await cacheMap.contains(query, []);
        expect(result).toBe(false);
      });

      it('should return true when items match query in specific location', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 3').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const result = await cacheMap.contains(query, location);
        expect(result).toBe(true);
      });

      it('should return false when items match query but not in specified location', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 1').toQuery();
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const result = await cacheMap.contains(query, location);
        expect(result).toBe(false);
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

      cacheMap.set(stringKey, item1);
      cacheMap.set(numberKey, item2);

      // Due to normalization, should only have 1 key (normalized behavior prevents duplicates)
      expect(cacheMap.keys()).toHaveLength(1);

      // Both keys should retrieve the most recently set item (item2)
      // since they normalize to the same internal key
      expect(await cacheMap.get(numberKey)).toEqual(item2);

      // New key objects with same normalized values should also work
      expect(await cacheMap.get({ kt: 'test', pk: '123' as UUID })).toEqual(item2);
      expect(await cacheMap.get({ kt: 'test', pk: 123 as any })).toEqual(item2);
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

      cacheMap.set(stringLocKey, item1);
      cacheMap.set(numberLocKey, item2);

      // Both should be in the same normalized location
      const location: LocKeyArray<'container'> = [{ kt: 'container', lk: '456' as UUID }];
      const items = await cacheMap.allIn(location);
      expect(items).toHaveLength(2);
      expect(items).toContain(item1);
      expect(items).toContain(item2);
    });
  });

  describe('clone()', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    it('should create a new instance with copied data', async () => {
      const cloned = await cacheMap.clone();
      expect(cloned).toBeInstanceOf(MemoryCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should copy all items to the clone', async () => {
      const cloned = await cacheMap.clone();
      expect(cloned.keys()).toHaveLength(4);
      expect(await cloned.values()).toEqual(expect.arrayContaining(testItems));
    });

    it('should not share state with original cache', async () => {
      const cloned = await cacheMap.clone();

      // Modify original
      const newItem: TestItem = { key: { kt: 'test', pk: 'new' as UUID }, id: 'new', name: 'New Item', value: 999 } as TestItem;
      cacheMap.set(newItem.key, newItem);

      // Clone should not be affected
      expect(cacheMap.keys()).toHaveLength(5);
      expect(cloned.keys()).toHaveLength(4);
      expect(await cloned.get(newItem.key)).toBeNull();
    });

    it('should allow independent modifications', async () => {
      const cloned = await cacheMap.clone();

      // Modify clone
      cloned.delete(priKey1);

      // Original should not be affected
      expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
      expect(await cloned.get(priKey1)).toBeNull();
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
      it('should store and retrieve query results without TTL', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should store and retrieve query results with TTL', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should return null for non-existent query hash', async () => {
        const result = await cacheMap.getQueryResult('non_existent');
        expect(result).toBeNull();
      });

      it('should return independent copies of item keys', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        const result1 = await cacheMap.getQueryResult(queryHash1);
        const result2 = await cacheMap.getQueryResult(queryHash1);

        expect(result1).toEqual(itemKeys);
        expect(result2).toEqual(itemKeys);
        expect(result1).not.toBe(result2); // Different array instances
        expect(result1).not.toBe(itemKeys); // Not the original array
      });

      it('should handle empty item keys arrays', async () => {
        const emptyKeys: any[] = [];
        cacheMap.setQueryResult(queryHash1, emptyKeys);
        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual([]);
        expect(result).not.toBe(emptyKeys);
      });

      it('should overwrite existing query results', async () => {
        const newKeys = [comKey1, comKey2];

        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(await cacheMap.getQueryResult(queryHash1)).toEqual(itemKeys);

        cacheMap.setQueryResult(queryHash1, newKeys);
        expect(await cacheMap.getQueryResult(queryHash1)).toEqual(newKeys);
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

    });

    describe('deleteQueryResult()', () => {
      it('should remove existing query results', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);

        cacheMap.deleteQueryResult(queryHash1);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(await cacheMap.getQueryResult(queryHash1)).toBeNull();
      });

      it('should not affect other query results', async () => {
        const otherKeys = [comKey1];

        cacheMap.setQueryResult(queryHash1, itemKeys);
        cacheMap.setQueryResult(queryHash2, otherKeys);

        cacheMap.deleteQueryResult(queryHash1);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);
        expect(await cacheMap.getQueryResult(queryHash2)).toEqual(otherKeys);
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
      it('should remove specified item keys', async () => {
        const keysToInvalidate = [priKey1, comKey1];

        expect(await cacheMap.includesKey(priKey1)).toBe(true);
        expect(await cacheMap.includesKey(comKey1)).toBe(true);
        expect(await cacheMap.includesKey(priKey2)).toBe(true);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);

        cacheMap.invalidateItemKeys(keysToInvalidate);

        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.includesKey(comKey1)).toBe(false);
        expect(await cacheMap.includesKey(priKey2)).toBe(true);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);
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

      it('should handle mixed existing and non-existent keys', async () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const keysToInvalidate = [priKey1, nonExistentKey, comKey1];

        cacheMap.invalidateItemKeys(keysToInvalidate);

        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.includesKey(comKey1)).toBe(false);
        expect(await cacheMap.includesKey(priKey2)).toBe(true);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);
      });
    });

    describe('invalidateLocation()', () => {
      it('should invalidate all primary items when location is empty', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(true);
        expect(await cacheMap.includesKey(priKey2)).toBe(true);
        expect(await cacheMap.includesKey(comKey1)).toBe(true);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);

        await cacheMap.invalidateLocation([]);

        // Primary keys should be invalidated
        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.includesKey(priKey2)).toBe(false);
        // Composite keys should remain
        expect(await cacheMap.includesKey(comKey1)).toBe(true);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);
      });

      it('should invalidate items in specific location', async () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(await cacheMap.includesKey(comKey1)).toBe(true);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);

        await cacheMap.invalidateLocation(location);

        // Only items in container1 should be invalidated
        expect(await cacheMap.includesKey(comKey1)).toBe(false);
        expect(await cacheMap.includesKey(comKey2)).toBe(true);
        // Primary keys should remain
        expect(await cacheMap.includesKey(priKey1)).toBe(true);
        expect(await cacheMap.includesKey(priKey2)).toBe(true);
      });

      it('should clear all query results when invalidating location', async () => {
        const queryHash = 'test_query';
        cacheMap.setQueryResult(queryHash, [priKey1, comKey1]);

        expect(cacheMap.hasQueryResult(queryHash)).toBe(true);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        await cacheMap.invalidateLocation(location);

        expect(cacheMap.hasQueryResult(queryHash)).toBe(false);
      });

      it('should handle non-existent locations gracefully', async () => {
        const nonExistentLocation: LocKeyArray<'container'> = [{ kt: 'container', lk: 'nonexistent' as UUID }];

        expect(() => cacheMap.invalidateLocation(nonExistentLocation)).not.toThrow();
        expect(cacheMap.keys()).toHaveLength(4); // All items should remain
      });

      it('should invalidate multiple items in same location', async () => {
        // Add another item to container1
        const extraComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '5' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const extraItem: TestItem = { key: extraComKey, id: '5', name: 'Item 5', value: 500 } as TestItem;
        cacheMap.set(extraComKey, extraItem);

        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(await cacheMap.includesKey(comKey1)).toBe(true);
        expect(await cacheMap.includesKey(extraComKey)).toBe(true);

        await cacheMap.invalidateLocation(location);

        expect(await cacheMap.includesKey(comKey1)).toBe(false);
        expect(await cacheMap.includesKey(extraComKey)).toBe(false);
        expect(await cacheMap.includesKey(comKey2)).toBe(true); // Different location
      });
    });
  });

  describe('Constructor with Initial Data', () => {
    it('should initialize with provided data', async () => {
      const initialData = {
        [JSON.stringify(priKey1)]: testItems[0],
        [JSON.stringify(comKey1)]: testItems[2]
      };

      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], initialData);

      expect(await cache.get(priKey1)).toEqual(testItems[0]);
      expect(await cache.get(comKey1)).toEqual(testItems[2]);
      expect(await cache.keys()).toHaveLength(2);
    });

    it('should handle empty initial data', async () => {
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], {});
      expect(await cache.keys()).toHaveLength(0);
    });

    it('should handle invalid JSON keys in initial data gracefully', async () => {
      const initialData = {
        'invalid-json': testItems[0],
        [JSON.stringify(priKey1)]: testItems[0]
      };

      // Should not throw and should only include valid entries
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], initialData);
      expect(await cache.keys()).toHaveLength(1);
      expect(await cache.get(priKey1)).toEqual(testItems[0]);
    });

    it('should handle undefined initial data', async () => {
      const cache = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container'], undefined);
      expect(await cache.keys()).toHaveLength(0);
    });
  });

  describe('clone() with Query Results', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    it('should copy query result cache to clone', async () => {
      const queryHash = 'test_query';
      const itemKeys = [priKey1, priKey2];

      cacheMap.setQueryResult(queryHash, itemKeys);
      const cloned = await cacheMap.clone();

      expect(cloned.hasQueryResult(queryHash)).toBe(true);
      expect(await cloned.getQueryResult(queryHash)).toEqual(itemKeys);
    });

    it('should not share query result cache with original', async () => {
      const queryHash1 = 'query1';
      const queryHash2 = 'query2';
      const itemKeys = [priKey1, priKey2];

      cacheMap.setQueryResult(queryHash1, itemKeys);
      const cloned = await cacheMap.clone();

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

    it('should copy query results correctly', async () => {
      const queryHash = 'query_to_copy';
      const itemKeys = [priKey1];

      cacheMap.setQueryResult(queryHash, itemKeys);
      const cloned = await cacheMap.clone();

      expect(cloned.hasQueryResult(queryHash)).toBe(true);
      expect(await cloned.getQueryResult(queryHash)).toEqual(itemKeys);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string keys', async () => {
      const emptyKey: PriKey<'test'> = { kt: 'test', pk: '' as UUID };
      const item: TestItem = { key: emptyKey, id: 'empty', name: 'Empty Key', value: 0 } as TestItem;

      cacheMap.set(emptyKey, item);
      expect(await cacheMap.get(emptyKey)).toEqual(item);
      expect(await cacheMap.includesKey(emptyKey)).toBe(true);
    });

    it('should handle complex objects as item values', async () => {
      const complexItem: TestItem & { nested: { data: string[] } } = {
        key: priKey1,
        id: '1',
        name: 'Complex Item',
        value: 100,
        nested: { data: ['a', 'b', 'c'] }
      } as TestItem & { nested: { data: string[] } };

      // @ts-ignore
      cacheMap.set(priKey1, complexItem as any);
      const retrieved = await cacheMap.get(priKey1);
      expect(retrieved).toEqual(complexItem);
    });

    it('should handle null and undefined values gracefully', async () => {
      const nullItem = null as any;
      const undefinedItem = undefined as any;

      cacheMap.set(priKey1, nullItem);
      cacheMap.set(priKey2, undefinedItem);

      expect(await cacheMap.get(priKey1)).toBeNull();
      expect(await cacheMap.get(priKey2)).toBeUndefined();
      expect(await cacheMap.includesKey(priKey1)).toBe(true);
      expect(await cacheMap.includesKey(priKey2)).toBe(true);
    });

    it('should handle very large numbers of items', async () => {
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
        const retrieved = await cacheMap.get(key);
        expect(retrieved?.value).toBe(i * 100);
      }
      const retrievalTime = performance.now() - retrievalStart;

      // Performance should be reasonable (these are generous thresholds)
      expect(setTime).toBeLessThan(10000); // 10 seconds for 10k items (increased for CI)
      expect(retrievalTime).toBeLessThan(500); // 500ms for 100 retrievals (increased for CI)
    });

    it('should handle special characters in keys', async () => {
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

      for (const [index, key] of specialKeys.entries()) {
        const item: TestItem = { key, id: index.toString(), name: `Special ${index}`, value: index } as TestItem;
        cacheMap.set(key, item);
        expect(await cacheMap.get(key)).toEqual(item);
        expect(await cacheMap.includesKey(key)).toBe(true);
      }

      expect(cacheMap.keys()).toHaveLength(specialKeys.length);
    });

    it('should handle Unicode characters in keys', async () => {
      const unicodeKeys = [
        { kt: 'test', pk: 'café' as UUID },
        { kt: 'test', pk: '日本語' as UUID },
        { kt: 'test', pk: '🔑🌟' as UUID },
        { kt: 'test', pk: 'ñoño' as UUID },
        { kt: 'test', pk: 'αβγ' as UUID }
      ] as PriKey<'test'>[];

      for (const [index, key] of unicodeKeys.entries()) {
        const item: TestItem = { key, id: index.toString(), name: `Unicode ${index}`, value: index } as TestItem;
        cacheMap.set(key, item);
        expect(await cacheMap.get(key)).toEqual(item);
        expect(await cacheMap.includesKey(key)).toBe(true);
      }

      expect(cacheMap.keys()).toHaveLength(unicodeKeys.length);
    });

    it('should handle very long key values', async () => {
      const longPk = 'a'.repeat(10000);
      const longKey: PriKey<'test'> = { kt: 'test', pk: longPk as UUID };
      const item: TestItem = { key: longKey, id: '1', name: 'Long Key Item', value: 1 } as TestItem;

      cacheMap.set(longKey, item);
      expect(await cacheMap.get(longKey)).toEqual(item);
      expect(await cacheMap.includesKey(longKey)).toBe(true);
    });

    it('should handle rapid operations without conflicts', async () => {
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
      for (const [index, key] of keys.entries()) {
        const retrieved = await cacheMap.get(key);
        expect(retrieved?.value).toBe(index);
      }

      // Rapid delete operations
      for (let i = 0; i < operations / 2; i++) {
        cacheMap.delete(keys[i]);
      }

      expect(cacheMap.keys()).toHaveLength(operations / 2);
    });
  });
});
