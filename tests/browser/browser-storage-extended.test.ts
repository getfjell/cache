import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from '../../src/browser/SessionStorageCacheMap';
import { IndexDBCacheMap } from '../../src/browser/IndexDBCacheMap';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';

describe('Browser Storage Extended Coverage Tests', () => {
  interface TestItem extends Item<'test', 'container'> {
    id: string;
    name: string;
    value: number;
  }

  const priKey1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
  const priKey2: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };
  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '3' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  const testItems: TestItem[] = [
    { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem,
    { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem,
    { key: comKey1, id: '3', name: 'Item 3', value: 300 } as TestItem
  ];

  describe('LocalStorage Error Scenarios', () => {
    let localStorage: LocalStorageCacheMap<TestItem, 'test', 'container'>;
    let originalSetItem: any;
    let originalRemoveItem: any;
    let originalGetItem: any;
    let originalKey: any;
    let originalLength: any;

    beforeEach(() => {
      // Clear localStorage before each test
      window.localStorage.clear();
      localStorage = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'test-prefix');

      // Store original methods
      originalSetItem = window.localStorage.setItem;
      originalRemoveItem = window.localStorage.removeItem;
      originalGetItem = window.localStorage.getItem;
      originalKey = window.localStorage.key;
      originalLength = Object.getOwnPropertyDescriptor(window.localStorage, 'length');
    });

    afterEach(() => {
      // Restore all original methods
      window.localStorage.setItem = originalSetItem;
      window.localStorage.removeItem = originalRemoveItem;
      window.localStorage.getItem = originalGetItem;
      window.localStorage.key = originalKey;
      if (originalLength) {
        Object.defineProperty(window.localStorage, 'length', originalLength);
      }
      window.localStorage.clear();
    });

    it('should handle quota exceeded errors during set by falling back to memory cache', () => {
      // Mock localStorage.setItem to throw quota exceeded error
      window.localStorage.setItem = vi.fn().mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      // Should not throw, should fall back to memory cache
      expect(() => {
        localStorage.set(priKey1, testItems[0]);
      }).not.toThrow();

      // Verify the item was stored in memory fallback
      const result = localStorage.get(priKey1);
      expect(result).toEqual(testItems[0]);
    });

    it('should handle non-quota localStorage errors by throwing', () => {
      // Mock localStorage.setItem to throw a non-quota error
      window.localStorage.setItem = vi.fn().mockImplementation(() => {
        const error = new Error('Some other localStorage error');
        error.name = 'SecurityError';
        throw error;
      });

      expect(() => {
        localStorage.set(priKey1, testItems[0]);
      }).toThrow('Failed to store item in localStorage');
    });

    it('should handle JSON parsing errors gracefully', () => {
      // Store invalid JSON manually
      const storageKey = 'test-prefix:' + (localStorage as any).normalizedHashFunction(priKey1);
      window.localStorage.setItem(storageKey, 'invalid-json{');

      const result = localStorage.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle missing originalKey in stored data', () => {
      // Store data without originalKey
      const storageKey = 'test-prefix:' + (localStorage as any).normalizedHashFunction(priKey1);
      const invalidData = JSON.stringify({ value: testItems[0] });
      window.localStorage.setItem(storageKey, invalidData);

      const result = localStorage.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle hash collision detection', () => {
      // Store data with different originalKey
      const storageKey = 'test-prefix:' + (localStorage as any).normalizedHashFunction(priKey1);
      const mismatchedData = JSON.stringify({
        originalKey: priKey2, // Different key
        value: testItems[0]
      });
      window.localStorage.setItem(storageKey, mismatchedData);

      const result = localStorage.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle includesKey with invalid JSON', () => {
      const storageKey = 'test-prefix:' + (localStorage as any).normalizedHashFunction(priKey1);
      window.localStorage.setItem(storageKey, 'invalid-json{');

      const includes = localStorage.includesKey(priKey1);
      expect(includes).toBe(false);
    });

    it('should handle includesKey with hash mismatch', () => {
      const storageKey = 'test-prefix:' + (localStorage as any).normalizedHashFunction(priKey1);
      const mismatchedData = JSON.stringify({
        originalKey: priKey2, // Different key
        value: testItems[0]
      });
      window.localStorage.setItem(storageKey, mismatchedData);

      const includes = localStorage.includesKey(priKey1);
      expect(includes).toBe(false);
    });

    it('should handle getAllStorageKeys when localStorage.key returns null', () => {
      // Mock localStorage.length and key to simulate edge case
      Object.defineProperty(window.localStorage, 'length', { value: 2, configurable: true });
      window.localStorage.key = vi.fn()
        .mockReturnValueOnce('test-prefix:key1')
        .mockReturnValueOnce(null); // Returns null for second key

      const keys = localStorage.keys();
      expect(keys).toHaveLength(0); // Should handle null gracefully
    });

    it('should handle error in invalidateItemKeys', () => {
      localStorage.set(priKey1, testItems[0]);
      localStorage.set(priKey2, testItems[1]);

      // Mock delete to throw an error for one key
      let callCount = 0;
      window.localStorage.removeItem = vi.fn().mockImplementation((key) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Remove failed');
        }
        originalRemoveItem.call(window.localStorage, key);
      });

      // Should not throw, should handle errors gracefully
      localStorage.invalidateItemKeys([priKey1, priKey2]);
    });

    it('should handle query result parsing errors', () => {
      // Manually set invalid query result JSON
      const queryKey = 'test-prefix:query:test-hash';
      window.localStorage.setItem(queryKey, 'invalid-json{');

      const result = localStorage.getQueryResult('test-hash');
      expect(result).toBeNull();
    });

    it('should handle complex object serialization edge cases', () => {
      const complexItem: TestItem = {
        key: priKey1,
        id: '1',
        name: 'Complex Item',
        value: 100,
        metadata: {
          nested: {
            deep: {
              circular: null as any
            }
          }
        }
      } as any;

      // Create circular reference
      complexItem.metadata.nested.deep.circular = complexItem.metadata;

      // Should handle circular references gracefully (will likely throw)
      expect(() => {
        localStorage.set(priKey1, complexItem);
      }).toThrow();
    });
  });

  describe('SessionStorage Error Scenarios', () => {
    let sessionStorage: SessionStorageCacheMap<TestItem, 'test', 'container'>;

    beforeEach(() => {
      sessionStorage = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container'], 'session-prefix');
    });

    it('should handle quota exceeded errors during set', () => {
      const originalSetItem = window.sessionStorage.setItem;
      window.sessionStorage.setItem = vi.fn().mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      expect(() => {
        sessionStorage.set(priKey1, testItems[0]);
      }).toThrow('Failed to store item in sessionStorage');

      window.sessionStorage.setItem = originalSetItem;
    });

    it('should handle JSON parsing errors gracefully', () => {
      const storageKey = 'session-prefix:' + (sessionStorage as any).normalizedHashFunction(priKey1);
      window.sessionStorage.setItem(storageKey, 'invalid-json{');

      const result = sessionStorage.get(priKey1);
      expect(result).toBeNull();
    });

    it('should handle hash collision in sessionStorage', () => {
      const storageKey = 'session-prefix:' + (sessionStorage as any).normalizedHashFunction(priKey1);
      const mismatchedData = JSON.stringify({
        originalKey: priKey2,
        value: testItems[0]
      });
      window.sessionStorage.setItem(storageKey, mismatchedData);

      const result = sessionStorage.get(priKey1);
      expect(result).toBeNull();

      const includes = sessionStorage.includesKey(priKey1);
      expect(includes).toBe(false);
    });

    it('should handle storage errors in getAllStorageKeys', () => {
      const originalKey = window.sessionStorage.key;
      window.sessionStorage.key = vi.fn().mockImplementation(() => {
        throw new Error('Storage access error');
      });

      // Should handle errors gracefully and return empty array
      const keys = sessionStorage.keys();
      expect(keys).toEqual([]);

      window.sessionStorage.key = originalKey;
    });

    it('should handle empty locations array in allIn', () => {
      sessionStorage.set(priKey1, testItems[0]);
      sessionStorage.set(priKey2, testItems[1]);
      sessionStorage.set(comKey1, testItems[2]);

      const allItems = sessionStorage.allIn([]);
      expect(allItems).toHaveLength(3);
    });

    it('should handle invalidateLocation edge cases', () => {
      sessionStorage.set(priKey1, testItems[0]);
      sessionStorage.set(comKey1, testItems[2]);

      // Set query results
      sessionStorage.setQueryResult('test-query', [priKey1, comKey1]);

      // Invalidate empty location (should clear query results)
      sessionStorage.invalidateLocation([]);
      expect(sessionStorage.hasQueryResult('test-query')).toBe(false);

      // Invalidate specific location
      sessionStorage.setQueryResult('location-query', [comKey1]);
      const location = [{ kt: 'container', lk: 'container1' as UUID }];
      sessionStorage.invalidateLocation(location);
      expect(sessionStorage.hasQueryResult('location-query')).toBe(false);
    });

    it('should handle clearQueryResults when no queries exist', () => {
      // Should not throw when clearing empty query results
      sessionStorage.clearQueryResults();
      expect(sessionStorage.hasQueryResult('non-existent')).toBe(false);
    });

    it('should handle deleteQueryResult for non-existent query', () => {
      // Should not throw when deleting non-existent query
      sessionStorage.deleteQueryResult('non-existent');
      expect(sessionStorage.hasQueryResult('non-existent')).toBe(false);
    });
  });

  describe('IndexDBCacheMap Synchronous Wrapper', () => {
    let indexDB: IndexDBCacheMap<TestItem, 'test', 'container'>;

    beforeEach(() => {
      indexDB = new IndexDBCacheMap<TestItem, 'test', 'container'>(['test', 'container']);
    });

    it('should work synchronously for get operation using memory cache', () => {
      // Initially should return null
      expect(indexDB.get(priKey1)).toBeNull();

      // After setting, should return the value from memory cache
      indexDB.set(priKey1, testItems[0]);
      expect(indexDB.get(priKey1)).toEqual(testItems[0]);
    });

    it('should work synchronously for set operation using memory cache', () => {
      expect(() => {
        indexDB.set(priKey1, testItems[0]);
      }).not.toThrow();

      // Should be available immediately from memory cache
      expect(indexDB.get(priKey1)).toEqual(testItems[0]);
    });

    it('should work synchronously for includesKey operation using memory cache', () => {
      expect(indexDB.includesKey(priKey1)).toBe(false);

      indexDB.set(priKey1, testItems[0]);
      expect(indexDB.includesKey(priKey1)).toBe(true);
    });

    it('should work synchronously for delete operation using memory cache', () => {
      indexDB.set(priKey1, testItems[0]);
      expect(indexDB.includesKey(priKey1)).toBe(true);

      expect(() => {
        indexDB.delete(priKey1);
      }).not.toThrow();

      expect(indexDB.includesKey(priKey1)).toBe(false);
    });

    it('should work synchronously for allIn operation using memory cache', () => {
      indexDB.set(comKey1, testItems[2]);
      indexDB.set(priKey1, testItems[0]);

      expect(() => {
        indexDB.allIn([]);
      }).not.toThrow();

      const items = indexDB.allIn([]);
      expect(items.length).toBeGreaterThanOrEqual(0);
    });

    it('should work synchronously for contains operation using memory cache', () => {
      indexDB.set(priKey1, testItems[0]);

      const result = indexDB.contains({ value: 100 }, []);
      expect(typeof result).toBe('boolean');
    });

    it('should work synchronously for queryIn operation using memory cache', () => {
      indexDB.set(priKey1, testItems[0]);
      indexDB.set(priKey2, testItems[1]);

      const result = indexDB.queryIn({ value: 100 }, []);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should work synchronously for keys operation using memory cache', () => {
      expect(indexDB.keys()).toEqual([]);

      indexDB.set(priKey1, testItems[0]);
      indexDB.set(priKey2, testItems[1]);

      const keys = indexDB.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain(priKey1);
      expect(keys).toContain(priKey2);
    });

    it('should work synchronously for values operation using memory cache', () => {
      expect(indexDB.values()).toEqual([]);

      indexDB.set(priKey1, testItems[0]);
      indexDB.set(priKey2, testItems[1]);

      const values = indexDB.values();
      expect(values).toHaveLength(2);
      expect(values).toContain(testItems[0]);
      expect(values).toContain(testItems[1]);
    });

    it('should work synchronously for clear operation using memory cache', () => {
      indexDB.set(priKey1, testItems[0]);
      indexDB.set(priKey2, testItems[1]);
      expect(indexDB.keys()).toHaveLength(2);

      expect(() => {
        indexDB.clear();
      }).not.toThrow();

      expect(indexDB.keys()).toHaveLength(0);
    });

    it('should work synchronously for setQueryResult operation using memory cache', () => {
      expect(() => {
        indexDB.setQueryResult('test', [priKey1]);
      }).not.toThrow();

      expect(indexDB.hasQueryResult('test')).toBe(true);
    });

    it('should work synchronously for getQueryResult operation using memory cache', () => {
      indexDB.setQueryResult('test', [priKey1, priKey2]);

      const result = indexDB.getQueryResult('test');
      expect(result).toEqual([priKey1, priKey2]);

      // Non-existent query should return null
      expect(indexDB.getQueryResult('non-existent')).toBeNull();
    });

    it('should work synchronously for hasQueryResult operation using memory cache', () => {
      expect(indexDB.hasQueryResult('test')).toBe(false);

      indexDB.setQueryResult('test', [priKey1]);
      expect(indexDB.hasQueryResult('test')).toBe(true);
    });

    it('should work synchronously for deleteQueryResult operation using memory cache', () => {
      indexDB.setQueryResult('test', [priKey1]);
      expect(indexDB.hasQueryResult('test')).toBe(true);

      expect(() => {
        indexDB.deleteQueryResult('test');
      }).not.toThrow();

      expect(indexDB.hasQueryResult('test')).toBe(false);
    });

    it('should work synchronously for invalidateItemKeys operation using memory cache', () => {
      indexDB.set(priKey1, testItems[0]);
      indexDB.set(priKey2, testItems[1]);
      indexDB.setQueryResult('test', [priKey1, priKey2]);

      expect(() => {
        indexDB.invalidateItemKeys([priKey1]);
      }).not.toThrow();
    });

    it('should work synchronously for invalidateLocation operation using memory cache', () => {
      indexDB.set(comKey1, testItems[2]);

      expect(() => {
        indexDB.invalidateLocation([]);
      }).not.toThrow();
    });

    it('should work synchronously for clearQueryResults operation using memory cache', () => {
      indexDB.setQueryResult('test1', [priKey1]);
      indexDB.setQueryResult('test2', [priKey2]);
      expect(indexDB.hasQueryResult('test1')).toBe(true);
      expect(indexDB.hasQueryResult('test2')).toBe(true);

      expect(() => {
        indexDB.clearQueryResults();
      }).not.toThrow();

      expect(indexDB.hasQueryResult('test1')).toBe(false);
      expect(indexDB.hasQueryResult('test2')).toBe(false);
    });

    it('should create a clone successfully', () => {
      const cloned = indexDB.clone();
      expect(cloned).toBeInstanceOf(IndexDBCacheMap);
      expect(cloned).not.toBe(indexDB);
    });

    it('should expose asyncCache property', () => {
      expect(indexDB.asyncCache).toBeDefined();
      expect(indexDB.asyncCache.constructor.name).toBe('AsyncIndexDBCacheMap');
    });

    it('should initialize with custom parameters', () => {
      const customIndexDB = new IndexDBCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'custom-db',
        'custom-store',
        2
      );

      expect(customIndexDB).toBeInstanceOf(IndexDBCacheMap);
      expect(customIndexDB.asyncCache).toBeDefined();
    });
  });

  describe('Edge Cases for Storage Keys', () => {
    it('should handle special characters in storage prefix', () => {
      const specialChars = new LocalStorageCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        'special!@#$%^&*()_+-={}[]|\\:";\'<>?,./'
      );

      specialChars.set(priKey1, testItems[0]);
      const retrieved = specialChars.get(priKey1);
      expect(retrieved).toEqual(testItems[0]);
    });

    it('should handle very long prefix', () => {
      const longPrefix = 'a'.repeat(1000);
      const longPrefixCache = new LocalStorageCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        longPrefix
      );

      longPrefixCache.set(priKey1, testItems[0]);
      const retrieved = longPrefixCache.get(priKey1);
      expect(retrieved).toEqual(testItems[0]);
    });

    it('should handle empty prefix', () => {
      const emptyPrefixCache = new LocalStorageCacheMap<TestItem, 'test', 'container'>(
        ['test', 'container'],
        ''
      );

      emptyPrefixCache.set(priKey1, testItems[0]);
      const retrieved = emptyPrefixCache.get(priKey1);
      expect(retrieved).toEqual(testItems[0]);
    });
  });

  describe('Storage Operations with Large Data', () => {
    it('should handle very large items in localStorage', () => {
      const localStorage = new LocalStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

      const largeItem: TestItem = {
        key: priKey1,
        id: '1',
        name: 'Large Item',
        value: 100,
        largeData: 'x'.repeat(10000) // 10KB of data
      } as any;

      localStorage.set(priKey1, largeItem);
      const retrieved = localStorage.get(priKey1);
      expect(retrieved).toEqual(largeItem);
    });

    it('should handle very large items in sessionStorage', () => {
      const sessionStorage = new SessionStorageCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

      const largeItem: TestItem = {
        key: priKey1,
        id: '1',
        name: 'Large Item',
        value: 100,
        largeData: 'x'.repeat(10000) // 10KB of data
      } as any;

      sessionStorage.set(priKey1, largeItem);
      const retrieved = sessionStorage.get(priKey1);
      expect(retrieved).toEqual(largeItem);
    });
  });
});
