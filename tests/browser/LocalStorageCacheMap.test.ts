import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { Item, ItemQuery, LocKey, PriKey } from '@fjell/core';
import { CacheItemMetadata } from '../../src/eviction/EvictionStrategy';

// Simple mock for localStorage
const mockLocalStorage = {
  store: new Map<string, string>(),
  getItem: (key: string) => mockLocalStorage.store.get(key) || null,
  setItem: (key: string, value: string) => mockLocalStorage.store.set(key, value),
  removeItem: (key: string) => mockLocalStorage.store.delete(key),
  clear: () => mockLocalStorage.store.clear(),
  key: (index: number) => Array.from(mockLocalStorage.store.keys())[index] || null,
  get length() { return mockLocalStorage.store.size; },
  // Debug helper
  debug() {
    console.log('Current store contents:', Object.fromEntries(mockLocalStorage.store));
  }
};

// Test item implementation
class TestItem implements Item<'test'> {
  constructor(
    public readonly id: string,
    public readonly name: string
  ) { }

  get key(): PriKey<'test'> {
    return { kt: 'test', pk: this.id };
  }

  get type(): 'test' {
    return 'test';
  }

  get events() {
    return {
      created: {
        at: new Date(),
        by: undefined
      },
      updated: {
        at: new Date(),
        by: undefined
      },
      deleted: {
        at: new Date(),
        by: undefined
      }
    };
  }

  get severity(): number {
    return 0;
  }
}

