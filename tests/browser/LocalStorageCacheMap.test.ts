/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';

// Use localStorage mock from test setup

describe('LocalStorageCacheMap', () => {
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

  let cacheMap: LocalStorageCacheMap<TestItem, 'test', 'container'>;

  beforeEach(() => {
    // Clear storage data directly
    (window.localStorage as any).__resetStore();
    // Also ensure any global state is cleared
    if (globalThis.localStorage) {
      (globalThis.localStorage as any).__resetStore();
    }
    // Clear mocks
    vi.clearAllMocks();
    // Also restore any mocked functions
    vi.restoreAllMocks();

    cacheMap = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'test-cache');
  });

  afterEach(() => {
    // Ensure cleanup after each test
    if (cacheMap) {
      cacheMap.clear();
      cacheMap.clearQueryResults();
    }
    // Reset storage again just to be safe
    (window.localStorage as any).__resetStore();
    if (globalThis.localStorage) {
      (globalThis.localStorage as any).__resetStore();
    }
  });

  describe('Constructor', () => {
    it('should create cache with default prefix', () => {
      const cache = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
      expect(cache).toBeInstanceOf(LocalStorageCacheMap);
    });

    it('should create cache with custom prefix', () => {
      const cache = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'custom-prefix');
      expect(cache).toBeInstanceOf(LocalStorageCacheMap);
    });

    it('should have correct implementationType', () => {
      expect(cacheMap.implementationType).toBe('browser/localStorage');
    });

    it('should provide correct cache information', () => {
      const cacheInfo = cacheMap.getCacheInfo();
      expect(cacheInfo.implementationType).toBe('browser/localStorage');
      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(false);
    });
  });

  describe('Basic Operations', () => {
    describe('set() and get()', () => {
      it('should store and retrieve items by primary key', () => {
        cacheMap.set(priKey1, testItems[0]);
        const retrieved = cacheMap.get(priKey1);

        expect(retrieved).toEqual(testItems[0]);
        expect(window.localStorage.setItem).toHaveBeenCalled();
        expect(window.localStorage.getItem).toHaveBeenCalled();
      });

      it('should store and retrieve items by composite key', () => {
        cacheMap.set(comKey1, testItems[2]);
        const retrieved = cacheMap.get(comKey1);

        expect(retrieved).toEqual(testItems[2]);
      });

      it('should return null for non-existent keys', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };
        const retrieved = cacheMap.get(nonExistentKey);

        expect(retrieved).toBeNull();
      });

      it('should handle JSON serialization correctly', () => {
        cacheMap.set(priKey1, testItems[0]);

        // @ts-ignore
        const setItemCall = window.localStorage.setItem.mock.calls[0];
        const storedData = JSON.parse(setItemCall[1]);

        expect(storedData).toHaveProperty('originalKey');
        expect(storedData).toHaveProperty('value');
        expect(storedData.originalKey).toEqual(priKey1);
        expect(storedData.value).toEqual(testItems[0]);
      });

      it('should overwrite existing items', () => {
        cacheMap.set(priKey1, testItems[0]);

        const updatedItem: TestItem = { key: priKey1, id: '1', name: 'Updated Item 1', value: 999 } as TestItem;
        cacheMap.set(priKey1, updatedItem);

        const retrieved = cacheMap.get(priKey1);
        expect(retrieved).toEqual(updatedItem);
      });
    });

    describe('includesKey()', () => {
      beforeEach(() => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(comKey1, testItems[2]);
      });

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

      it('should verify key collision detection', () => {
        // Test that we actually check the original key, not just hash presence
        expect(cacheMap.includesKey(priKey1)).toBe(true);

        // @ts-ignore
        const getItemCall = window.localStorage.getItem.mock.calls[window.localStorage.getItem.mock.calls.length - 1];
        expect(getItemCall[0]).toContain('test-cache:');
      });
    });

    describe('delete()', () => {
      beforeEach(() => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(priKey2, testItems[1]);
        cacheMap.set(comKey1, testItems[2]);
      });

      it('should remove items by primary key', () => {
        expect(cacheMap.includesKey(priKey1)).toBe(true);
        cacheMap.delete(priKey1);

        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.get(priKey1)).toBeNull();
        expect(window.localStorage.removeItem).toHaveBeenCalled();
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
      });
    });

    describe('keys() and values()', () => {
      beforeEach(() => {
        testItems.forEach(item => cacheMap.set(item.key, item));
      });

      it('should return all keys', () => {
        const keys = cacheMap.keys();

        expect(keys).toHaveLength(3);
        expect(keys.some(k => JSON.stringify(k) === JSON.stringify(priKey1))).toBe(true);
        expect(keys.some(k => JSON.stringify(k) === JSON.stringify(priKey2))).toBe(true);
        expect(keys.some(k => JSON.stringify(k) === JSON.stringify(comKey1))).toBe(true);
      });

      it('should return all values', () => {
        const values = cacheMap.values();

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

      it('should remove all cache items from localStorage', () => {
        expect(cacheMap.keys()).toHaveLength(3);

        cacheMap.clear();

        expect(cacheMap.keys()).toHaveLength(0);
        expect(cacheMap.values()).toHaveLength(0);
      });

      it('should only remove items with the cache prefix', () => {
        // Add some non-cache items to localStorage
        window.localStorage.setItem('other-app:data', 'should not be deleted');
        window.localStorage.setItem('user-setting', 'should not be deleted');

        cacheMap.clear();

        // Non-cache items should remain
        expect(window.localStorage.getItem('other-app:data')).toBe('should not be deleted');
        expect(window.localStorage.getItem('user-setting')).toBe('should not be deleted');
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

        expect(items).toHaveLength(3);
        expect(items).toEqual(expect.arrayContaining(testItems));
      });

      it('should return items in specific location', () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
        const items = cacheMap.allIn(location);

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual(testItems[2]);
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
      it('should return true when items match query', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Item 1').toQuery();
        const result = cacheMap.contains(query, []);

        expect(result).toBe(true);
      });

      it('should return false when no items match query', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent Item').toQuery();
        const result = cacheMap.contains(query, []);

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

      it('should return empty array when no items match', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Non-existent').toQuery();
        const items = cacheMap.queryIn(query, []);

        expect(items).toHaveLength(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage setItem errors gracefully', () => {
      // Mock localStorage.setItem to throw an error (e.g., quota exceeded)
      // @ts-ignore
      window.localStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => {
        cacheMap.set(priKey1, testItems[0]);
      }).toThrow('Failed to store item in localStorage');
    });

    it('should handle localStorage getItem errors gracefully', () => {
      // Mock localStorage.getItem to throw an error
      // @ts-ignore
      window.localStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      const result = cacheMap.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      // Manually set invalid JSON in localStorage
      // @ts-ignore
      window.localStorage.setItem.mockImplementationOnce((key: string, value: string) => {
        window.localStorage.store = { ...window.localStorage.store, [key]: 'invalid json' };
      });

      // @ts-ignore
      window.localStorage.getItem.mockImplementationOnce((key: string) => {
        return 'invalid json';
      });

      cacheMap.set(priKey1, testItems[0]);
      const result = cacheMap.get(priKey1);

      expect(result).toBeNull();
    });

    it('should handle missing originalKey in stored data', () => {
      // Mock storage data without originalKey
      const invalidData = JSON.stringify({ value: testItems[0] });
      // @ts-ignore
      window.localStorage.getItem.mockReturnValueOnce(invalidData);

      const result = cacheMap.get(priKey1);
      expect(result).toBeNull();
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

      // Number 123 should overwrite string '123' due to normalization
      expect(cacheMap.get(stringKey)).toEqual(item2);
      expect(cacheMap.get(numberKey)).toEqual(item2);
    });
  });

  describe('clone()', () => {
    beforeEach(() => {
      testItems.forEach(item => cacheMap.set(item.key, item));
    });

    it('should create a new instance sharing the same localStorage', () => {
      const cloned = cacheMap.clone();

      expect(cloned).toBeInstanceOf(LocalStorageCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should share data through localStorage', () => {
      const cloned = cacheMap.clone();

      // Clone should see the same data
      expect(cloned.keys()).toHaveLength(3);
      expect(cloned.get(priKey1)).toEqual(testItems[0]);
    });

    it('should share modifications through localStorage', () => {
      const cloned = cacheMap.clone();

      // Modify through clone
      const newItem: TestItem = { key: { kt: 'test', pk: 'new' as UUID }, id: 'new', name: 'New Item', value: 999 } as TestItem;
      cloned.set(newItem.key, newItem);

      // Original should see the change
      expect(cacheMap.get(newItem.key)).toEqual(newItem);
    });
  });

  describe('Prefix Isolation', () => {
    it('should isolate caches with different prefixes', () => {
      const cache1 = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      cache1.set(priKey1, testItems[0]);
      cache2.set(priKey1, testItems[1]);

      expect(cache1.get(priKey1)).toEqual(testItems[0]);
      expect(cache2.get(priKey1)).toEqual(testItems[1]);

      expect(cache1.keys()).toHaveLength(1);
      expect(cache2.keys()).toHaveLength(1);
    });

    it('should not affect other prefixes when clearing', () => {
      const cache1 = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      cache1.set(priKey1, testItems[0]);
      cache2.set(priKey1, testItems[1]);

      cache1.clear();

      expect(cache1.keys()).toHaveLength(0);
      expect(cache2.keys()).toHaveLength(1);
      expect(cache2.get(priKey1)).toEqual(testItems[1]);
    });
  });

  describe('TTL Operations', () => {
    describe('getWithTTL()', () => {
      beforeEach(() => {
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(comKey1, testItems[2]);
      });

      it('should return item when within TTL', () => {
        const ttl = 5000; // 5 seconds
        const result = cacheMap.getWithTTL(priKey1, ttl);

        expect(result).toEqual(testItems[0]);
      });

      it('should return null when TTL is 0 (caching disabled)', () => {
        const result = cacheMap.getWithTTL(priKey1, 0);

        expect(result).toBeNull();
      });

      it('should return null when item has expired', () => {
        // Mock Date.now to simulate time passing
        const originalNow = Date.now;
        const baseTime = 1000000;

        // Set item at base time
        Date.now = vi.fn().mockReturnValue(baseTime);
        cacheMap.set(priKey2, testItems[1]);

        // Check after TTL has passed
        const ttl = 1000; // 1 second
        Date.now = vi.fn().mockReturnValue(baseTime + ttl + 1);

        const result = cacheMap.getWithTTL(priKey2, ttl);

        expect(result).toBeNull();

        // Restore original Date.now
        Date.now = originalNow;
      });

      it('should remove expired items from localStorage', () => {
        const originalNow = Date.now;
        const baseTime = 1000000;

        // Set item at base time
        Date.now = vi.fn().mockReturnValue(baseTime);
        cacheMap.set(priKey2, testItems[1]);

        // Check after TTL has passed
        const ttl = 1000;
        Date.now = vi.fn().mockReturnValue(baseTime + ttl + 1);

        cacheMap.getWithTTL(priKey2, ttl);

        // Item should be removed from storage
        expect(cacheMap.includesKey(priKey2)).toBe(false);

        Date.now = originalNow;
      });

      it('should work with composite keys', () => {
        const ttl = 5000;
        const result = cacheMap.getWithTTL(comKey1, ttl);

        expect(result).toEqual(testItems[2]);
      });

      it('should handle localStorage errors gracefully', () => {
        // @ts-ignore
        window.localStorage.getItem.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toBeNull();
      });

      it('should verify key collision detection in TTL retrieval', () => {
        const originalNow = Date.now;
        Date.now = vi.fn().mockReturnValue(1000000);

        cacheMap.set(priKey1, testItems[0]);

        // Mock stored data with different original key
        const differentKey: PriKey<'test'> = { kt: 'test', pk: 'different' as UUID };
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce(JSON.stringify({
          originalKey: differentKey,
          value: testItems[0],
          timestamp: 1000000
        }));

        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toBeNull();

        Date.now = originalNow;
      });

      it('should handle missing timestamp in stored data', () => {
        // Mock stored data without timestamp
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce(JSON.stringify({
          originalKey: priKey1,
          value: testItems[0]
        }));

        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toEqual(testItems[0]);
      });
    });
  });

  describe('Query Result Caching', () => {
    const queryHash1 = 'test-query-hash-1';
    const queryHash2 = 'test-query-hash-2';
    const itemKeys = [priKey1, priKey2, comKey1];

    describe('setQueryResult() and getQueryResult()', () => {
      it('should store and retrieve query results', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        const retrieved = cacheMap.getQueryResult(queryHash1);

        expect(retrieved).toEqual(itemKeys);
        expect(window.localStorage.setItem).toHaveBeenCalled();
        expect(window.localStorage.getItem).toHaveBeenCalled();
      });

      it('should return null for non-existent query hash', () => {
        const result = cacheMap.getQueryResult('non-existent-hash');
        expect(result).toBeNull();
      });

      it('should handle empty item keys array', () => {
        cacheMap.setQueryResult(queryHash1, []);
        const retrieved = cacheMap.getQueryResult(queryHash1);

        expect(retrieved).toEqual([]);
      });

      it('should use correct storage key format for queries', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);

        // @ts-ignore
        const setItemCall = window.localStorage.setItem.mock.calls.find(call =>
          call[0].includes(':query:')
        );

        expect(setItemCall[0]).toBe('test-cache:query:' + queryHash1);
      });

      it('should store query results with TTL', () => {
        const ttl = 5000;
        const originalNow = Date.now;
        Date.now = vi.fn().mockReturnValue(1000000);

        cacheMap.setQueryResult(queryHash1, itemKeys, ttl);

        // @ts-ignore
        const setItemCall = window.localStorage.setItem.mock.calls.find(call =>
          call[0].includes(':query:')
        );
        const storedData = JSON.parse(setItemCall[1]);

        expect(storedData).toHaveProperty('itemKeys');
        expect(storedData).toHaveProperty('expiresAt');
        expect(storedData.itemKeys).toEqual(itemKeys);
        expect(storedData.expiresAt).toBe(1000000 + ttl);

        Date.now = originalNow;
      });

      it('should expire query results with TTL', () => {
        const ttl = 1000;
        const originalNow = Date.now;
        const baseTime = 1000000;

        // Set query result at base time
        Date.now = vi.fn().mockReturnValue(baseTime);
        cacheMap.setQueryResult(queryHash1, itemKeys, ttl);

        // Check after TTL has passed
        Date.now = vi.fn().mockReturnValue(baseTime + ttl + 1);
        const result = cacheMap.getQueryResult(queryHash1);

        expect(result).toBeNull();
        expect(window.localStorage.removeItem).toHaveBeenCalled();

        Date.now = originalNow;
      });

      it('should handle old format query results (array only)', () => {
        // Mock old format data (just array, no expiration)
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce(JSON.stringify(itemKeys));

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should handle malformed entry format', () => {
        // Mock malformed data
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce(JSON.stringify({
          someOtherProperty: 'value'
        }));

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });
    });

    describe('hasQueryResult()', () => {
      beforeEach(() => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
      });

      it('should return true for existing query results', () => {
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);
      });

      it('should return false for non-existent query results', () => {
        expect(cacheMap.hasQueryResult('non-existent')).toBe(false);
      });

      it('should return false for expired query results', () => {
        const ttl = 1000;
        const originalNow = Date.now;
        const baseTime = 1000000;

        Date.now = vi.fn().mockReturnValue(baseTime);
        cacheMap.setQueryResult(queryHash2, itemKeys, ttl);

        // Check after expiration
        Date.now = vi.fn().mockReturnValue(baseTime + ttl + 1);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(false);

        Date.now = originalNow;
      });
    });

    describe('deleteQueryResult()', () => {
      beforeEach(() => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        cacheMap.setQueryResult(queryHash2, [priKey1]);
      });

      it('should delete specific query results', () => {
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);

        cacheMap.deleteQueryResult(queryHash1);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(window.localStorage.removeItem).toHaveBeenCalled();
      });

      it('should not affect other query results', () => {
        cacheMap.deleteQueryResult(queryHash1);

        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);
        expect(cacheMap.getQueryResult(queryHash2)).toEqual([priKey1]);
      });

      it('should handle localStorage errors gracefully', () => {
        // @ts-ignore
        window.localStorage.removeItem.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        // Should not throw
        expect(() => cacheMap.deleteQueryResult(queryHash1)).not.toThrow();
      });
    });

    describe('clearQueryResults()', () => {
      beforeEach(() => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        cacheMap.setQueryResult(queryHash2, [priKey1]);

        // Add some non-query items
        window.localStorage.setItem('other-app:data', 'should not be deleted');
        window.localStorage.setItem('test-cache:regular-item', 'should not be deleted');
      });

      it('should clear all query results', () => {
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);

        cacheMap.clearQueryResults();

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(false);
      });

      it('should only remove query-prefixed items', () => {
        cacheMap.clearQueryResults();

        // Non-query items should remain
        expect(window.localStorage.getItem('other-app:data')).toBe('should not be deleted');
        expect(window.localStorage.getItem('test-cache:regular-item')).toBe('should not be deleted');
      });

      it('should handle localStorage errors gracefully', () => {
        // @ts-ignore
        window.localStorage.key.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        // Should not throw
        expect(() => cacheMap.clearQueryResults()).not.toThrow();
      });
    });

    describe('Query result error handling', () => {
      it('should handle localStorage errors in setQueryResult', () => {
        // @ts-ignore
        window.localStorage.setItem.mockImplementationOnce(() => {
          throw new Error('QuotaExceededError');
        });

        // Should not throw
        expect(() => cacheMap.setQueryResult(queryHash1, itemKeys)).not.toThrow();
      });

      it('should handle localStorage errors in getQueryResult', () => {
        // @ts-ignore
        window.localStorage.getItem.mockImplementationOnce(() => {
          throw new Error('Storage error');
        });

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });

      it('should handle invalid JSON in getQueryResult', () => {
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce('invalid json');

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });
    });
  });

  describe('Advanced Error Handling and Edge Cases', () => {
    describe('Storage key collision handling', () => {
      it('should handle hash collisions properly in get operations', () => {
        // Mock the hash function to create a collision
        const originalGet = cacheMap.get;
        cacheMap.set(priKey1, testItems[0]);

        // Mock localStorage to return data for a different key
        const differentKey: PriKey<'test'> = { kt: 'test', pk: 'different' as UUID };
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce(JSON.stringify({
          originalKey: differentKey,
          value: testItems[1],
          timestamp: Date.now()
        }));

        const result = cacheMap.get(priKey1);
        expect(result).toBeNull(); // Should return null due to key mismatch
      });

      it('should handle hash collisions in includesKey operations', () => {
        cacheMap.set(priKey1, testItems[0]);

        // Mock localStorage to return data for a different key
        const differentKey: PriKey<'test'> = { kt: 'test', pk: 'different' as UUID };
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce(JSON.stringify({
          originalKey: differentKey,
          value: testItems[1]
        }));

        const result = cacheMap.includesKey(priKey1);
        expect(result).toBe(false); // Should return false due to key mismatch
      });
    });

    describe('Data corruption handling', () => {
      it('should handle corrupt JSON in regular get operations', () => {
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce('{ invalid json');

        const result = cacheMap.get(priKey1);
        expect(result).toBeNull();
      });

      it('should handle corrupt JSON in includesKey operations', () => {
        // @ts-ignore
        window.localStorage.getItem.mockReturnValueOnce('{ invalid json');

        const result = cacheMap.includesKey(priKey1);
        expect(result).toBe(false);
      });

      it('should handle corrupt JSON in keys() operation', () => {
        // Set up valid item first
        cacheMap.set(priKey1, testItems[0]);

        // Mock localStorage.getItem to return invalid JSON for one call
        const storage = (window.localStorage as any).store;
        let callCount = 0;
        // @ts-ignore
        window.localStorage.getItem.mockImplementation((key: string) => {
          callCount++;
          if (callCount === 2) { // Second call returns invalid JSON
            return '{ invalid json';
          }
          return storage[key] || null;
        });

        const keys = cacheMap.keys();
        // Should handle the error gracefully and continue processing
        expect(Array.isArray(keys)).toBe(true);
      });

      it('should handle corrupt JSON in values() operation', () => {
        cacheMap.set(priKey1, testItems[0]);

        const storage = (window.localStorage as any).store;
        let callCount = 0;
        // @ts-ignore
        window.localStorage.getItem.mockImplementation((key: string) => {
          callCount++;
          if (callCount === 2) {
            return '{ invalid json';
          }
          return storage[key] || null;
        });

        const values = cacheMap.values();
        expect(Array.isArray(values)).toBe(true);
      });
    });

    describe('localStorage capacity and quota handling', () => {
      it('should handle quota exceeded error gracefully by falling back to memory cache', () => {
        // @ts-ignore
        window.localStorage.setItem.mockImplementationOnce(() => {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        });

        // Should not throw error, should handle gracefully
        expect(() => {
          cacheMap.set(priKey1, testItems[0]);
        }).not.toThrow();

        // Verify item was stored (either after cleanup retry or in fallback cache)
        const retrieved = cacheMap.get(priKey1);
        expect(retrieved).toEqual(testItems[0]);
      });

      it('should handle other localStorage setItem errors', () => {
        // @ts-ignore
        window.localStorage.setItem.mockImplementationOnce(() => {
          throw new Error('Some other storage error');
        });

        expect(() => {
          cacheMap.set(priKey1, testItems[0]);
        }).toThrow('Failed to store item in localStorage: Error: Some other storage error');
      });
    });

    describe('Boundary conditions', () => {
      it('should handle very long key values', () => {
        const longKey: PriKey<'test'> = {
          kt: 'test',
          pk: 'a'.repeat(1000) as UUID
        };
        const item: TestItem = {
          key: longKey,
          id: 'long',
          name: 'Long Key Item',
          value: 999
        } as TestItem;

        cacheMap.set(longKey, item);
        const retrieved = cacheMap.get(longKey);
        expect(retrieved).toEqual(item);
      });

      it('should handle items with very large data', () => {
        const largeItem: TestItem = {
          key: priKey1,
          id: '1',
          name: 'x'.repeat(10000),
          value: 100
        } as TestItem;

        // Test should not throw when storing and retrieving large data
        cacheMap.set(priKey1, largeItem);
        const retrieved = cacheMap.get(priKey1);
        expect(retrieved).toEqual(largeItem);
      });

      it('should handle null and undefined values in item data', () => {
        const itemWithNulls = {
          key: priKey1,
          id: '1',
          name: null,
          extraField: null
        } as any;

        cacheMap.set(priKey1, itemWithNulls);
        const retrieved = cacheMap.get(priKey1);

        // JSON.stringify/parse handles null values correctly
        expect(retrieved?.name).toBeNull();
        expect(retrieved?.extraField).toBeNull();

        // Also test that the item is properly retrieved
        expect(retrieved).toEqual(itemWithNulls);
      });
    });

    describe('Concurrent access simulation', () => {
      it('should handle rapid successive operations', () => {
        // Simulate rapid fire operations
        for (let i = 0; i < 100; i++) {
          const key: PriKey<'test'> = { kt: 'test', pk: `rapid-${i}` as UUID };
          const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i } as TestItem;

          cacheMap.set(key, item);
          expect(cacheMap.get(key)).toEqual(item);
          expect(cacheMap.includesKey(key)).toBe(true);
        }

        expect(cacheMap.keys()).toHaveLength(100);
      });

      it('should handle mixed operation types', () => {
        // Ensure completely clean state
        cacheMap.clear();
        cacheMap.clearQueryResults();

        // Mix of different operations
        cacheMap.set(priKey1, testItems[0]);
        expect(cacheMap.includesKey(priKey1)).toBe(true);

        cacheMap.setQueryResult('test-query', [priKey1]);
        expect(cacheMap.hasQueryResult('test-query')).toBe(true);

        cacheMap.set(priKey2, testItems[1]);
        expect(cacheMap.keys()).toHaveLength(2);

        cacheMap.delete(priKey1);
        expect(cacheMap.keys()).toHaveLength(1);

        cacheMap.clear();
        expect(cacheMap.keys()).toHaveLength(0);

        // Query results should still exist (separate from regular cache)
        expect(cacheMap.hasQueryResult('test-query')).toBe(true);
      });
    });

    describe('Memory and performance edge cases', () => {
      it('should handle empty storage state', () => {
        // Start with completely empty localStorage
        (window.localStorage as any).__resetStore();

        expect(cacheMap.keys()).toHaveLength(0);
        expect(cacheMap.values()).toHaveLength(0);
        expect(cacheMap.get(priKey1)).toBeNull();
        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.getQueryResult('any-query')).toBeNull();
        expect(cacheMap.hasQueryResult('any-query')).toBe(false);
      });

      it('should handle cache prefix edge cases', () => {
        // Test with empty prefix
        const emptyPrefixCache = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], '');
        emptyPrefixCache.set(priKey1, testItems[0]);
        expect(emptyPrefixCache.get(priKey1)).toEqual(testItems[0]);

        // Test with special characters in prefix
        const specialPrefixCache = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'special:prefix@#$');
        specialPrefixCache.set(priKey1, testItems[0]);
        expect(specialPrefixCache.get(priKey1)).toEqual(testItems[0]);
      });
    });

    describe('localStorage mock edge cases', () => {
      it('should handle localStorage.key() returning null', () => {
        // @ts-ignore
        window.localStorage.key.mockReturnValueOnce(null);

        const keys = cacheMap.keys();
        expect(Array.isArray(keys)).toBe(true);
      });

      it('should handle localStorage.length being 0', () => {
        // @ts-ignore
        Object.defineProperty(window.localStorage, 'length', { value: 0 });

        const keys = cacheMap.keys();
        expect(keys).toHaveLength(0);
      });

      it('should handle localStorage methods throwing unexpected errors', () => {
        // @ts-ignore
        window.localStorage.key.mockImplementationOnce(() => {
          throw new Error('Unexpected error');
        });

        expect(() => cacheMap.keys()).not.toThrow();
        expect(() => cacheMap.values()).not.toThrow();
        expect(() => cacheMap.clear()).not.toThrow();
      });
    });
  });
});
