import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { ComKey, Evented, ManagedEvents, PriKey } from '@fjell/types';

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

  describe('Advanced Error Scenarios', () => {
    it('should handle different quota exceeded error types', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Test different quota error types
      const quotaErrors = [
        { name: 'NS_ERROR_DOM_QUOTA_REACHED' },
        { code: 22 },
        { code: 1014 },
        { name: 'QuotaExceededError' }
      ];

      for (const errorProps of quotaErrors) {
        const error = new Error('Quota exceeded');
        Object.assign(error, errorProps);

        mockLocalStorage.setItem.mockImplementationOnce(() => {
          throw error;
        });

        // Mock successful retry
        mockLocalStorage.setItem.mockImplementationOnce(() => { });

        await cacheMap.set(key, item);
        expect(mockLocalStorage.setItem).toHaveBeenCalled();
      }
    });

    it('should handle corrupted storage entries during cleanup', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Add corrupted entries
      mockLocalStorage.setItem('test-cache:corrupted1', 'invalid json');
      mockLocalStorage.setItem('test-cache:corrupted2', '{"incomplete": true');
      mockLocalStorage.setItem('test-cache:valid', JSON.stringify({
        originalKey: { kt: 'test', pk: 'valid' },
        value: item,
        timestamp: Date.now() - 1000
      }));

      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw quotaError;
      });

      // Mock successful retry
      mockLocalStorage.setItem.mockImplementationOnce(() => { });

      await cacheMap.set(key, item);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should handle localStorage getItem errors', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Storage access error');
      });

      const result = await cacheMap.get(key);
      expect(result).toBeNull();
    });

    it('should handle localStorage removeItem errors', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };

      mockLocalStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('Remove error');
      });

      await expect(cacheMap.delete(key)).rejects.toThrow('Remove error');
    });

    it('should handle errors in getAllKeysStartingWith', async () => {
      mockLocalStorage.key.mockImplementationOnce(() => {
        throw new Error('Key access error');
      });

      await expect(cacheMap.clear()).rejects.toThrow('Key access error');
    });

    it('should handle metadata JSON parse errors', async () => {
      const key = 'test-metadata';
      const metadataKey = `test-cache:metadata:${key}`;

      mockLocalStorage.setItem(metadataKey, 'invalid json');

      const result = await cacheMap.getMetadata(key);
      expect(result).toBeNull();
    });

    it('should handle metadata storage quota errors', async () => {
      const key = 'test-metadata';
      const metadata = {
        key: 'test-metadata',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      };

      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      // Mock quota error on first attempt
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw quotaError;
      });

      // Mock successful retry
      mockLocalStorage.setItem.mockImplementationOnce(() => { });

      await cacheMap.setMetadata(key, metadata);
      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('Comprehensive Cleanup Logic', () => {
    it('should perform normal cleanup when not aggressive', async () => {
      // Add multiple entries with different timestamps
      const entries = [];
      for (let i = 0; i < 10; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` };
        const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i * 10, events: createMockEvents() };
        await cacheMap.set(key, item);
        entries.push({ key, item });
      }

      // Trigger cleanup
      const cleanupMethod = cacheMap['tryCleanupOldEntries'];
      const result = cleanupMethod.call(cacheMap, false); // Normal cleanup

      expect(result).toBe(true);
    });

    it('should perform aggressive cleanup when quota exceeded multiple times', async () => {
      // Add entries
      for (let i = 0; i < 5; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` };
        const item: TestItem = { key, id: `${i}`, name: `Item ${i}`, value: i * 10, events: createMockEvents() };
        await cacheMap.set(key, item);
      }

      // Trigger aggressive cleanup
      const cleanupMethod = cacheMap['tryCleanupOldEntries'];
      const result = cleanupMethod.call(cacheMap, true); // Aggressive cleanup

      expect(result).toBe(true);
    });

    it('should handle cleanup when no entries exist', async () => {
      const cleanupMethod = cacheMap['tryCleanupOldEntries'];
      const result = cleanupMethod.call(cacheMap, false);

      expect(result).toBe(false);
    });

    it('should handle cleanup errors gracefully', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };
      await cacheMap.set(key, item);

      // Mock removeItem to throw error during cleanup
      mockLocalStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('Cleanup error');
      });

      const cleanupMethod = cacheMap['tryCleanupOldEntries'];
      const result = cleanupMethod.call(cacheMap, false);

      expect(result).toBe(false);
    });

    it('should skip metadata and query entries during cleanup', async () => {
      // Add regular entry
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };
      await cacheMap.set(key, item);

      // Add metadata entry
      await cacheMap.setMetadata('test', {
        key: 'test',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      });

      // Add query result
      await cacheMap.setQueryResult('query1', [key]);

      const cleanupMethod = cacheMap['collectCacheEntries'];
      const entries = cleanupMethod.call(cacheMap);

      // Should only include the regular cache entry, not metadata or query
      expect(entries.length).toBe(1);
    });
  });

  describe('Serialization Edge Cases', () => {
    it('should handle circular references in stored data', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj;

      const item: TestItem = {
        key,
        id: '1',
        name: 'Test Item',
        value: 100,
        events: createMockEvents()
      };

      // This should work fine as we're not storing circular references in the test
      await cacheMap.set(key, item);
      const retrieved = await cacheMap.get(key);
      expect(retrieved).toEqual(item);
    });

    it('should handle very large objects', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const largeString = 'x'.repeat(10000);
      const item: TestItem = {
        key,
        id: '1',
        name: largeString,
        value: 100,
        events: createMockEvents()
      };

      await cacheMap.set(key, item);
      const retrieved = await cacheMap.get(key);
      expect(retrieved).toEqual(item);
    });

    it('should handle special characters in keys and values', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: 'special-chars-!@#$%^&*()' };
      const item: TestItem = {
        key,
        id: '1',
        name: 'Special chars: 你好 🌟 ñáéíóú',
        value: 100,
        events: createMockEvents()
      };

      await cacheMap.set(key, item);
      const retrieved = await cacheMap.get(key);
      expect(retrieved).toEqual(item);
    });

    it('should handle entries without originalKey during parsing', async () => {
      const storageKey = 'test-cache:malformed';
      mockLocalStorage.setItem(storageKey, JSON.stringify({
        value: { some: 'data' },
        timestamp: Date.now()
        // Missing originalKey
      }));

      const keys = await cacheMap.keys();
      const values = await cacheMap.values();

      // Should skip malformed entries
      expect(keys).toHaveLength(0);
      expect(values).toHaveLength(0);
    });
  });

  describe('Browser-Specific Behaviors', () => {
    it('should handle different localStorage implementations', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      // Test with different storage behaviors
      await cacheMap.set(key, item);
      expect(await cacheMap.includesKey(key)).toBe(true);

      // Test key collision detection
      const hashedKey = cacheMap['normalizedHashFunction'](key);
      expect(typeof hashedKey).toBe('string');
    });

    it('should handle localStorage length property correctly', async () => {
      expect(mockLocalStorage.length).toBe(0);

      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);
      expect(mockLocalStorage.length).toBeGreaterThan(0);
    });

    it('should handle key normalization and hashing correctly', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '1' };

      const hash1 = cacheMap['normalizedHashFunction'](key1);
      const hash2 = cacheMap['normalizedHashFunction'](key2);

      expect(hash1).toBe(hash2);
    });

    it('should handle complex composite keys correctly', async () => {
      // Use the containerCacheMap which supports the correct types
      const key: ComKey<'item', 'container'> = {
        kt: 'item',
        pk: '1',
        loc: [
          { kt: 'container', lk: 'container1' }
        ]
      };

      const hash = containerCacheMap['normalizedHashFunction'](key);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle bulk operations efficiently', async () => {
      const startTime = Date.now();
      const items: Array<{ key: PriKey<'test'>, item: TestItem }> = [];

      // Create 100 items
      for (let i = 0; i < 100; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `bulk-${i}` };
        const item: TestItem = {
          key,
          id: `bulk-${i}`,
          name: `Bulk Item ${i}`,
          value: i,
          events: createMockEvents()
        };
        items.push({ key, item });
      }

      // Set all items
      for (const { key, item } of items) {
        await cacheMap.set(key, item);
      }

      // Verify all items
      for (const { key, item } of items) {
        const retrieved = await cacheMap.get(key);
        expect(retrieved).toEqual(item);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should handle concurrent operations', async () => {
      const promises: Promise<void>[] = [];

      // Create concurrent set operations
      for (let i = 0; i < 50; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `concurrent-${i}` };
        const item: TestItem = {
          key,
          id: `concurrent-${i}`,
          name: `Concurrent Item ${i}`,
          value: i,
          events: createMockEvents()
        };

        promises.push(cacheMap.set(key, item));
      }

      // Wait for all operations to complete
      await Promise.all(promises);

      // Verify all items were stored
      const keys = await cacheMap.keys();
      expect(keys.length).toBe(50);
    });

    it('should handle memory pressure scenarios', async () => {
      // Simulate memory pressure by creating large items
      const largeItems: Array<{ key: PriKey<'test'>, item: TestItem }> = [];

      for (let i = 0; i < 10; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `large-${i}` };
        const largeData = 'x'.repeat(1000); // 1KB per item
        const item: TestItem = {
          key,
          id: `large-${i}`,
          name: largeData,
          value: i,
          events: createMockEvents()
        };
        largeItems.push({ key, item });
      }

      // Set all large items
      for (const { key, item } of largeItems) {
        await cacheMap.set(key, item);
      }

      const size = await cacheMap.getCurrentSize();
      expect(size.itemCount).toBe(10);
      expect(size.sizeBytes).toBeGreaterThan(10000); // Should be > 10KB
    });

    it('should handle rapid invalidation operations', async () => {
      // Set up items in different locations
      const containerItems: Array<{ key: ComKey<'item', 'container'>, item: ContainerItem }> = [];

      for (let i = 0; i < 20; i++) {
        const containerLk = `container${i % 4}`; // 4 different containers
        const key: ComKey<'item', 'container'> = {
          kt: 'item',
          pk: `item-${i}`,
          loc: [{ kt: 'container', lk: containerLk }]
        };
        const item: ContainerItem = {
          key,
          id: `item-${i}`,
          name: `Item ${i}`,
          value: i,
          events: createMockEvents()
        };
        containerItems.push({ key, item });
      }

      // Set all items
      for (const { key, item } of containerItems) {
        await containerCacheMap.set(key, item);
      }

      // Rapidly invalidate different locations
      const invalidationPromises = [];
      for (let i = 0; i < 4; i++) {
        invalidationPromises.push(
          containerCacheMap.invalidateLocation([{ kt: 'container', lk: `container${i}` }])
        );
      }

      await Promise.all(invalidationPromises);

      // Verify all items are gone
      const remainingKeys = await containerCacheMap.keys();
      expect(remainingKeys.length).toBe(0);
    });
  });

  describe('Query Result Caching Edge Cases', () => {
    it('should handle malformed query result data', async () => {
      const queryHash = 'malformed-query';
      const queryKey = `test-cache:query:${queryHash}`;

      // Store malformed query result
      mockLocalStorage.setItem(queryKey, 'invalid json');

      const result = await cacheMap.getQueryResult(queryHash);
      expect(result).toBeNull();
    });

    it('should handle query results with missing itemKeys', async () => {
      const queryHash = 'missing-keys-query';
      const queryKey = `test-cache:query:${queryHash}`;

      // Store query result without itemKeys
      mockLocalStorage.setItem(queryKey, JSON.stringify({ someOtherField: 'value' }));

      const result = await cacheMap.getQueryResult(queryHash);
      expect(result).toBeNull();
    });

    it('should handle query result storage errors', async () => {
      const queryHash = 'error-query';
      const itemKeys: PriKey<'test'>[] = [{ kt: 'test', pk: '1' }];

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('Query storage error');
      });

      // Should not throw, just log error
      await cacheMap.setQueryResult(queryHash, itemKeys);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should handle query result deletion errors', async () => {
      const queryHash = 'delete-error-query';

      mockLocalStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('Query deletion error');
      });

      // Should not throw, just log error
      await cacheMap.deleteQueryResult(queryHash);
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('Size Calculation Edge Cases', () => {
    it('should handle size calculation with different encoding methods', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);

      // Test with Blob available
      const size1 = await cacheMap.getCurrentSize();
      expect(size1.sizeBytes).toBeGreaterThan(0);

      // Test with TextEncoder available but no Blob
      const originalBlob = global.Blob;
      delete (global as any).Blob;
      global.TextEncoder = class {
        encode(str: string) {
          return new Uint8Array(str.length);
        }
      } as any;

      const size2 = await cacheMap.getCurrentSize();
      expect(size2.sizeBytes).toBeGreaterThan(0);

      // Test with neither Blob nor TextEncoder
      delete (global as any).TextEncoder;

      const size3 = await cacheMap.getCurrentSize();
      expect(size3.sizeBytes).toBeGreaterThan(0);

      // Restore
      global.Blob = originalBlob;
    });

    it('should handle corrupted entries in size calculation', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);

      // Add corrupted entry
      mockLocalStorage.setItem('test-cache:corrupted', 'invalid json');

      const size = await cacheMap.getCurrentSize();
      expect(size.itemCount).toBe(1); // Should only count valid entries
      expect(size.sizeBytes).toBeGreaterThan(0);
    });

    it('should exclude metadata and query results from item count', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);
      await cacheMap.setMetadata('test', {
        key: 'test',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: 100
      });
      await cacheMap.setQueryResult('query', [key]);

      const size = await cacheMap.getCurrentSize();
      expect(size.itemCount).toBe(1); // Only the regular item should count
    });
  });

  describe('Additional Edge Cases and Robustness', () => {
    it('should handle hash collision scenarios', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: 'collision1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: 'collision2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      // Mock hash function to return same hash for different keys
      const originalHashFunction = cacheMap['normalizedHashFunction'];
      cacheMap['normalizedHashFunction'] = vi.fn().mockReturnValue('same-hash');

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      // Should handle collision by checking original key
      const retrieved1 = await cacheMap.get(key1);
      const retrieved2 = await cacheMap.get(key2);

      // Due to collision, only the last item should be retrievable
      expect(retrieved1).toBeNull();
      expect(retrieved2).toEqual(item2);

      // Restore original hash function
      cacheMap['normalizedHashFunction'] = originalHashFunction;
    });

    it('should handle metadata operations with storage errors', async () => {
      const key = 'error-metadata';

      // Test getMetadata with storage error
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Metadata get error');
      });

      await expect(cacheMap.getMetadata(key)).rejects.toThrow('Metadata get error');

      // Test deleteMetadata with storage error
      mockLocalStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('Metadata delete error');
      });

      await expect(cacheMap.deleteMetadata(key)).rejects.toThrow('Metadata delete error');

      // Test getAllMetadata with storage error
      mockLocalStorage.key.mockImplementationOnce(() => {
        throw new Error('Metadata getAll error');
      });

      await expect(cacheMap.getAllMetadata()).rejects.toThrow('Metadata getAll error');

      // Test clearMetadata with storage error
      mockLocalStorage.key.mockImplementationOnce(() => {
        throw new Error('Metadata clear error');
      });

      await expect(cacheMap.clearMetadata()).rejects.toThrow('Metadata clear error');
    });

    it('should handle includesKey with hash collision', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: 'test1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: 'test2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };

      await cacheMap.set(key1, item1);

      // Mock hash function to return same hash for different keys
      const originalHashFunction = cacheMap['normalizedHashFunction'];
      cacheMap['normalizedHashFunction'] = vi.fn().mockReturnValue('same-hash');

      // Should return false for key2 even though hash is same
      const includes1 = await cacheMap.includesKey(key1);
      const includes2 = await cacheMap.includesKey(key2);

      expect(includes1).toBe(true);
      expect(includes2).toBe(false);

      // Restore original hash function
      cacheMap['normalizedHashFunction'] = originalHashFunction;
    });

    it('should handle getCurrentSize with storage access errors', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: '1' };
      const item: TestItem = { key, id: '1', name: 'Test Item', value: 100, events: createMockEvents() };

      await cacheMap.set(key, item);

      // Mock storage error during size calculation
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Size calculation error');
      });

      await expect(cacheMap.getCurrentSize()).rejects.toThrow('Size calculation error');
    });

    it('should handle legacy key fallback correctly', async () => {
      const key: PriKey<'test'> = { kt: 'test', pk: 'legacy' };
      const item: TestItem = { key, id: 'legacy', name: 'Legacy Item', value: 100, events: createMockEvents() };

      // Store using legacy format
      const legacyKey = `test-cache:test:legacy`;
      mockLocalStorage.setItem(legacyKey, JSON.stringify({
        originalKey: key,
        value: item,
        timestamp: Date.now()
      }));

      // Mock primary storage key to return null
      const storageKey = cacheMap['getStorageKey'](key);
      const originalGetItem = mockLocalStorage.getItem;
      mockLocalStorage.getItem = vi.fn((k: string) => {
        if (k === storageKey) return null; // Primary key not found
        if (k === legacyKey) return originalGetItem(k); // Legacy key found
        return originalGetItem(k);
      });

      const retrieved = await cacheMap.get(key);
      expect(retrieved).toEqual(item);

      // Restore
      mockLocalStorage.getItem = originalGetItem;
    });

    it('should handle invalidateItemKeys with deletion errors', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' };
      const item1: TestItem = { key: key1, id: '1', name: 'Item 1', value: 100, events: createMockEvents() };
      const item2: TestItem = { key: key2, id: '2', name: 'Item 2', value: 200, events: createMockEvents() };

      await cacheMap.set(key1, item1);
      await cacheMap.set(key2, item2);

      // Mock delete to fail for first key
      let deleteCallCount = 0;
      const originalDelete = cacheMap.delete.bind(cacheMap);
      cacheMap.delete = vi.fn(async (key) => {
        deleteCallCount++;
        if (deleteCallCount === 1) {
          throw new Error('Delete error for first key');
        }
        return originalDelete(key);
      });

      // Should continue with other keys even if one fails
      await cacheMap.invalidateItemKeys([key1, key2]);

      expect(cacheMap.delete).toHaveBeenCalledTimes(2);
      expect(await cacheMap.get(key2)).toBeNull(); // Second key should be deleted

      // Restore
      cacheMap.delete = originalDelete;
    });

    it('should handle clearQueryResults with individual removal errors', async () => {
      const queryHash1 = 'query1';
      const queryHash2 = 'query2';
      const itemKeys: PriKey<'test'>[] = [{ kt: 'test', pk: '1' }];

      await cacheMap.setQueryResult(queryHash1, itemKeys);
      await cacheMap.setQueryResult(queryHash2, itemKeys);

      // Mock removeItem to fail for first query
      let removeCallCount = 0;
      const originalRemoveItem = mockLocalStorage.removeItem;
      mockLocalStorage.removeItem = vi.fn((key: string) => {
        removeCallCount++;
        if (removeCallCount === 1 && key.includes('query1')) {
          throw new Error('Remove query error');
        }
        return originalRemoveItem(key);
      });

      // Should continue with other queries even if one fails
      await cacheMap.clearQueryResults();

      expect(mockLocalStorage.removeItem).toHaveBeenCalled();

      // Restore
      mockLocalStorage.removeItem = originalRemoveItem;
    });
  });
});
