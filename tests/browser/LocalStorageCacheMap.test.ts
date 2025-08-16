import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { ComKey, Evented, ManagedEvents, PriKey } from '@fjell/core';

// Mock events for test items
const createMockEvents = (): ManagedEvents & Evented => ({
  created: { at: new Date() },
  updated: { at: new Date() },
  deleted: { at: null }
});

// Test types
type TestItem = {
  key: PriKey<'test'>;
  id: string;
  name: string;
  value: number;
  events: ManagedEvents & Evented;
};

type ContainerItem = {
  key: ComKey<'item', 'container'>;
  id: string;
  name: string;
  value: number;
  events: ManagedEvents & Evented;
};

// Mock localStorage
const mockLocalStorage = {
  data: new Map<string, string>(),
  getItem: vi.fn((key: string) => mockLocalStorage.data.get(key) || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage.data.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    mockLocalStorage.data.delete(key);
  }),
  clear: vi.fn(() => {
    mockLocalStorage.data.clear();
  }),
  key: vi.fn((index: number) => {
    const keys = Array.from(mockLocalStorage.data.keys());
    return keys[index] || null;
  }),
  get length() {
    return mockLocalStorage.data.size;
  }
};

// Mock global localStorage
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('LocalStorageCacheMap', () => {
  let cacheMap: LocalStorageCacheMap<TestItem, 'test'>;
  let containerCacheMap: LocalStorageCacheMap<ContainerItem, 'item', 'container'>;

  beforeEach(() => {
    // Clear mock data
    mockLocalStorage.clear();
    vi.clearAllMocks();

    // Create cache instances
    cacheMap = new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache');
    containerCacheMap = new LocalStorageCacheMap<ContainerItem, 'item', 'container'>(['item', 'container'], 'container-cache');
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  describe('Constructor', () => {
    it('should create instance with default key prefix', () => {
      const defaultCache = new LocalStorageCacheMap<TestItem, 'test'>(['test']);
      expect(defaultCache.implementationType).toBe('browser/localStorage');
    });

    it('should create instance with custom key prefix', () => {
      const customCache = new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'custom-prefix');
      expect(customCache.implementationType).toBe('browser/localStorage');
    });

    it('should create container cache instance', () => {
      expect(containerCacheMap.implementationType).toBe('browser/localStorage');
    });
  });

  describe('Basic Operations', () => {
    it('should set and get primary key items', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = {
        key,
        id: '1',
        name: 'Test Item',
        value: 100,
        events: createMockEvents()
      };

      await cacheMap.set(key, item);
      const retrieved = await cacheMap.get(key);

      expect(retrieved).toEqual(item);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      expect(mockLocalStorage.getItem).toHaveBeenCalled();
    });

    it('should set and get composite key items', async () => {
      const key: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1',
        loc: [{ kt: 'container', lk: 'container1' }]
      };
      const item: ContainerItem = {
        key,
        id: '1',
        name: 'Container Item',
        value: 200,
        events: createMockEvents()
      };

      await containerCacheMap.set(key, item);
      const retrieved = await containerCacheMap.get(key);

      expect(retrieved).toEqual(item);
    });

    it('should return null for non-existent items', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: 'nonexistent' };
      const result = await cacheMap.get(key);
      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = {
        key,
        id: '1',
        name: 'Test Item',
        value: 100,
        events: createMockEvents()
      };

      expect(await cacheMap.includesKey(key)).toBe(false);
      await cacheMap.set(key, item);
      expect(await cacheMap.includesKey(key)).toBe(true);
    });

    it('should delete items', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = {
        key,
        id: '1',
        name: 'Test Item',
        value: 100,
        events: createMockEvents()
      };

      await cacheMap.set(key, item);
      expect(await cacheMap.includesKey(key)).toBe(true);

      await cacheMap.delete(key);
      expect(await cacheMap.includesKey(key)).toBe(false);
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });

    it('should clear all items', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      await cacheMap.clear();
      expect(await cacheMap.get(key1)).toBeNull();
      expect(await cacheMap.get(key2)).toBeNull();
    });
  });

  describe('Query Operations', () => {
    it('should get all items in location', async () => {
      const key1: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1',
        loc: [{ kt: 'container', lk: 'container1' }]
      };
      const key2: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '2',
        loc: [{ kt: 'container', lk: 'container1' }]
      };
      const key3: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '3',
        loc: [{ kt: 'container', lk: 'container2' }]
      };

      const item1: ContainerItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: ContainerItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };
      const item3: ContainerItem = { key: key3, id: '3', name: 'Item 3', value: 300, events: createMockEvents() };

      await containerCacheMap.set(key1, item1);
      await containerCacheMap.set(key2, item2);
      await containerCacheMap.set(key3, item3);

      const items = await containerCacheMap.allIn([{ kt: 'container', lk: 'container1' }]);
      expect(items).toHaveLength(2);
      expect(items).toEqual(expect.arrayContaining([item1, item2]));
    });

    it('should get all items when location is empty', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      const items = await cacheMap.allIn([]);
      expect(items).toHaveLength(2);
      expect(items).toEqual(expect.arrayContaining([item1, item2]));
    });

    it('should query items in location', async () => {
      const key1: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1',
        loc: [{ kt: 'container', lk: 'container1' }]
      };
      const key2: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '2',
        loc: [{ kt: 'container', lk: 'container1' }]
      };

      const item1: ContainerItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: ContainerItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await containerCacheMap.set(key1, item1);
      await containerCacheMap.set(key2, item2);

      const items = await containerCacheMap.queryIn(
        {},
        [{ kt: 'container', lk: 'container1' }]
      );
      expect(items).toHaveLength(2);
      expect(items).toEqual(expect.arrayContaining([item1, item2]));
    });

    it('should check if query contains items', async () => {
      const key: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1',
        loc: [{ kt: 'container', lk: 'container1' }]
      };
      const item: ContainerItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await containerCacheMap.set(key, item);

      const contains = await containerCacheMap.contains(
        {},
        [{ kt: 'container', lk: 'container1' }]
      );
      expect(contains).toBe(true);
    });
  });

  describe('Query Result Caching', () => {
    it('should set and get query results', async () => {
      const queryHash = 'test-query-hash';
      const itemKeys: PriKey<'test'>[] = [
        { kt: 'test', pk: '1' },
        { kt: 'test', pk: '2' }
      ];

      await cacheMap.setQueryResult(queryHash, itemKeys);
      const result = await cacheMap.getQueryResult(queryHash);

      expect(result).toEqual(itemKeys);
    });

    it('should check if query result exists', async () => {
      const queryHash = 'test-query-hash';
      const itemKeys: PriKey<'test'>[] = [{ kt: 'test', pk: '1' }];

      expect(await cacheMap.hasQueryResult(queryHash)).toBe(false);
      await cacheMap.setQueryResult(queryHash, itemKeys);
      expect(await cacheMap.hasQueryResult(queryHash)).toBe(true);
    });

    it('should delete query results', async () => {
      const queryHash = 'test-query-hash';
      const itemKeys: PriKey<'test'>[] = [{ kt: 'test', pk: '1' }];

      await cacheMap.setQueryResult(queryHash, itemKeys);
      expect(await cacheMap.hasQueryResult(queryHash)).toBe(true);

      await cacheMap.deleteQueryResult(queryHash);
      expect(await cacheMap.hasQueryResult(queryHash)).toBe(false);
    });

    it('should clear all query results', async () => {
      const queryHash1 = 'query-1';
      const queryHash2 = 'query-2';
      const itemKeys: PriKey<'test'>[] = [{ kt: 'test', pk: '1' }];

      await cacheMap.setQueryResult(queryHash1, itemKeys);
      await cacheMap.setQueryResult(queryHash2, itemKeys);

      await cacheMap.clearQueryResults();
      expect(await cacheMap.hasQueryResult(queryHash1)).toBe(false);
      expect(await cacheMap.hasQueryResult(queryHash2)).toBe(false);
    });

    it('should handle legacy query result format', async () => {
      const queryHash = 'legacy-query';
      const itemKeys: PriKey<'test'>[] = [{ kt: 'test', pk: '1' }];

      // Store in legacy format (just array)
      const legacyKey = `test-cache:query:${queryHash}`;
      mockLocalStorage.setItem(legacyKey, JSON.stringify(itemKeys));

      const result = await cacheMap.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);
    });
  });

  describe('Invalidation', () => {
    it('should invalidate specific item keys', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      await cacheMap.invalidateItemKeys([key1]);
      expect(await cacheMap.get(key1)).toBeNull();
      expect(await cacheMap.get(key2)).toEqual(item2);
    });

    it('should invalidate items by location', async () => {
      const key1: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1',
        loc: [{ kt: 'container', lk: 'container1' }]
      };
      const key2: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '2',
        loc: [{ kt: 'container', lk: 'container2' }]
      };

      const item1: ContainerItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: ContainerItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await containerCacheMap.set(key1, item1);
      await containerCacheMap.set(key2, item2);

      await containerCacheMap.invalidateLocation([{ kt: 'container', lk: 'container1' }]);
      expect(await containerCacheMap.get(key1)).toBeNull();
      expect(await containerCacheMap.get(key2)).toEqual(item2);
    });

    it('should invalidate primary items when location is empty', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      await cacheMap.invalidateLocation([]);
      expect(await cacheMap.get(key1)).toBeNull();
      expect(await cacheMap.get(key2)).toBeNull();
    });
  });

  describe('Metadata Operations', () => {
    it('should set and get metadata', async () => {
      const key = 'test-metadata';
      const metadata = {
        key: 'test-metadata',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 5,
        estimatedSize: 100
      };

      await cacheMap.setMetadata(key, metadata);
      const retrieved = await cacheMap.getMetadata(key);

      expect(retrieved).toEqual(metadata);
    });

    it('should return null for non-existent metadata', async () => {
      const result = await cacheMap.getMetadata('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete metadata', async () => {
      const key = 'test-metadata';
      const metadata = {
        key: 'test-metadata',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      };

      await cacheMap.setMetadata(key, metadata);
      expect(await cacheMap.getMetadata(key)).toEqual(metadata);

      await cacheMap.deleteMetadata(key);
      expect(await cacheMap.getMetadata(key)).toBeNull();
    });

    it('should get all metadata', async () => {
      const metadata1 = {
        key: 'key1',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      };
      const metadata2 = {
        key: 'key2',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 10,
        estimatedSize: 200
      };

      await cacheMap.setMetadata('key1', metadata1);
      await cacheMap.setMetadata('key2', metadata2);

      const allMetadata = await cacheMap.getAllMetadata();
      expect(allMetadata.get('key1')).toEqual(metadata1);
      expect(allMetadata.get('key2')).toEqual(metadata2);
    });

    it('should clear all metadata', async () => {
      const metadata1 = {
        key: 'key1',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      };
      const metadata2 = {
        key: 'key2',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 200
      };

      await cacheMap.setMetadata('key1', metadata1);
      await cacheMap.setMetadata('key2', metadata2);

      await cacheMap.clearMetadata();
      const allMetadata = await cacheMap.getAllMetadata();
      expect(allMetadata.size).toBe(0);
    });
  });

  describe('Size and Limits', () => {
    it('should get current size', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);
      const size = await cacheMap.getCurrentSize();

      expect(size.itemCount).toBe(1);
      expect(size.sizeBytes).toBeGreaterThan(0);
    });

    it('should get size limits', async () => {
      const limits = await cacheMap.getSizeLimits();

      expect(limits.maxItems).toBeNull();
      expect(limits.maxSizeBytes).toBe(5 * 1024 * 1024); // 5MB
    });

    it('should calculate size correctly with metadata and query results', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);
      const metadata = {
        key: 'test',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      };
      await cacheMap.setMetadata('test', metadata);
      await cacheMap.setQueryResult('query', [key]);

      const size = await cacheMap.getCurrentSize();
      expect(size.itemCount).toBe(1); // Only regular items count
      expect(size.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Mock localStorage error
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      await expect(cacheMap.set(key, item)).rejects.toThrow('Storage error');
    });

    it('should handle JSON parse errors', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      // Store invalid JSON
      const storageKey = cacheMap['getStorageKey'](key);
      mockLocalStorage.setItem(storageKey, 'invalid json');

      const result = await cacheMap.get(key);
      expect(result).toBeNull();
    });

    it('should handle quota exceeded errors with cleanup', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Mock quota exceeded error
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw quotaError;
      });

      // Mock cleanup to succeed
      const cleanupSpy = vi.spyOn(cacheMap as any, 'tryCleanupOldEntries').mockReturnValue(true);

      // Mock successful retry
      mockLocalStorage.setItem.mockImplementationOnce(() => { });

      await cacheMap.set(key, item);
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle multiple quota exceeded errors', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      // Mock all attempts to fail
      mockLocalStorage.setItem.mockImplementation(() => {
        throw quotaError;
      });

      await expect(cacheMap.set(key, item)).rejects.toThrow('storage quota exceeded');
    });

    it('should handle metadata storage errors', async () => {
      const key = 'test-metadata';
      const metadata = {
        key: 'test-metadata',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      };

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('Metadata storage error');
      });

      await expect(cacheMap.setMetadata(key, metadata)).rejects.toThrow('Metadata storage error');
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clean up old entries when quota exceeded', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Add some old entries
      const oldKey: PriKey<'test'> = { kt: 'test', pk: 'old' };
      const oldItem: TestItem = { key: oldKey, id: 'old', name: 'Old Item', value: 50, events: createMockEvents() };
      await cacheMap.set(oldKey, oldItem);

      // Mock quota exceeded error
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw quotaError;
      });

      // Mock successful retry
      mockLocalStorage.setItem.mockImplementationOnce(() => { });

      await cacheMap.set(key, item);

      // Verify old entry was cleaned up
      expect(await cacheMap.get(oldKey)).toBeNull();
    });

    it('should handle cleanup failures gracefully', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw quotaError;
      });

      // Mock cleanup to fail
      const cleanupSpy = vi.spyOn(cacheMap as any, 'tryCleanupOldEntries').mockReturnValue(false);

      // Mock successful retry
      mockLocalStorage.setItem.mockImplementationOnce(() => { });

      await cacheMap.set(key, item);
      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Key Normalization and Hashing', () => {
    it('should handle key collisions correctly', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      const retrieved1 = await cacheMap.get(key1);
      const retrieved2 = await cacheMap.get(key2);

      expect(retrieved1).toEqual(item1);
      expect(retrieved2).toEqual(item2);
    });

    it('should handle legacy key format', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Store using legacy format
      const legacyKey = `test-cache:test:1`;
      mockLocalStorage.setItem(legacyKey, JSON.stringify({
        originalKey: key,
        value: item,
        timestamp: Date.now()
      }));

      const retrieved = await cacheMap.get(key);
      expect(retrieved).toEqual(item);
    });
  });

  describe('Clone Operation', () => {
    it('should clone cache map', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);
      const cloned = await cacheMap.clone();

      expect(cloned).toBeInstanceOf(LocalStorageCacheMap);
      expect(await cloned.get(key)).toEqual(item);
    });
  });

  describe('Keys and Values', () => {
    it('should get all keys', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      const keys = await cacheMap.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toEqual(expect.arrayContaining([key1, key2]));
    });

    it('should get all values', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      const values = await cacheMap.values();
      expect(values).toHaveLength(2);
      expect(values).toEqual(expect.arrayContaining([item1, item2]));
    });

    it('should handle corrupted entries in keys/values', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);

      // Add corrupted entry
      const corruptedKey = `test-cache:corrupted`;
      mockLocalStorage.setItem(corruptedKey, 'invalid json');

      const keys = await cacheMap.keys();
      const values = await cacheMap.values();

      expect(keys).toHaveLength(1);
      expect(values).toHaveLength(1);
      expect(keys[0]).toEqual(key);
      expect(values[0]).toEqual(item);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty storage', async () => {
      const keys = await cacheMap.keys();
      const values = await cacheMap.values();
      const size = await cacheMap.getCurrentSize();

      expect(keys).toHaveLength(0);
      expect(values).toHaveLength(0);
      expect(size.itemCount).toBe(0);
      expect(size.sizeBytes).toBe(0);
    });

    it('should handle null/undefined values gracefully', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      // Mock null value
      const storageKey = cacheMap['getStorageKey'](key);
      mockLocalStorage.setItem(storageKey, 'null');

      const result = await cacheMap.get(key);
      expect(result).toBeNull();
    });

    it('should handle storage iteration errors', async () => {
      // Mock storage iteration error
      mockLocalStorage.key.mockImplementationOnce(() => {
        throw new Error('Iteration error');
      });

      const keys = await cacheMap.keys();
      expect(keys).toHaveLength(0);
    });

    it('should handle size calculation errors', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);

      // Mock size calculation error
      const originalBlob = global.Blob;
      delete (global as any).Blob;
      delete (global as any).TextEncoder;
      delete (global as any).Buffer;

      const size = await cacheMap.getCurrentSize();
      expect(size.itemCount).toBe(1);
      expect(size.sizeBytes).toBeGreaterThan(0);

      // Restore
      global.Blob = originalBlob;
    });
  });
});
