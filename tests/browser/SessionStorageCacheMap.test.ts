
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStorageCacheMap } from '../../src/browser/SessionStorageCacheMap';
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/types';
import { IQFactory } from '@fjell/core';
import { StorageMock } from './storage-mock';

// Use sessionStorage mock from test setup

describe('SessionStorageCacheMap', () => {
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

  let cacheMap: SessionStorageCacheMap<TestItem, 'test', 'container'>;

  beforeEach(() => {
    // Clear storage data directly
    (window.sessionStorage as any).__reset();
    // Clear mocks
    vi.clearAllMocks();

    cacheMap = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'test-session-cache');
  });

  afterEach(() => {
    // Ensure all mocks are restored
    vi.restoreAllMocks();
    // Clear storage again to prevent test pollution
    (window.sessionStorage as any).__reset();
  });

  describe('Constructor', () => {
    it('should create cache with default prefix', () => {
      const cache = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(SessionStorageCacheMap);
    });

    it('should create cache with custom prefix', () => {
      const cache = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'custom-prefix');
      expect(cache).toBeInstanceOf(SessionStorageCacheMap);
    });

    it('should have correct implementationType', () => {
      expect(cacheMap.implementationType).toBe('browser/sessionStorage');
    });
  });

  describe('Basic Operations', () => {
    describe('set() and get()', () => {
      it('should store and retrieve items by primary key', async () => {
        cacheMap.set(priKey1, testItems[0]);
        const retrieved = await cacheMap.get(priKey1);

        expect(retrieved).toEqual(testItems[0]);
        expect(window.sessionStorage.setItem).toHaveBeenCalled();
        expect(window.sessionStorage.getItem).toHaveBeenCalled();
      });

      it('should store and retrieve items by composite key', async () => {
        cacheMap.set(comKey1, testItems[2]);
        const retrieved = await cacheMap.get(comKey1);

        expect(retrieved).toEqual(testItems[2]);
      });

      it('should return null for non-existent keys', async () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const retrieved = await cacheMap.get(nonExistentKey);

        expect(retrieved).toBeNull();
      });

      it('should handle JSON serialization correctly', () => {
        cacheMap.set(priKey1, testItems[0]);

        // @ts-ignore
        const setItemCall = window.sessionStorage.setItem.mock.calls[0];
        const storedData = JSON.parse(setItemCall[1]);

        expect(storedData).toHaveProperty('originalKey');
        expect(storedData).toHaveProperty('value');
        expect(storedData.originalKey).toEqual(priKey1);
        expect(storedData.value).toEqual(testItems[0]);
      });

      it('should overwrite existing items', async () => {
        cacheMap.set(priKey1, testItems[0]);

        const updatedItem: TestItem = { key: priKey1, id: '1', name: 'Updated Item 1', value: 999 } as TestItem;
        cacheMap.set(priKey1, updatedItem);

        const retrieved = await cacheMap.get(priKey1);
        expect(retrieved).toEqual(updatedItem);
      });
    });

    describe('includesKey()', () => {
      beforeEach(() => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(comKey1, testItems[2]);
      });

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

      it('should verify key collision detection', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(true);

        // @ts-ignore
        const getItemCall = window.sessionStorage.getItem.mock.calls[window.sessionStorage.getItem.mock.calls.length - 1];
        expect(getItemCall[0]).toContain('test-session-cache:');
      });
    });

    describe('delete()', () => {
      beforeEach(() => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(priKey2, testItems[1]);
        cacheMap.set(comKey1, testItems[2]);
      });

      it('should remove items by primary key', async () => {
        expect(await cacheMap.includesKey(priKey1)).toBe(true);
        cacheMap.delete(priKey1);

        expect(await cacheMap.includesKey(priKey1)).toBe(false);
        expect(await cacheMap.get(priKey1)).toBeNull();
        expect(window.sessionStorage.removeItem).toHaveBeenCalled();
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
      });
    });

    describe('keys() and values()', () => {
      beforeEach(() => {
        testItems.forEach(item => cacheMap.set(item.key, item));
      });

      it('should return all keys', async () => {
        const keys = await cacheMap.keys();

        expect(keys).toHaveLength(3);
        expect(keys.some(k => JSON.stringify(k) === JSON.stringify(priKey1))).toBe(true);
        expect(keys.some(k => JSON.stringify(k) === JSON.stringify(priKey2))).toBe(true);
        expect(keys.some(k => JSON.stringify(k) === JSON.stringify(comKey1))).toBe(true);
      });

      it('should return all values', async () => {
        const values = await cacheMap.values();

        expect(values).toHaveLength(3);
        expect(values.some(v => JSON.stringify(v) === JSON.stringify(testItems[0]))).toBe(true);
        expect(values.some(v => JSON.stringify(v) === JSON.stringify(testItems[1]))).toBe(true);
        expect(values.some(v => JSON.stringify(v) === JSON.stringify(testItems[2]))).toBe(true);
      });
    });

    describe('clear()', () => {
      beforeEach(() => {
        testItems.forEach(item => cacheMap.set(item.key, item));
      });

      it('should remove all cache items from sessionStorage', async () => {
        expect(await cacheMap.keys()).toHaveLength(3);

        cacheMap.clear();

        expect(await cacheMap.keys()).toHaveLength(0);
        expect(await cacheMap.values()).toHaveLength(0);
      });

      it('should only remove items with the cache prefix', () => {
        // Add some non-cache items to sessionStorage
        window.sessionStorage.setItem('other-app:data', 'should not be deleted');
        window.sessionStorage.setItem('user-setting', 'should not be deleted');

        cacheMap.clear();

        // Non-cache items should remain
        expect(window.sessionStorage.getItem('other-app:data')).toBe('should not be deleted');
        expect(window.sessionStorage.getItem('user-setting')).toBe('should not be deleted');
      });
    });
  });

  describe('Session-specific Behavior', () => {
    it('should be isolated from localStorage', () => {
      // This test verifies that sessionStorage and localStorage don't interfere
      // We can't directly test tab isolation in unit tests, but we can verify
      // that the sessionStorage API is being used correctly

      cacheMap.set(priKey1, testItems[0]);

      // Verify sessionStorage was called, not localStorage
      expect(window.sessionStorage.setItem).toHaveBeenCalled();

      // @ts-ignore
      const setItemCall = window.sessionStorage.setItem.mock.calls[0];
      expect(setItemCall[0]).toContain('test-session-cache:');
    });

    it('should handle session expiration gracefully', async () => {
      cacheMap.set(priKey1, testItems[0]);

      // Simulate session clearing (tab close)
      window.sessionStorage.clear();

      // All data should be gone
      expect(await cacheMap.keys()).toHaveLength(0);
      expect(await cacheMap.get(priKey1)).toBeNull();
    });
  });

  describe('Location-based Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
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
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
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
    });

    describe('queryIn()', () => {
      it('should return matching items from all locations', async () => {
        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const items = await cacheMap.queryIn(query, []);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[0]);
      });

      it('should return empty array when no items match', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent').toQuery();
        const items = await cacheMap.queryIn(query, []);

        expect(items).toHaveLength(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle sessionStorage setItem errors gracefully', async () => {
      // Mock sessionStorage.setItem to throw an error (e.g., quota exceeded)
      // @ts-ignore
      window.sessionStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      await expect(async () => {
        await cacheMap.set(priKey1, testItems[0]);
      }).rejects.toThrow('Failed to store item in sessionStorage');
    });

    it('should handle sessionStorage getItem errors gracefully', async () => {
      // Mock sessionStorage.getItem to throw an error
      // @ts-ignore
      window.sessionStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      const result = await cacheMap.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle invalid JSON in sessionStorage gracefully', async () => {
      // Directly set invalid JSON in storage
      const storageKey = `test-session-cache:${cacheMap['normalizedHashFunction'](priKey1)}`;
      window.sessionStorage.setItem(storageKey, 'invalid json');

      const result = await cacheMap.get(priKey1);
      expect(result).toBeNull();
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

      // Number 123 should overwrite string '123' due to normalization
      expect(await cacheMap.get(stringKey)).toEqual(item2);
      expect(await cacheMap.get(numberKey)).toEqual(item2);
    });
  });

  describe('clone()', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    it('should create a new instance sharing the same sessionStorage', async () => {
      const cloned = await cacheMap.clone();

      expect(cloned).toBeInstanceOf(SessionStorageCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should share data through sessionStorage', async () => {
      const cloned = await cacheMap.clone();

      // Clone should see the same data
      expect(await cloned.keys()).toHaveLength(3);
      expect(await cloned.get(priKey1)).toEqual(testItems[0]);
    });

    it('should share modifications through sessionStorage', async () => {
      const cloned = await cacheMap.clone();

      // Modify through clone
      const newItem: TestItem = { key: { kt: 'test', pk: 'new' as UUID }, id: 'new', name: 'New Item', value: 999 } as TestItem;
      cloned.set(newItem.key, newItem);

      // Original should see the change
      expect(await cacheMap.get(newItem.key)).toEqual(newItem);
    });
  });

  describe('Prefix Isolation', () => {
    it('should isolate caches with different prefixes', async () => {
      const cache1 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      cache1.set(priKey1, testItems[0]);
      cache2.set(priKey1, testItems[1]);

      expect(await cache1.get(priKey1)).toEqual(testItems[0]);
      expect(await cache2.get(priKey1)).toEqual(testItems[1]);

      expect(await cache1.keys()).toHaveLength(1);
      expect(await cache2.keys()).toHaveLength(1);
    });

    it('should not affect other prefixes when clearing', async () => {
      const cache1 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      cache1.set(priKey1, testItems[0]);
      cache2.set(priKey1, testItems[1]);

      cache1.clear();

      expect(await cache1.keys()).toHaveLength(0);
      expect(await cache2.keys()).toHaveLength(1);
      expect(await cache2.get(priKey1)).toEqual(testItems[1]);
    });
  });

  describe('Query Result Caching', () => {
    const queryHash1 = 'query-hash-1';
    const queryHash2 = 'query-hash-2';
    const itemKeys = [priKey1, priKey2];

    describe('setQueryResult() and getQueryResult()', () => {
      it('should store and retrieve query results without TTL', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);

        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should return null for non-existent query hash', async () => {
        const result = await cacheMap.getQueryResult('non-existent');
        expect(result).toBeNull();
      });

      it('should handle old format query results (array without expiration)', async () => {
        // Manually store old format (just array)
        const queryKey = `test-session-cache:query:${queryHash1}`;
        window.sessionStorage.setItem(queryKey, JSON.stringify(itemKeys));

        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should handle malformed query result data', async () => {
        // Manually store invalid data
        const queryKey = `test-session-cache:query:${queryHash1}`;
        window.sessionStorage.setItem(queryKey, 'invalid json');

        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });

      it('should handle query results with missing itemKeys', async () => {
        // Manually store data without itemKeys
        const queryKey = `test-session-cache:query:${queryHash1}`;
        const malformedData = { someOtherField: 'value' };
        window.sessionStorage.setItem(queryKey, JSON.stringify(malformedData));

        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });

      it('should handle sessionStorage errors during query result operations', async () => {
        // Test setQueryResult error handling
        // @ts-ignore
        window.sessionStorage.setItem.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        expect(() => {
          cacheMap.setQueryResult(queryHash1, itemKeys);
        }).not.toThrow(); // Should handle error gracefully

        // Test getQueryResult error handling
        // @ts-ignore
        window.sessionStorage.getItem.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        const result = await cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });
    });

    describe('hasQueryResult()', () => {
      it('should return true for existing query results', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(await cacheMap.hasQueryResult(queryHash1)).toBe(true);
      });

      it('should return false for non-existent query results', async () => {
        expect(await cacheMap.hasQueryResult('non-existent')).toBe(false);
      });

    });

    describe('deleteQueryResult()', () => {
      it('should delete existing query results', async () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(await cacheMap.hasQueryResult(queryHash1)).toBe(true);

        cacheMap.deleteQueryResult(queryHash1);
        expect(await cacheMap.hasQueryResult(queryHash1)).toBe(false);
      });

      it('should handle deletion of non-existent query results gracefully', () => {
        expect(() => {
          cacheMap.deleteQueryResult('non-existent');
        }).not.toThrow();
      });

      it('should handle sessionStorage errors during deletion', () => {
        // @ts-ignore
        window.sessionStorage.removeItem.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        expect(() => {
          cacheMap.deleteQueryResult(queryHash1);
        }).not.toThrow();
      });
    });

    describe('clearQueryResults()', () => {
      it('should clear all query results but preserve regular cache items', async () => {
        // Add regular cache items
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(priKey2, testItems[1]);

        // Add query results
        cacheMap.setQueryResult(queryHash1, [priKey1]);
        cacheMap.setQueryResult(queryHash2, [priKey2]);

        expect(await cacheMap.hasQueryResult(queryHash1)).toBe(true);
        expect(await cacheMap.hasQueryResult(queryHash2)).toBe(true);

        cacheMap.clearQueryResults();

        // Query results should be cleared
        expect(await cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(await cacheMap.hasQueryResult(queryHash2)).toBe(false);

        // Regular cache items should remain
        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);
      });

      it('should only clear query results with matching prefix', async () => {
        // Add query result to our cache
        cacheMap.setQueryResult(queryHash1, itemKeys);

        // Manually add query result with different prefix to sessionStorage
        window.sessionStorage.setItem('other-app:query:other-hash', JSON.stringify([priKey1]));

        cacheMap.clearQueryResults();

        // Our query result should be cleared
        expect(await cacheMap.hasQueryResult(queryHash1)).toBe(false);

        // Other app's query result should remain
        expect(window.sessionStorage.getItem('other-app:query:other-hash')).toBeTruthy();
      });

      it('should handle sessionStorage errors during bulk clearing', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);

        // Mock sessionStorage iteration to throw error
        let callCount = 0;
        const originalKeyMethod = window.sessionStorage.key;
        // @ts-ignore
        window.sessionStorage.key.mockImplementation((index) => {
          callCount++;
          if (callCount > 1) {
            throw new Error('Storage error during iteration');
          }
          return `test-session-cache:query:${queryHash1}`;
        });

        expect(() => {
          cacheMap.clearQueryResults();
        }).not.toThrow();

        // Restore the original method to prevent interference with other tests
        // @ts-ignore
        window.sessionStorage.key.mockRestore();
      });
    });
  });

  describe('Cache Invalidation Methods', () => {
    beforeEach(() => {
      // Clear any existing cache data first
      cacheMap.clear();
      cacheMap.clearQueryResults();

      // Set up test data
      testItems.forEach(item => cacheMap.set(item.key, item));

      // Set up query results
      cacheMap.setQueryResult('query1', [priKey1, priKey2]);
      cacheMap.setQueryResult('query2', [comKey1]);
    });

    describe('invalidateItemKeys()', () => {
      beforeEach(() => {
        // Reset cache state for each test in this describe block
        cacheMap.clear();
        cacheMap.clearQueryResults();

        // Re-add the test data
        testItems.forEach(item => cacheMap.set(item.key, item));
        cacheMap.setQueryResult('query1', [priKey1, priKey2]);
        cacheMap.setQueryResult('query2', [comKey1]);
      });

      it('should remove specified items from cache', async () => {
        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);

        cacheMap.invalidateItemKeys([priKey1, priKey2]);

        expect(await cacheMap.get(priKey1)).toBeNull();
        expect(await cacheMap.get(priKey2)).toBeNull();
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]); // Should remain
      });

      it('should handle empty key arrays', async () => {
        expect(() => {
          cacheMap.invalidateItemKeys([]);
        }).not.toThrow();

        // All items should still be present
        expect(await cacheMap.keys()).toHaveLength(3);
      });

      it('should handle non-existent keys gracefully', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };

        expect(() => {
          cacheMap.invalidateItemKeys([nonExistentKey]);
        }).not.toThrow();
      });
    });

    describe('invalidateLocation()', () => {
      it('should invalidate all primary items when location is empty', async () => {
        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);

        await cacheMap.invalidateLocation([]);

        // Primary items should be invalidated
        expect(await cacheMap.get(priKey1)).toBeNull();
        expect(await cacheMap.get(priKey2)).toBeNull();

        // Composite items should remain
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);

        // Query results should be cleared
        expect(await cacheMap.hasQueryResult('query1')).toBe(false);
        expect(await cacheMap.hasQueryResult('query2')).toBe(false);
      });

      it('should invalidate items in specific location', async () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);

        await cacheMap.invalidateLocation(location);

        // Item in specified location should be invalidated
        expect(await cacheMap.get(comKey1)).toBeNull();

        // Primary items should remain
        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);

        // Query results should be cleared
        expect(await cacheMap.hasQueryResult('query1')).toBe(false);
        expect(await cacheMap.hasQueryResult('query2')).toBe(false);
      });

      it('should handle non-existent locations gracefully', async () => {
        const nonExistentLocation: LocKeyArray<'container'> = [{ kt: 'container', lk: 'missing' as UUID }];

        // Don't use expect with async function, just await directly
        await cacheMap.invalidateLocation(nonExistentLocation);
        // If it throws, the test will fail automatically

        // All items should still be present
        expect(await cacheMap.keys()).toHaveLength(3);

        // But query results should still be cleared
        expect(await cacheMap.hasQueryResult('query1')).toBe(false);
        expect(await cacheMap.hasQueryResult('query2')).toBe(false);
      });

      it('should properly identify primary vs composite keys', async () => {
        // Add more test data to verify key type identification
        const anotherComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '4' as UUID,
          loc: [{ kt: 'container', lk: 'container2' as UUID }]
        };
        const anotherComItem: TestItem = { key: anotherComKey, id: '4', name: 'Item 4', value: 400 } as TestItem;
        cacheMap.set(anotherComKey, anotherComItem);

        // Invalidate primary items
        await cacheMap.invalidateLocation([]);

        // Primary items should be gone
        expect(await cacheMap.get(priKey1)).toBeNull();
        expect(await cacheMap.get(priKey2)).toBeNull();

        // Composite items should remain
        expect(await cacheMap.get(comKey1)).toEqual(testItems[2]);
        expect(await cacheMap.get(anotherComKey)).toEqual(anotherComItem);
      });
    });
  });

  describe('Timestamp and Storage Format', () => {
    it('should include timestamp when storing items', () => {
      const mockNow = 1234567890000;
      vi.setSystemTime(new Date(mockNow));

      cacheMap.set(priKey1, testItems[0]);

      // @ts-ignore
      const setItemCall = window.sessionStorage.setItem.mock.calls[0];
      const storedData = JSON.parse(setItemCall[1]);

      expect(storedData).toHaveProperty('timestamp');
      expect(storedData.timestamp).toBe(mockNow);
    });

    it('should maintain consistent storage format', () => {
      cacheMap.set(priKey1, testItems[0]);

      // @ts-ignore
      const setItemCall = window.sessionStorage.setItem.mock.calls[0];
      const storedData = JSON.parse(setItemCall[1]);

      expect(storedData).toHaveProperty('originalKey');
      expect(storedData).toHaveProperty('value');
      expect(storedData).toHaveProperty('timestamp');
      expect(typeof storedData.timestamp).toBe('number');
      expect(storedData.originalKey).toEqual(priKey1);
      expect(storedData.value).toEqual(testItems[0]);
    });
  });

  describe('Metadata Operations', () => {
    const now = Date.now();
    const testMetadata = {
      addedAt: now - 1000,
      lastAccessedAt: now,
      accessCount: 5,
      estimatedSize: 1024,
      key: 'metadata-test-key'
    };

    const testKey = 'metadata-test-key';

    describe('setMetadata() and getMetadata()', () => {
      it('should store and retrieve metadata', async () => {
        await cacheMap.setMetadata(testKey, testMetadata);
        const retrieved = await cacheMap.getMetadata(testKey);

        expect(retrieved).toEqual(testMetadata);
      });

      it('should return null for non-existent metadata', async () => {
        const result = await cacheMap.getMetadata('non-existent-key');
        expect(result).toBeNull();
      });

      it('should overwrite existing metadata', async () => {
        await cacheMap.setMetadata(testKey, testMetadata);

        const updatedMetadata = {
          addedAt: now - 500,
          lastAccessedAt: now + 1000,
          accessCount: 10,
          estimatedSize: 2048,
          key: testKey
        };

        await cacheMap.setMetadata(testKey, updatedMetadata);
        const retrieved = await cacheMap.getMetadata(testKey);

        expect(retrieved).toEqual(updatedMetadata);
      });

      it('should handle complex metadata objects', async () => {
        const complexMetadata = {
          addedAt: now - 2000,
          lastAccessedAt: now,
          accessCount: 15,
          estimatedSize: 4096,
          key: testKey,
          frequencyScore: 0.75,
          lastFrequencyUpdate: now - 100,
          rawFrequency: 15
        };

        await cacheMap.setMetadata(testKey, complexMetadata);
        const retrieved = await cacheMap.getMetadata(testKey);

        expect(retrieved).toEqual(complexMetadata);
      });

      it('should handle sessionStorage errors gracefully during metadata operations', async () => {
        // Test setMetadata error handling
        const originalSetItem = window.sessionStorage.setItem;
        // @ts-ignore
        window.sessionStorage.setItem.mockImplementationOnce(() => {
          throw new Error('Storage quota exceeded');
        });

        expect(async () => {
          await cacheMap.setMetadata(testKey, testMetadata);
        }).not.toThrow(); // Should handle error gracefully

        // No explicit restore needed; mockImplementationOnce only affects a single call

        // Test getMetadata error handling
        // @ts-ignore
        window.sessionStorage.getItem.mockImplementationOnce(() => {
          throw new Error('Storage read error');
        });

        const result = await cacheMap.getMetadata(testKey);
        expect(result).toBeNull();
      });

      it('should handle corrupted metadata JSON gracefully', async () => {
        // Manually store corrupted metadata
        const metadataKey = `test-session-cache:metadata:${testKey}`;
        window.sessionStorage.setItem(metadataKey, 'invalid json {');

        const result = await cacheMap.getMetadata(testKey);
        expect(result).toBeNull();
      });
    });

    describe('deleteMetadata()', () => {
      beforeEach(async () => {
        await cacheMap.setMetadata(testKey, testMetadata);
      });

      it('should delete existing metadata', async () => {
        expect(await cacheMap.getMetadata(testKey)).toEqual(testMetadata);

        await cacheMap.deleteMetadata(testKey);

        expect(await cacheMap.getMetadata(testKey)).toBeNull();
      });

      it('should handle deletion of non-existent metadata gracefully', async () => {
        expect(async () => {
          await cacheMap.deleteMetadata('non-existent-key');
        }).not.toThrow();
      });

      it('should handle sessionStorage errors during deletion', async () => {
        // @ts-ignore
        window.sessionStorage.removeItem.mockImplementationOnce(() => {
          throw new Error('Storage delete error');
        });

        expect(async () => {
          await cacheMap.deleteMetadata(testKey);
        }).not.toThrow();
      });
    });

    describe('getAllMetadata()', () => {
      const testKey1 = 'metadata-key-1';
      const testKey2 = 'metadata-key-2';
      const testKey3 = 'metadata-key-3';

      const metadata1 = { addedAt: 500, lastAccessedAt: 1000, accessCount: 1, estimatedSize: 512, key: testKey1 };
      const metadata2 = { addedAt: 1500, lastAccessedAt: 2000, accessCount: 2, estimatedSize: 1024, key: testKey2 };
      const metadata3 = { addedAt: 2500, lastAccessedAt: 3000, accessCount: 3, estimatedSize: 1536, key: testKey3 };

      beforeEach(async () => {
        await cacheMap.clearMetadata(); // Start with clean metadata
        await cacheMap.setMetadata(testKey1, metadata1);
        await cacheMap.setMetadata(testKey2, metadata2);
        await cacheMap.setMetadata(testKey3, metadata3);
      });

      it('should return all metadata entries', async () => {
        const allMetadata = await cacheMap.getAllMetadata();

        expect(allMetadata.size).toBe(3);
        expect(allMetadata.get(testKey1)).toEqual(metadata1);
        expect(allMetadata.get(testKey2)).toEqual(metadata2);
        expect(allMetadata.get(testKey3)).toEqual(metadata3);
      });

      it('should return empty map when no metadata exists', async () => {
        await cacheMap.clearMetadata();
        const allMetadata = await cacheMap.getAllMetadata();

        expect(allMetadata.size).toBe(0);
      });

      it('should only return metadata with matching prefix', async () => {
        // Add metadata with different prefix
        window.sessionStorage.setItem('other-app:metadata:other-key', JSON.stringify({ test: true }));

        const allMetadata = await cacheMap.getAllMetadata();

        // Should only include our cache's metadata
        expect(allMetadata.size).toBe(3);
        expect(allMetadata.has('other-key')).toBe(false);
      });

      it('should skip corrupted metadata entries', async () => {
        // Store a corrupted entry by bypassing JSON serialization
        const corruptedKey = 'test-session-cache:metadata:corrupted';
        const storageMock = window.sessionStorage as any;

        // Directly set invalid JSON in the mock's internal storage
        storageMock.setItem(corruptedKey, 'invalid json');

        const allMetadata = cacheMap.getAllMetadata();

        // Should still return valid entries, skip corrupted one
        expect((await allMetadata).size).toBe(3);
        expect((await allMetadata).has('corrupted')).toBe(false);
      });

      it('should handle sessionStorage iteration errors gracefully', async () => {
        // Mock sessionStorage.key to throw error
        // @ts-ignore
        window.sessionStorage.key.mockImplementationOnce(() => {
          throw new Error('Storage iteration error');
        });

        const allMetadata = await cacheMap.getAllMetadata();
        expect(allMetadata).toBeInstanceOf(Map);
        expect(allMetadata.size).toBe(0);
      });
    });

    describe('clearMetadata()', () => {
      beforeEach(async () => {
        await cacheMap.setMetadata('key1', { addedAt: 500, lastAccessedAt: 1000, accessCount: 1, estimatedSize: 512, key: 'key1' });
        await cacheMap.setMetadata('key2', { addedAt: 1500, lastAccessedAt: 2000, accessCount: 2, estimatedSize: 1024, key: 'key2' });
        await cacheMap.setMetadata('key3', { addedAt: 2500, lastAccessedAt: 3000, accessCount: 3, estimatedSize: 1536, key: 'key3' });
      });

      it('should clear all metadata entries', async () => {
        expect((await cacheMap.getAllMetadata()).size).toBe(3);

        await cacheMap.clearMetadata();

        expect((await cacheMap.getAllMetadata()).size).toBe(0);
        expect(await cacheMap.getMetadata('key1')).toBeNull();
        expect(await cacheMap.getMetadata('key2')).toBeNull();
        expect(await cacheMap.getMetadata('key3')).toBeNull();
      });

      it('should not affect regular cache items', async () => {
        // Add regular cache items
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(priKey2, testItems[1]);

        await cacheMap.clearMetadata();

        // Regular cache items should remain
        expect(await cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(await cacheMap.get(priKey2)).toEqual(testItems[1]);
      });

      it('should not affect query results', async () => {
        // Add query results
        cacheMap.setQueryResult('test-query', [priKey1]);

        await cacheMap.clearMetadata();

        // Query results should remain
        expect(await cacheMap.hasQueryResult('test-query')).toBe(true);
      });

      it('should only clear metadata with matching prefix', async () => {
        // Add metadata with different prefix
        window.sessionStorage.setItem('other-app:metadata:other-key', JSON.stringify({ test: true }));

        await cacheMap.clearMetadata();

        // Our metadata should be cleared
        expect((await cacheMap.getAllMetadata()).size).toBe(0);

        // Other app's metadata should remain
        expect(window.sessionStorage.getItem('other-app:metadata:other-key')).toBeTruthy();
      });

      it('should handle sessionStorage errors during bulk clearing', async () => {
        // Mock sessionStorage iteration to cause error
        let callCount = 0;
        // @ts-ignore
        window.sessionStorage.key.mockImplementationOnce((index) => {
          callCount++;
          if (callCount > 2) {
            throw new Error('Storage error during bulk clear');
          }
          return callCount === 1 ? 'test-session-cache:metadata:key1' : null;
        });

        expect(async () => {
          await cacheMap.clearMetadata();
        }).not.toThrow();
      });
    });
  });

  describe('Size and Limit Reporting', () => {
    describe('getCurrentSize()', () => {
      beforeEach(async () => {
        await cacheMap.clear();
        await cacheMap.clearQueryResults();
        await cacheMap.clearMetadata();
      });

      it('should return zero size for empty cache', async () => {
        const size = await cacheMap.getCurrentSize();

        expect(size.itemCount).toBe(0);
        expect(size.sizeBytes).toBe(0);
      });

      it('should count cache items correctly', async () => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(priKey2, testItems[1]);
        cacheMap.set(comKey1, testItems[2]);

        const size = await cacheMap.getCurrentSize();

        expect(size.itemCount).toBe(3);
        expect(size.sizeBytes).toBeGreaterThan(0);
      });

      it('should not count metadata entries in item count', async () => {
        const testNow = Date.now();
        cacheMap.set(priKey1, testItems[0]);
        await cacheMap.setMetadata('test-key', { addedAt: testNow - 1000, lastAccessedAt: testNow, accessCount: 1, estimatedSize: 256, key: 'test-key' });

        const size = await cacheMap.getCurrentSize();

        expect(size.itemCount).toBe(1); // Only cache items counted
      });

      it('should not count query results in item count', async () => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.setQueryResult('test-query', [priKey1]);

        const size = await cacheMap.getCurrentSize();

        expect(size.itemCount).toBe(1); // Only cache items counted
      });

      it('should calculate byte size using Blob measurement', async () => {
        const largeItem: TestItem = {
          key: priKey1,
          id: '1',
          name: 'A'.repeat(1000), // Large string
          value: 100
        } as TestItem;

        cacheMap.set(priKey1, largeItem);

        const size = await cacheMap.getCurrentSize();

        expect(size.sizeBytes).toBeGreaterThan(1000); // Should include the large string plus JSON overhead
      });

      it('should handle storage iteration errors gracefully', async () => {
        cacheMap.set(priKey1, testItems[0]);

        // Mock storage.key to throw error
        // @ts-ignore
        window.sessionStorage.key.mockImplementationOnce(() => {
          throw new Error('Storage iteration error');
        });

        const size = await cacheMap.getCurrentSize();

        // Should return default values on error
        expect(size.itemCount).toBe(0);
        expect(size.sizeBytes).toBe(0);
      });

      it('should handle storage.getItem errors gracefully', async () => {
        cacheMap.set(priKey1, testItems[0]);

        // Mock getItem to throw error for cache items
        let callCount = 0;
        // @ts-ignore
        window.sessionStorage.getItem.mockImplementation((key) => {
          callCount++;
          if (key.includes('test-session-cache:') && !key.includes(':metadata:') && !key.includes(':query:')) {
            throw new Error('Storage read error');
          }
          // Call through to the underlying storage implementation
          const storage = new StorageMock();
          return storage.getItem(key);
        });

        const size = await cacheMap.getCurrentSize();

        // Should handle error gracefully
        expect(size.itemCount).toBe(0);
        expect(size.sizeBytes).toBe(0);

        // Restore the mock
        // @ts-ignore
        window.sessionStorage.getItem.mockRestore();
      });
    });

    describe('getSizeLimits()', () => {
      it('should return correct SessionStorage limits', async () => {
        const limits = await cacheMap.getSizeLimits();

        expect(limits.maxItems).toBeNull(); // SessionStorage has no specific item limit
        expect(limits.maxSizeBytes).toBe(5 * 1024 * 1024); // 5MB
      });

      it('should return consistent limits across multiple calls', async () => {
        const limits1 = await cacheMap.getSizeLimits();
        const limits2 = await cacheMap.getSizeLimits();

        expect(limits1).toEqual(limits2);
      });
    });
  });

  describe('Enhanced Error Handling and Edge Cases', () => {
    describe('Hash collision detection', () => {
      it('should handle hash collisions correctly', async () => {
        const key1: PriKey<'test'> = { kt: 'test', pk: 'key1' as UUID };
        const key2: PriKey<'test'> = { kt: 'test', pk: 'key2' as UUID };

        // Store first item
        cacheMap.set(key1, testItems[0]);

        // Get the storage key for key1
        const storageKey = `test-session-cache:${cacheMap['normalizedHashFunction'](key1)}`;

        // Manually create a collision by storing a different item with different originalKey
        // This simulates what would happen if two keys hashed to the same value
        const collidingData = {
          originalKey: key2,
          value: testItems[1],
          timestamp: Date.now(),
          originalVerificationHash: cacheMap['verificationHashFunction'](key2)
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(collidingData));

        // When we try to get key1, it should detect the collision and return null
        const result1 = await cacheMap.get(key1);
        expect(result1).toBeNull();

        // key2 should also return null because verification will fail
        const result2 = await cacheMap.get(key2);
        expect(result2).toBeNull();
      });
    });

    describe('Corrupted storage data handling', () => {
      it('should handle storage with missing originalKey', async () => {
        const storageKey = `test-session-cache:${cacheMap['normalizedHashFunction'](priKey1)}`;
        const corruptedData = {
          value: testItems[0]
          // Missing originalKey
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(corruptedData));

        const result = await cacheMap.get(priKey1);
        expect(result).toBeNull();
      });

      it('should handle storage with missing value', async () => {
        const storageKey = `test-session-cache:${cacheMap['normalizedHashFunction'](priKey1)}`;
        const corruptedData = {
          originalKey: priKey1
          // Missing value
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(corruptedData));

        const result = await cacheMap.get(priKey1);
        expect(result).toBeNull();
      });

      it('should handle malformed JSON in keys() method', async () => {
        cacheMap.set(priKey1, testItems[0]); // Add one valid item

        // Directly add corrupted item to storage
        const corruptedKey = 'test-session-cache:corrupted';
        const storageMock = window.sessionStorage as any;
        storageMock.setItem(corruptedKey, 'invalid json');

        const keys = await cacheMap.keys();

        // Should only return valid keys, skip corrupted ones
        expect(keys).toHaveLength(1);
        expect(keys[0]).toEqual(priKey1);
      });

      it('should handle malformed JSON in values() method', async () => {
        cacheMap.set(priKey1, testItems[0]); // Add one valid item

        // Directly add corrupted item to storage
        const corruptedKey = 'test-session-cache:corrupted';
        const storageMock = window.sessionStorage as any;
        storageMock.setItem(corruptedKey, 'invalid json');

        const values = await cacheMap.values();

        // Should only return valid values, skip corrupted ones
        expect(values).toHaveLength(1);
        expect(values[0]).toEqual(testItems[0]);
      });
    });

    describe('Storage quota exceeded scenarios', () => {
      it('should throw error when storage quota is exceeded during set()', async () => {
        // Mock setItem to simulate quota exceeded error
        // @ts-ignore
        window.sessionStorage.setItem.mockImplementationOnce(() => {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        });

        await expect(async () => {
          await cacheMap.set(priKey1, testItems[0]);
        }).rejects.toThrow('Failed to store item in sessionStorage');
      });

      it('should handle quota exceeded during query result storage gracefully', () => {
        // Mock setItem to simulate quota exceeded error
        // @ts-ignore
        window.sessionStorage.setItem.mockImplementationOnce(() => {
          throw new Error('QuotaExceededError');
        });

        expect(() => {
          cacheMap.setQueryResult('test-query', [priKey1]);
        }).not.toThrow(); // Should handle gracefully for query results
      });
    });
  });

  describe('Complex Multi-level Location Keys', () => {
    interface MultiLevelTestItem extends Item<'test', 'container', 'section', 'subsection'> {
      id: string;
      name: string;
      value: number;
    }

    const complexComKey: ComKey<'test', 'container', 'section', 'subsection'> = {
      kt: 'test',
      pk: '5' as UUID,
      loc: [
        { kt: 'container', lk: 'container1' as UUID },
        { kt: 'section', lk: 'section1' as UUID },
        { kt: 'subsection', lk: 'subsection1' as UUID }
      ]
    };

    const complexTestItem: MultiLevelTestItem = {
      key: complexComKey, // Use the same key structure we defined above
      id: '5',
      name: 'Complex Item',
      value: 500
    } as MultiLevelTestItem;

    let complexCacheMap: SessionStorageCacheMap<MultiLevelTestItem, 'test', 'container', 'section', 'subsection'>;

    beforeEach(() => {
      complexCacheMap = new SessionStorageCacheMap<MultiLevelTestItem, 'test', 'container', 'section', 'subsection'>(
        ['test', 'container', 'section', 'subsection'],
        'complex-test-cache'
      );
    });

    it('should handle complex multi-level location keys', async () => {
      complexCacheMap.set(complexComKey, complexTestItem);
      const retrieved = await complexCacheMap.get(complexComKey);

      expect(retrieved).toEqual(complexTestItem);
    });

    it('should find items in complex nested locations', async () => {
      complexCacheMap.set(complexComKey, complexTestItem);

      const location: LocKeyArray<'container', 'section', 'subsection'> = [
        { kt: 'container', lk: 'container1' as UUID },
        { kt: 'section', lk: 'section1' as UUID },
        { kt: 'subsection', lk: 'subsection1' as UUID }
      ];

      const items = await complexCacheMap.allIn(location);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(complexTestItem);
    });

    it('should handle partial location matching correctly', async () => {
      complexCacheMap.set(complexComKey, complexTestItem);

      // Partial location (missing subsection)
      const partialLocation: LocKeyArray<'container', 'section'> = [
        { kt: 'container', lk: 'container1' as UUID },
        { kt: 'section', lk: 'section1' as UUID }
      ];

      const items = await complexCacheMap.allIn(partialLocation as any);
      expect(items).toHaveLength(0); // Should not match due to length difference
    });

    it('should invalidate complex nested locations correctly', async () => {
      complexCacheMap.set(complexComKey, complexTestItem);
      expect(await complexCacheMap.get(complexComKey)).toEqual(complexTestItem);

      const location: LocKeyArray<'container', 'section', 'subsection'> = [
        { kt: 'container', lk: 'container1' as UUID },
        { kt: 'section', lk: 'section1' as UUID },
        { kt: 'subsection', lk: 'subsection1' as UUID }
      ];

      await complexCacheMap.invalidateLocation(location);
      expect(await complexCacheMap.get(complexComKey)).toBeNull();
    });
  });

  describe('Implementation Type Consistency', () => {
    it('should have consistent implementationType', () => {
      expect(cacheMap.implementationType).toBe('browser/sessionStorage');
    });

    it('should return consistent implementationType across instances', () => {
      const cache1 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      expect(cache1.implementationType).toBe('browser/sessionStorage');
      expect(cache2.implementationType).toBe('browser/sessionStorage');
      expect(cache1.implementationType).toBe(cache2.implementationType);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large numbers of items efficiently', async () => {
      const startTime = Date.now();
      const items: TestItem[] = [];
      const keys: PriKey<'test'>[] = [];

      // Prepare test data
      for (let i = 0; i < 20; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `perf-item-${i}` as UUID };
        const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i } as TestItem;
        items.push(item);
        keys.push(key);
      }

      // Add all items
      items.forEach(item => cacheMap.set(item.key, item));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second

      // Verify all items were stored
      const storedKeys = await cacheMap.keys();
      expect(storedKeys).toHaveLength(20);

      // Verify we can retrieve all items
      const retrievedItems = await Promise.all(keys.map(async key => await cacheMap.get(key)));
      expect(retrievedItems.filter(item => item !== null)).toHaveLength(20);
    });

    it('should handle large numbers of query results efficiently', async () => {
      const startTime = Date.now();

      // First store some items that we'll reference in query results
      cacheMap.set(priKey1, testItems[0]);
      cacheMap.set(priKey2, testItems[1]);

      // Add 10 query results
      for (let i = 0; i < 10; i++) {
        const queryHash = `query-${i}`;
        cacheMap.setQueryResult(queryHash, [priKey1, priKey2]);

        // Verify each result immediately after setting
        const result = await cacheMap.getQueryResult(queryHash);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second

      // Verify all results are still accessible
      for (let i = 0; i < 10; i++) {
        const result = await cacheMap.getQueryResult(`query-${i}`);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
        expect(result![0]).toEqual(priKey1);
        expect(result![1]).toEqual(priKey2);
      }
    });

    it('should handle bulk operations efficiently', async () => {
      const numItems = 10;
      const keys: (PriKey<'test'>)[] = [];
      const items: TestItem[] = [];

      // Prepare test data
      for (let i = 0; i < numItems; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `bulk-item-${i}` as UUID };
        const item: TestItem = { key, id: `${i}`, name: `Bulk Item ${i}`, value: i } as TestItem;
        keys.push(key);
        items.push(item);
      }

      const startTime = Date.now();

      // Bulk set with verification
      for (const item of items) {
        cacheMap.set(item.key, item);
        // Verify each item was stored correctly
        const stored = await cacheMap.get(item.key);
        expect(stored).toEqual(item);
      }

      // Bulk get with verification
      const retrievedItems = await Promise.all(keys.map(async key => await cacheMap.get(key)));
      retrievedItems.forEach((item, index) => {
        expect(item).toEqual(items[index]);
      });

      // Bulk operations on metadata with verification
      const metaNow = Date.now();
      for (let index = 0; index < keys.length; index++) {
        const metadata = {
          addedAt: metaNow - 1000,
          lastAccessedAt: metaNow,
          accessCount: index,
          estimatedSize: 512 * (index + 1),
          key: `bulk-meta-${index}`
        };
        await cacheMap.setMetadata(`bulk-meta-${index}`, metadata);
        // Verify metadata was stored
        const storedMetadata = await cacheMap.getMetadata(`bulk-meta-${index}`);
        expect(storedMetadata).toEqual(metadata);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000); // 2 seconds for bulk operations
      expect(retrievedItems.filter(item => item !== null)).toHaveLength(numItems);
      expect((await cacheMap.getAllMetadata()).size).toBe(numItems);

      // Final verification of all data
      const allKeys = await cacheMap.keys();
      expect(allKeys).toHaveLength(numItems);
      const allMetadata = await cacheMap.getAllMetadata();
      expect(allMetadata.size).toBe(numItems);
    });
  });
});
