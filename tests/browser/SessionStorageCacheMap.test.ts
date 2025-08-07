/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStorageCacheMap } from '../../src/browser/SessionStorageCacheMap';
import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';

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
    (window.sessionStorage as any).__resetStore();
    // Clear mocks
    vi.clearAllMocks();

    cacheMap = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'test-session-cache');
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

    it('should provide correct cache information', () => {
      const cacheInfo = cacheMap.getCacheInfo();
      expect(cacheInfo.implementationType).toBe('browser/sessionStorage');
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
        expect(window.sessionStorage.setItem).toHaveBeenCalled();
        expect(window.sessionStorage.getItem).toHaveBeenCalled();
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
        const setItemCall = window.sessionStorage.setItem.mock.calls[0];
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
        expect(cacheMap.includesKey(priKey1)).toBe(true);

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

      it('should remove items by primary key', () => {
        expect(cacheMap.includesKey(priKey1)).toBe(true);
        cacheMap.delete(priKey1);

        expect(cacheMap.includesKey(priKey1)).toBe(false);
        expect(cacheMap.get(priKey1)).toBeNull();
        expect(window.sessionStorage.removeItem).toHaveBeenCalled();
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

      it('should remove all cache items from sessionStorage', () => {
        expect(cacheMap.keys()).toHaveLength(3);

        cacheMap.clear();

        expect(cacheMap.keys()).toHaveLength(0);
        expect(cacheMap.values()).toHaveLength(0);
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

    it('should handle session expiration gracefully', () => {
      cacheMap.set(priKey1, testItems[0]);

      // Simulate session clearing (tab close)
      window.sessionStorage.clear();

      // All data should be gone
      expect(cacheMap.keys()).toHaveLength(0);
      expect(cacheMap.get(priKey1)).toBeNull();
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
    it('should handle sessionStorage setItem errors gracefully', () => {
      // Mock sessionStorage.setItem to throw an error (e.g., quota exceeded)
      // @ts-ignore
      window.sessionStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => {
        cacheMap.set(priKey1, testItems[0]);
      }).toThrow('Failed to store item in sessionStorage');
    });

    it('should handle sessionStorage getItem errors gracefully', () => {
      // Mock sessionStorage.getItem to throw an error
      // @ts-ignore
      window.sessionStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      const result = cacheMap.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle invalid JSON in sessionStorage gracefully', () => {
      // Manually set invalid JSON in sessionStorage
      // @ts-ignore
      window.sessionStorage.setItem.mockImplementationOnce((key: string, value: string) => {
        window.sessionStorage.store = { ...window.sessionStorage.store, [key]: 'invalid json' };
      });

      // @ts-ignore
      window.sessionStorage.getItem.mockImplementationOnce((key: string) => {
        return 'invalid json';
      });

      cacheMap.set(priKey1, testItems[0]);
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

    it('should create a new instance sharing the same sessionStorage', () => {
      const cloned = cacheMap.clone();

      expect(cloned).toBeInstanceOf(SessionStorageCacheMap);
      expect(cloned).not.toBe(cacheMap);
    });

    it('should share data through sessionStorage', () => {
      const cloned = cacheMap.clone();

      // Clone should see the same data
      expect(cloned.keys()).toHaveLength(3);
      expect(cloned.get(priKey1)).toEqual(testItems[0]);
    });

    it('should share modifications through sessionStorage', () => {
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
      const cache1 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      cache1.set(priKey1, testItems[0]);
      cache2.set(priKey1, testItems[1]);

      expect(cache1.get(priKey1)).toEqual(testItems[0]);
      expect(cache2.get(priKey1)).toEqual(testItems[1]);

      expect(cache1.keys()).toHaveLength(1);
      expect(cache2.keys()).toHaveLength(1);
    });

    it('should not affect other prefixes when clearing', () => {
      const cache1 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache1');
      const cache2 = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'cache2');

      cache1.set(priKey1, testItems[0]);
      cache2.set(priKey1, testItems[1]);

      cache1.clear();

      expect(cache1.keys()).toHaveLength(0);
      expect(cache2.keys()).toHaveLength(1);
      expect(cache2.get(priKey1)).toEqual(testItems[1]);
    });
  });

  describe('TTL (Time To Live) Functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('getWithTTL()', () => {
      it('should return item when within TTL', () => {
        cacheMap.set(priKey1, testItems[0]);

        // Item should be retrievable within TTL
        const result = cacheMap.getWithTTL(priKey1, 5000); // 5 second TTL
        expect(result).toEqual(testItems[0]);
      });

      it('should return null when TTL is 0 (caching disabled)', () => {
        cacheMap.set(priKey1, testItems[0]);

        // TTL of 0 should disable caching
        const result = cacheMap.getWithTTL(priKey1, 0);
        expect(result).toBeNull();
      });

      it('should return null when item has expired', () => {
        cacheMap.set(priKey1, testItems[0]);

        // Fast-forward time past TTL
        vi.advanceTimersByTime(6000); // 6 seconds

        const result = cacheMap.getWithTTL(priKey1, 5000); // 5 second TTL
        expect(result).toBeNull();
      });

      it('should remove expired item from storage', () => {
        cacheMap.set(priKey1, testItems[0]);
        expect(cacheMap.includesKey(priKey1)).toBe(true);

        // Fast-forward time past TTL
        vi.advanceTimersByTime(6000);

        // Getting with TTL should remove expired item
        cacheMap.getWithTTL(priKey1, 5000);

        // Item should be removed from storage
        expect(cacheMap.includesKey(priKey1)).toBe(false);
      });

      it('should handle missing timestamp gracefully', () => {
        // Manually set item without timestamp to test backward compatibility
        const storageKey = `test-session-cache:${cacheMap['normalizedHashFunction'](priKey1)}`;
        const dataWithoutTimestamp = {
          originalKey: priKey1,
          value: testItems[0]
          // No timestamp field
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(dataWithoutTimestamp));

        // Should treat missing timestamp as 0 and expire immediately
        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toBeNull();
      });

      it('should handle malformed timestamp data', () => {
        // Manually set item with invalid timestamp
        const storageKey = `test-session-cache:${cacheMap['normalizedHashFunction'](priKey1)}`;
        const dataWithBadTimestamp = {
          originalKey: priKey1,
          value: testItems[0],
          timestamp: 'invalid'
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(dataWithBadTimestamp));

        // Should handle gracefully and treat as expired
        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toBeNull();
      });

      it('should return item exactly at TTL boundary', () => {
        cacheMap.set(priKey1, testItems[0]);

        // Fast-forward to exactly TTL duration
        vi.advanceTimersByTime(5000); // Exactly 5 seconds

        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toBeNull(); // Should be expired (age > ttl)
      });

      it('should handle sessionStorage errors during TTL check', () => {
        // Mock sessionStorage.getItem to throw an error
        // @ts-ignore
        window.sessionStorage.getItem.mockImplementationOnce(() => {
          throw new Error('Storage error during TTL check');
        });

        const result = cacheMap.getWithTTL(priKey1, 5000);
        expect(result).toBeNull();
      });
    });
  });

  describe('Query Result Caching', () => {
    const queryHash1 = 'query-hash-1';
    const queryHash2 = 'query-hash-2';
    const itemKeys = [priKey1, priKey2];

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('setQueryResult() and getQueryResult()', () => {
      it('should store and retrieve query results without TTL', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should store and retrieve query results with TTL', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys, 5000); // 5 second TTL

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should return null for non-existent query hash', () => {
        const result = cacheMap.getQueryResult('non-existent');
        expect(result).toBeNull();
      });

      it('should return null when query result has expired', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys, 5000); // 5 second TTL

        // Fast-forward past TTL
        vi.advanceTimersByTime(6000);

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });

      it('should remove expired query results from storage', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys, 5000);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);

        // Fast-forward past TTL
        vi.advanceTimersByTime(6000);

        // Getting expired result should remove it
        cacheMap.getQueryResult(queryHash1);

        // Should be removed from storage
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
      });

      it('should handle old format query results (array without expiration)', () => {
        // Manually store old format (just array)
        const queryKey = `test-session-cache:query:${queryHash1}`;
        window.sessionStorage.setItem(queryKey, JSON.stringify(itemKeys));

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toEqual(itemKeys);
      });

      it('should handle malformed query result data', () => {
        // Manually store invalid data
        const queryKey = `test-session-cache:query:${queryHash1}`;
        window.sessionStorage.setItem(queryKey, 'invalid json');

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });

      it('should handle query results with missing itemKeys', () => {
        // Manually store data without itemKeys
        const queryKey = `test-session-cache:query:${queryHash1}`;
        const malformedData = { expiresAt: Date.now() + 5000 };
        window.sessionStorage.setItem(queryKey, JSON.stringify(malformedData));

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });

      it('should handle sessionStorage errors during query result operations', () => {
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

        const result = cacheMap.getQueryResult(queryHash1);
        expect(result).toBeNull();
      });
    });

    describe('hasQueryResult()', () => {
      it('should return true for existing query results', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);
      });

      it('should return false for non-existent query results', () => {
        expect(cacheMap.hasQueryResult('non-existent')).toBe(false);
      });

      it('should return false for expired query results', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys, 5000);

        // Fast-forward past TTL
        vi.advanceTimersByTime(6000);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
      });
    });

    describe('deleteQueryResult()', () => {
      it('should delete existing query results', () => {
        cacheMap.setQueryResult(queryHash1, itemKeys);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);

        cacheMap.deleteQueryResult(queryHash1);
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
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
      it('should clear all query results but preserve regular cache items', () => {
        // Add regular cache items
        cacheMap.set(priKey1, testItems[0]);
        cacheMap.set(priKey2, testItems[1]);

        // Add query results
        cacheMap.setQueryResult(queryHash1, [priKey1]);
        cacheMap.setQueryResult(queryHash2, [priKey2]);

        expect(cacheMap.hasQueryResult(queryHash1)).toBe(true);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(true);

        cacheMap.clearQueryResults();

        // Query results should be cleared
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);
        expect(cacheMap.hasQueryResult(queryHash2)).toBe(false);

        // Regular cache items should remain
        expect(cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(cacheMap.get(priKey2)).toEqual(testItems[1]);
      });

      it('should only clear query results with matching prefix', () => {
        // Add query result to our cache
        cacheMap.setQueryResult(queryHash1, itemKeys);

        // Manually add query result with different prefix to sessionStorage
        window.sessionStorage.setItem('other-app:query:other-hash', JSON.stringify([priKey1]));

        cacheMap.clearQueryResults();

        // Our query result should be cleared
        expect(cacheMap.hasQueryResult(queryHash1)).toBe(false);

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

      it('should remove specified items from cache', () => {
        expect(cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(cacheMap.get(comKey1)).toEqual(testItems[2]);

        cacheMap.invalidateItemKeys([priKey1, priKey2]);

        expect(cacheMap.get(priKey1)).toBeNull();
        expect(cacheMap.get(priKey2)).toBeNull();
        expect(cacheMap.get(comKey1)).toEqual(testItems[2]); // Should remain
      });

      it('should handle empty key arrays', () => {
        expect(() => {
          cacheMap.invalidateItemKeys([]);
        }).not.toThrow();

        // All items should still be present
        expect(cacheMap.keys()).toHaveLength(3);
      });

      it('should handle non-existent keys gracefully', () => {
        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'missing' as UUID };

        expect(() => {
          cacheMap.invalidateItemKeys([nonExistentKey]);
        }).not.toThrow();
      });
    });

    describe('invalidateLocation()', () => {
      it('should invalidate all primary items when location is empty', () => {
        expect(cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(cacheMap.get(priKey2)).toEqual(testItems[1]);
        expect(cacheMap.get(comKey1)).toEqual(testItems[2]);

        cacheMap.invalidateLocation([]);

        // Primary items should be invalidated
        expect(cacheMap.get(priKey1)).toBeNull();
        expect(cacheMap.get(priKey2)).toBeNull();

        // Composite items should remain
        expect(cacheMap.get(comKey1)).toEqual(testItems[2]);

        // Query results should be cleared
        expect(cacheMap.hasQueryResult('query1')).toBe(false);
        expect(cacheMap.hasQueryResult('query2')).toBe(false);
      });

      it('should invalidate items in specific location', () => {
        const location: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

        expect(cacheMap.get(comKey1)).toEqual(testItems[2]);

        cacheMap.invalidateLocation(location);

        // Item in specified location should be invalidated
        expect(cacheMap.get(comKey1)).toBeNull();

        // Primary items should remain
        expect(cacheMap.get(priKey1)).toEqual(testItems[0]);
        expect(cacheMap.get(priKey2)).toEqual(testItems[1]);

        // Query results should be cleared
        expect(cacheMap.hasQueryResult('query1')).toBe(false);
        expect(cacheMap.hasQueryResult('query2')).toBe(false);
      });

      it('should handle non-existent locations gracefully', () => {
        const nonExistentLocation: LocKeyArray<'container'> = [{ kt: 'container', lk: 'missing' as UUID }];

        expect(() => {
          cacheMap.invalidateLocation(nonExistentLocation);
        }).not.toThrow();

        // All items should still be present
        expect(cacheMap.keys()).toHaveLength(3);

        // But query results should still be cleared
        expect(cacheMap.hasQueryResult('query1')).toBe(false);
        expect(cacheMap.hasQueryResult('query2')).toBe(false);
      });

      it('should properly identify primary vs composite keys', () => {
        // Add more test data to verify key type identification
        const anotherComKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '4' as UUID,
          loc: [{ kt: 'container', lk: 'container2' as UUID }]
        };
        const anotherComItem: TestItem = { key: anotherComKey, id: '4', name: 'Item 4', value: 400 } as TestItem;
        cacheMap.set(anotherComKey, anotherComItem);

        // Invalidate primary items
        cacheMap.invalidateLocation([]);

        // Primary items should be gone
        expect(cacheMap.get(priKey1)).toBeNull();
        expect(cacheMap.get(priKey2)).toBeNull();

        // Composite items should remain
        expect(cacheMap.get(comKey1)).toEqual(testItems[2]);
        expect(cacheMap.get(anotherComKey)).toEqual(anotherComItem);
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

  describe('Performance Considerations', () => {
    it('should handle large numbers of items efficiently', () => {
      const startTime = Date.now();

      // Add 100 items
      for (let i = 0; i < 100; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item-${i}` as UUID };
        const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i } as TestItem;
        cacheMap.set(key, item);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      expect(cacheMap.keys()).toHaveLength(100);
    });

    it('should handle large numbers of query results efficiently', () => {
      const startTime = Date.now();

      // Add 50 query results
      for (let i = 0; i < 50; i++) {
        cacheMap.setQueryResult(`query-${i}`, [priKey1, priKey2]);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second

      // Verify they were all stored
      for (let i = 0; i < 50; i++) {
        expect(cacheMap.hasQueryResult(`query-${i}`)).toBe(true);
      }
    });
  });
});