describe('LocalStorageCacheMap', () => {
  let cache: LocalStorageCacheMap<TestItem, 'test'>;

  beforeEach(() => {
    // Set up localStorage mock
    global.localStorage = mockLocalStorage as any;
    mockLocalStorage.store.clear();

    // Initialize cache with simple type array
    cache = new LocalStorageCacheMap<TestItem, 'test'>(['test']);
  });

  afterEach(() => {
    mockLocalStorage.store.clear();
  });

  it('should store and retrieve items', async () => {
    const testItem = new TestItem('1', 'Test Item');
    cache.set({ kt: 'test', pk: '1' }, testItem);
    const retrieved = await cache.get({ kt: 'test', pk: '1' });
    expect(retrieved).toEqual(testItem);
  });

  it('should delete items', async () => {
    const testItem = new TestItem('1', 'Test Item');
    cache.set({ kt: 'test', pk: '1' }, testItem);
    cache.delete({ kt: 'test', pk: '1' });
    const retrieved = await cache.get({ kt: 'test', pk: '1' });
    expect(retrieved).toBeNull();
  });

  it('should check if key exists', async () => {
    const testItem = new TestItem('1', 'Test Item');
    cache.set({ kt: 'test', pk: '1' }, testItem);
    expect(await cache.includesKey({ kt: 'test', pk: '1' })).toBe(true);
    expect(await cache.includesKey({ kt: 'test', pk: '2' })).toBe(false);
  });

  it('should clear all items', async () => {
    const items = [
      new TestItem('1', 'Item 1'),
      new TestItem('2', 'Item 2')
    ];

    items.forEach(item => cache.set({ kt: 'test', pk: item.id }, item));

    // Verify items were stored
    for (const item of items) {
      expect(await cache.get({ kt: 'test', pk: item.id })).toBeTruthy();
    }

    // Clear the cache
    cache.clear();
    console.log('After clear:');
    mockLocalStorage.debug();

    // Verify items were cleared
    for (const item of items) {
      const retrieved = await cache.get({ kt: 'test', pk: item.id });
      console.log('Retrieved item:', retrieved);
      expect(retrieved).toBeNull();
    }
  });

  describe('Query result caching', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should store and retrieve query results', async () => {
      const queryHash = 'test-query-1';
      const itemKeys: PriKey<'test'>[] = [
        { kt: 'test', pk: '1' },
        { kt: 'test', pk: '2' }
      ];

      cache.setQueryResult(queryHash, itemKeys);
      const retrieved = await cache.getQueryResult(queryHash);
      expect(retrieved).toEqual(itemKeys);
    });

    it('should check if query result exists', () => {
      const queryHash = 'test-query-1';
      const itemKeys: PriKey<'test'>[] = [
        { kt: 'test', pk: '1' }
      ];

      expect(cache.hasQueryResult(queryHash)).toBe(false);

      cache.setQueryResult(queryHash, itemKeys);
      expect(cache.hasQueryResult(queryHash)).toBe(true);
    });

    it('should delete query result', () => {
      const queryHash = 'test-query-1';
      const itemKeys: PriKey<'test'>[] = [
        { kt: 'test', pk: '1' }
      ];

      cache.setQueryResult(queryHash, itemKeys);
      expect(cache.hasQueryResult(queryHash)).toBe(true);

      cache.deleteQueryResult(queryHash);
      expect(cache.hasQueryResult(queryHash)).toBe(false);
    });

    it('should clear all query results', () => {
      const queryHashes = ['query-1', 'query-2'];
      const itemKeys: PriKey<'test'>[] = [
        { kt: 'test', pk: '1' }
      ];

      queryHashes.forEach(hash => {
        cache.setQueryResult(hash, itemKeys);
        expect(cache.hasQueryResult(hash)).toBe(true);
      });

      cache.clearQueryResults();

      queryHashes.forEach(hash => {
        expect(cache.hasQueryResult(hash)).toBe(false);
      });
    });

    it('should handle invalid stored query data', async () => {
      const queryHash = 'test-query-1';
      const queryKey = `fjell-cache:query:${queryHash}`;

      // Set invalid JSON data
      localStorage.setItem(queryKey, 'invalid json');

      // Should return null for invalid data
      expect(await cache.getQueryResult(queryHash)).toBeNull();
    });

    it('should handle old format query results (array without expiration)', async () => {
      const queryHash = 'test-query-1';
      const queryKey = `fjell-cache:query:${queryHash}`;
      const itemKeys: PriKey<'test'>[] = [
        { kt: 'test', pk: '1' }
      ];

      // Store in old format (direct array)
      localStorage.setItem(queryKey, JSON.stringify(itemKeys));

      // Should still work with old format
      expect(await cache.getQueryResult(queryHash)).toEqual(itemKeys);
    });
  });

  describe('Metadata operations', () => {
    it('should store and retrieve metadata', () => {
      const key = 'test-key';
      const metadata: CacheItemMetadata = {
        key,
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 5,
        estimatedSize: 100
      };

      cache.setMetadata(key, metadata);
      const retrieved = cache.getMetadata(key);
      expect(retrieved).toEqual(metadata);
    });

    it('should return null for non-existent metadata', () => {
      const retrieved = cache.getMetadata('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete metadata', () => {
      const key = 'test-key';
      const metadata: CacheItemMetadata = {
        key,
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 5,
        estimatedSize: 100
      };

      cache.setMetadata(key, metadata);
      expect(cache.getMetadata(key)).toEqual(metadata);

      cache.deleteMetadata(key);
      expect(cache.getMetadata(key)).toBeNull();
    });

    it('should get all metadata', () => {
      const entries = [
        {
          key: 'key1',
          metadata: {
            key: 'key1',
            addedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 5,
            estimatedSize: 100
          } as CacheItemMetadata
        },
        {
          key: 'key2',
          metadata: {
            key: 'key2',
            addedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 10,
            estimatedSize: 200
          } as CacheItemMetadata
        }
      ];

      entries.forEach(entry => {
        cache.setMetadata(entry.key, entry.metadata);
      });

      const allMetadata = cache.getAllMetadata();
      expect(allMetadata.size).toBe(entries.length);
      entries.forEach(entry => {
        expect(allMetadata.get(entry.key)).toEqual(entry.metadata);
      });
    });

    it('should clear all metadata', () => {
      const entries = [
        {
          key: 'key1',
          metadata: {
            key: 'key1',
            addedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 5,
            estimatedSize: 100
          } as CacheItemMetadata
        },
        {
          key: 'key2',
          metadata: {
            key: 'key2',
            addedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 10,
            estimatedSize: 200
          } as CacheItemMetadata
        }
      ];

      entries.forEach(entry => {
        cache.setMetadata(entry.key, entry.metadata);
      });

      cache.clearMetadata();

      const allMetadata = cache.getAllMetadata();
      expect(allMetadata.size).toBe(0);
    });

    it('should handle invalid stored metadata gracefully', () => {
      const key = 'test-key';
      const metadataKey = `fjell-cache:metadata:${key}`;

      // Set invalid JSON data
      localStorage.setItem(metadataKey, 'invalid json');

      // Should return null for invalid data
      expect(cache.getMetadata(key)).toBeNull();
    });

    it('should handle storage quota exceeded when setting metadata', () => {
      const key = 'test-key';
      const metadata: CacheItemMetadata = {
        key,
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 5,
        estimatedSize: 100
      };

      // Mock localStorage.setItem to throw QuotaExceededError first time
      const originalSetItem = localStorage.setItem;
      let firstCall = true;
      localStorage.setItem = vi.fn().mockImplementation((k, v) => {
        if (firstCall && k.includes(':metadata:')) {
          firstCall = false;
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        return originalSetItem.call(localStorage, k, v);
      });

      // Should handle quota error and retry after cleanup
      cache.setMetadata(key, metadata);
      expect(cache.getMetadata(key)).toEqual(metadata);

      // Restore original setItem
      localStorage.setItem = originalSetItem;
    });
  });

  describe('Storage quota handling and cleanup', () => {
    it('should handle quota exceeded error when setting items', async () => {
      const testItem = new TestItem('1', 'Test Item');
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      // Mock localStorage.setItem to throw QuotaExceededError first time
      const originalSetItem = localStorage.setItem;
      let firstCall = true;
      localStorage.setItem = vi.fn().mockImplementation((k, v) => {
        if (firstCall) {
          firstCall = false;
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        return originalSetItem.call(localStorage, k, v);
      });

      // Should handle quota error and retry after cleanup
      cache.set(key, testItem);
      expect(await cache.get(key)).toEqual(testItem);

      // Restore original setItem
      localStorage.setItem = originalSetItem;
    });

    it('should handle various quota exceeded error types', async () => {
      const testItem = new TestItem('1', 'Test Item');
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      const errorTypes = [
        { name: 'QuotaExceededError', code: undefined },
        { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: undefined },
        { name: 'Error', code: 22 },
        { name: 'Error', code: 1014 }
      ];

      for (const errorType of errorTypes) {
        // Mock localStorage.setItem to throw specific error type
        const originalSetItem = localStorage.setItem;
        let firstCall = true;
        localStorage.setItem = vi.fn().mockImplementation((k, v) => {
          if (firstCall) {
            firstCall = false;
            const error = new Error(errorType.name);
            error.name = errorType.name;
            if (errorType.code !== undefined) {
              (error as any).code = errorType.code;
            }
            throw error;
          }
          return originalSetItem.call(localStorage, k, v);
        });

        // Should handle quota error and retry after cleanup
        cache.set(key, testItem);
        expect(await cache.get(key)).toEqual(testItem);

        // Restore original setItem
        localStorage.setItem = originalSetItem;
        cache.clear();
      }
    });

    it('should cleanup old entries when storage is full', async () => {
      // Create multiple test items with timestamps spread over time
      const items = Array.from({ length: 10 }, (_, i) => {
        const item = new TestItem(String(i), `Test Item ${i}`);
        const key: PriKey<'test'> = { kt: 'test', pk: String(i) };

        // Store item with increasing timestamps
        const timestamp = Date.now() - (10 - i) * 1000; // Older items have smaller timestamps
        localStorage.setItem(
          `fjell-cache:${key.kt}:${key.pk}`,
          JSON.stringify({
            originalKey: key,
            value: item,
            timestamp
          })
        );

        return { key, item };
      });

      // Mock localStorage.setItem to throw QuotaExceededError on new item
      const originalSetItem = localStorage.setItem;
      let firstCall = true;
      localStorage.setItem = vi.fn().mockImplementation((k, v) => {
        if (firstCall && !k.includes('metadata')) {
          firstCall = false;
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        return originalSetItem.call(localStorage, k, v);
      });

      // Try to add a new item - this should trigger cleanup
      const newItem = new TestItem('new', 'New Test Item');
      const newKey: PriKey<'test'> = { kt: 'test', pk: 'new' };
      cache.set(newKey, newItem);

      // Verify new item was stored
      expect(await cache.get(newKey)).toEqual(newItem);

      // Verify oldest items were removed (25% of items)
      const removedCount = Math.ceil(items.length * 0.25);
      for (let i = 0; i < removedCount; i++) {
        expect(await cache.get(items[i].key)).toBeNull();
      }

      // Verify newer items still exist
      for (let i = removedCount; i < items.length; i++) {
        expect(await cache.get(items[i].key)).toEqual(items[i].item);
      }

      // Restore original setItem
      localStorage.setItem = originalSetItem;
    });

    it('should handle cleanup failure gracefully', () => {
      const testItem = new TestItem('1', 'Test Item');
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      // Mock localStorage to simulate cleanup failure
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = vi.fn().mockImplementation(() => {
        throw new Error('Failed to remove item');
      });

      // Mock setItem to throw QuotaExceededError
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn().mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      // Should throw error when cleanup fails
      expect(() => cache.set(key, testItem)).toThrow('Failed to store item in localStorage');

      // Restore original methods
      localStorage.removeItem = originalRemoveItem;
      localStorage.setItem = originalSetItem;
    });
  });

  describe('Size tracking', () => {
    beforeEach(() => {
      // Clear any existing items
      cache.clear();
    });

    it('should report correct size limits', () => {
      const limits = cache.getSizeLimits();
      expect(limits.maxItems).toBeNull(); // No specific item limit
      expect(limits.maxSizeBytes).toBe(5 * 1024 * 1024); // 5MB conservative estimate
    });

    it('should track item count correctly', () => {
      const items = [
        new TestItem('1', 'Test Item 1'),
        new TestItem('2', 'Test Item 2'),
        new TestItem('3', 'Test Item 3')
      ];

      // Add items
      items.forEach(item => cache.set({ kt: 'test', pk: item.id }, item));

      const size = cache.getCurrentSize();
      expect(size.itemCount).toBe(items.length);
    });

    it('should track size in bytes correctly', () => {
      const item = new TestItem('1', 'Test Item 1');
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      // Add item
      cache.set(key, item);

      // Calculate expected size
      const storedValue = JSON.stringify({
        originalKey: key,
        value: item,
        timestamp: Date.now()
      });
      const expectedSize = new TextEncoder().encode(storedValue).length;

      const size = cache.getCurrentSize();
      expect(size.sizeBytes).toBeGreaterThanOrEqual(expectedSize);
    });

    it('should handle size calculation with metadata and query results', () => {
      // Add regular item
      const item = new TestItem('1', 'Test Item 1');
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      cache.set(key, item);

      // Add metadata
      const metadata: CacheItemMetadata = {
        key: 'meta1',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 5,
        estimatedSize: 100
      };
      cache.setMetadata('meta1', metadata);

      // Add query result
      const queryHash = 'test-query';
      cache.setQueryResult(queryHash, [key]);

      const size = cache.getCurrentSize();
      expect(size.itemCount).toBe(1); // Only count regular items
      expect(size.sizeBytes).toBeGreaterThan(0);
    });

    it('should handle invalid entries when calculating size', () => {
      // Add invalid entry
      localStorage.setItem('fjell-cache:invalid', 'invalid json');

      // Add valid item
      const item = new TestItem('1', 'Test Item 1');
      cache.set({ kt: 'test', pk: '1' }, item);

      const size = cache.getCurrentSize();
      expect(size.itemCount).toBe(1); // Only count valid items
      expect(size.sizeBytes).toBeGreaterThan(0);
    });

    it('should handle size calculation with different environments', () => {
      const item = new TestItem('1', 'Test Item 1');
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      cache.set(key, item);

      // Test with Blob
      const originalBlob = global.Blob;
      const originalTextEncoder = global.TextEncoder;
      const originalBuffer = (global as any).Buffer;

      // Test with Blob
      global.Blob = class {
        size: number;
        constructor(parts: any[]) {
          this.size = parts.join('').length;
        }
      } as any;
      global.TextEncoder = undefined as any;
      (global as any).Buffer = undefined;

      let size = cache.getCurrentSize();
      expect(size.sizeBytes).toBeGreaterThan(0);

      // Test with TextEncoder
      global.Blob = undefined as any;
      global.TextEncoder = class {
        encode(input: string): Uint8Array {
          return new Uint8Array(Buffer.from(input));
        }
      } as any;

      size = cache.getCurrentSize();
      expect(size.sizeBytes).toBeGreaterThan(0);

      // Test with Buffer
      global.TextEncoder = undefined as any;
      (global as any).Buffer = {
        byteLength: (str: string) => str.length
      };

      size = cache.getCurrentSize();
      expect(size.sizeBytes).toBeGreaterThan(0);

      // Test fallback to string length
      global.Blob = undefined as any;
      global.TextEncoder = undefined as any;
      (global as any).Buffer = undefined;

      size = cache.getCurrentSize();
      expect(size.sizeBytes).toBeGreaterThan(0);

      // Restore originals
      global.Blob = originalBlob;
      global.TextEncoder = originalTextEncoder;
      (global as any).Buffer = originalBuffer;
    });
  });

  describe('Location-based operations', () => {
    // Define location types
    type Loc1 = 'locA' | 'locB' | 'locC';
    type Loc2 = 'locX' | 'locY' | 'locZ';

    // Helper function to create location keys
    function createLocKeys(loc1: Loc1, loc2: Loc2): [LocKey<Loc1>, LocKey<Loc2>] {
      return [loc1 as unknown as LocKey<Loc1>, loc2 as unknown as LocKey<Loc2>];
    }

    // Define a test class with location support
    class TestItemWithLoc implements Item<'test', Loc1, Loc2> {
      constructor(
        public readonly id: string,
        public readonly name: string,
        public readonly location1: Loc1,
        public readonly location2: Loc2
      ) { }

      get key() {
        return {
          kt: 'test' as const,
          pk: this.id,
          loc: [this.location1, this.location2]
        };
      }

      get type(): 'test' {
        return 'test';
      }

      get events() {
        return {
          created: {
            at: new Date(),
            by: undefined
          },
          updated: {
            at: new Date(),
            by: undefined
          },
          deleted: {
            at: new Date(),
            by: undefined
          }
        };
      }

      get severity(): number {
        return 0;
      }
    }

    let locCache: LocalStorageCacheMap<TestItemWithLoc, 'test', Loc1, Loc2>;

    beforeEach(() => {
      // Initialize cache with location support
      locCache = new LocalStorageCacheMap<TestItemWithLoc, 'test', Loc1, Loc2>(['test']);
      localStorage.clear();
    });

    it('should retrieve all items in a location', async () => {
      const items = [
        new TestItemWithLoc('1', 'Item 1', 'locA', 'locX'),
        new TestItemWithLoc('2', 'Item 2', 'locA', 'locX'),
        new TestItemWithLoc('3', 'Item 3', 'locB', 'locY'),
        new TestItemWithLoc('4', 'Item 4', 'locA', 'locY')
      ];

      // Store all items
      items.forEach(item => locCache.set(item.key, item));

      // Test allIn with specific location
      const locAXItems = await locCache.allIn(createLocKeys('locA', 'locX'));
      expect(locAXItems).toHaveLength(2);
      expect(locAXItems.map(item => item.id)).toEqual(['1', '2']);

      // Test allIn with different location
      const locBYItems = await locCache.allIn(createLocKeys('locB', 'locY'));
      expect(locBYItems).toHaveLength(1);
      expect(locBYItems[0].id).toBe('3');

      // Test allIn with empty location array (should return all items)
      const allItems = await locCache.allIn([]);
      expect(allItems).toHaveLength(4);
    });

    it('should check if query matches items in location', async () => {
      const items = [
        new TestItemWithLoc('1', 'Apple', 'locA', 'locX'),
        new TestItemWithLoc('2', 'Banana', 'locA', 'locX'),
        new TestItemWithLoc('3', 'Apple', 'locB', 'locY')
      ];

      // Store all items
      items.forEach(item => locCache.set(item.key, item));

      // Test contains with query and location
      const query: ItemQuery = {};
      expect(await locCache.contains(query, createLocKeys('locA', 'locX'))).toBe(true);
      expect(await locCache.contains(query, createLocKeys('locA', 'locX'))).toBe(true);
      expect(await locCache.contains(query, createLocKeys('locB', 'locY'))).toBe(true);
      expect(await locCache.contains(query, createLocKeys('locC', 'locZ'))).toBe(false);
    });

    it('should query items in location', async () => {
      const items = [
        new TestItemWithLoc('1', 'Apple', 'locA', 'locX'),
        new TestItemWithLoc('2', 'Banana', 'locA', 'locX'),
        new TestItemWithLoc('3', 'Apple', 'locB', 'locY')
      ];

      // Store all items
      items.forEach(item => locCache.set(item.key, item));

      // Test queryIn with specific location
      const query: ItemQuery = {};
      const itemsInLocAX = await locCache.queryIn(query, createLocKeys('locA', 'locX'));
      expect(itemsInLocAX).toHaveLength(2);
      expect(itemsInLocAX.map(item => item.id).sort()).toEqual(['1', '2']);

      // Test queryIn with empty location array (all locations)
      const allItems = await locCache.queryIn(query, []);
      expect(allItems).toHaveLength(3);
      expect(allItems.map(item => item.id).sort()).toEqual(['1', '2', '3']);
    });

    it('should invalidate items by location', async () => {
      const items = [
        new TestItemWithLoc('1', 'Item 1', 'locA', 'locX'),
        new TestItemWithLoc('2', 'Item 2', 'locA', 'locX'),
        new TestItemWithLoc('3', 'Item 3', 'locB', 'locY')
      ];

      // Store all items
      items.forEach(item => locCache.set(item.key, item));

      // Store some query results
      locCache.setQueryResult('query1', [items[0].key, items[1].key]);

      // Invalidate specific location
      await locCache.invalidateLocation(createLocKeys('locA', 'locX'));

      // Verify items in invalidated location are removed
      expect(await locCache.allIn(createLocKeys('locA', 'locX'))).toHaveLength(0);
      expect(await locCache.allIn(createLocKeys('locB', 'locY'))).toHaveLength(1);

      // Verify query results were cleared
      expect(await locCache.getQueryResult('query1')).toBeNull();
    });

    it('should invalidate primary items (no location)', async () => {
      // Create a mixed cache with both primary and composite keys
      const primaryItem = new TestItem('1', 'Primary Item');
      const locItem = new TestItemWithLoc('2', 'Location Item', 'locA', 'locX');

      cache.set(primaryItem.key, primaryItem);
      locCache.set(locItem.key, locItem);

      // Invalidate primary items
      await locCache.invalidateLocation([]);

      // Verify primary item is removed but location item remains
      expect(await cache.get(primaryItem.key)).toBeNull();
      expect(await locCache.get(locItem.key)).toEqual(locItem);
    });

    it('should handle invalid keys during location operations', async () => {
      // Store an item with invalid key format
      const storageKey = 'fjell-cache:test:invalid';
      localStorage.setItem(storageKey, JSON.stringify({
        originalKey: { invalid: 'key' },
        value: { id: 'invalid' }
      }));

      // Valid item
      const validItem = new TestItemWithLoc('1', 'Valid Item', 'locA', 'locX');
      locCache.set(validItem.key, validItem);

      // Operations should work despite invalid key
      const items = await locCache.allIn(createLocKeys('locA', 'locX'));
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(validItem);
    });
  });
});
