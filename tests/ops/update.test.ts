import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { update } from '../../src/ops/update';
import { CacheContext } from '../../src/CacheContext';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';
import { ClientApi } from '@fjell/client-api';
import { CacheMap } from '../../src/CacheMap';

// Test data types
interface TestItem extends Item<'test', 'container'> {
  id: string;
  name: string;
  value: number;
}

type TestPriKey = PriKey<'test'>;
type TestComKey = ComKey<'test', 'container'>;

describe('update operation', () => {
  // Test keys
  const priKey1: TestPriKey = { kt: 'test', pk: '1' as UUID };
  const comKey1: TestComKey = {
    kt: 'test',
    pk: '2' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  // Test items
  const originalItem: TestItem = {
    key: priKey1,
    id: '1',
    name: 'Original Item',
    value: 100
  } as TestItem;

  const updatedItem: TestItem = {
    key: priKey1,
    id: '1',
    name: 'Updated Item',
    value: 150
  } as TestItem;

  const partialUpdate = { name: 'Updated Item', value: 150 };

  let mockApi: ClientApi<TestItem, 'test', 'container'>;
  let mockCacheMap: CacheMap<TestItem, 'test', 'container'>;
  let mockEventEmitter: any;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let context: CacheContext<TestItem, 'test', 'container'>;

  afterEach(() => {
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock API
    mockApi = {
      update: vi.fn().mockResolvedValue(updatedItem)
    } as any;

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      invalidateItemKeys: vi.fn(),
      includesKey: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      entries: vi.fn(),
      size: vi.fn(),
      getMetadata: vi.fn(),
      setMetadata: vi.fn(),
      deleteMetadata: vi.fn(),
      getAllMetadata: vi.fn(),
      clearMetadata: vi.fn(),
      getCurrentSize: vi.fn(),
      getSizeLimits: vi.fn(),
      clearQueryResults: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Mock EventEmitter
    mockEventEmitter = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      getSubscriptionCount: vi.fn(),
      getSubscriptions: vi.fn(),
      destroy: vi.fn()
    } as any;

    // Mock TTLManager
    mockTtlManager = {
      isTTLEnabled: vi.fn().mockReturnValue(false),
      getDefaultTTL: vi.fn().mockReturnValue(undefined),
      validateItem: vi.fn().mockReturnValue(true),
      onItemAdded: vi.fn(),
      onItemAccessed: vi.fn(),
      removeExpiredItems: vi.fn().mockReturnValue([]),
      getExpirationTime: vi.fn(),
      setExpirationTime: vi.fn(),
      clearExpirationTime: vi.fn(),
      getAllExpirationTimes: vi.fn().mockReturnValue(new Map()),
      clearAllExpirationTimes: vi.fn()
    } as any;

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemAccessed: vi.fn(),
      evictItems: vi.fn().mockReturnValue([]),
      getEvictionStrategy: vi.fn(),
      setEvictionStrategy: vi.fn(),
      isEvictionEnabled: vi.fn().mockReturnValue(false),
      getCurrentSize: vi.fn().mockReturnValue(0),
      getMaxSize: vi.fn().mockReturnValue(undefined)
    } as any;

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      eventEmitter: mockEventEmitter,
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager,
      options: {}
    } as CacheContext<TestItem, 'test', 'container'>;
  });

  describe('successful update operations', () => {
    it('should update an item with primary key', async () => {
      // Setup
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      const [resultContext, resultItem] = await update(priKey1, partialUpdate, context);

      // Verify API call
      expect(mockApi.update).toHaveBeenCalledWith(priKey1, partialUpdate);

      // Verify cache invalidation before update
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);

      // Verify cache set after update
      expect(mockCacheMap.set).toHaveBeenCalledWith(updatedItem.key, updatedItem);

      // Verify TTL management
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        mockCacheMap
      );

      // Verify eviction management
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        updatedItem,
        mockCacheMap
      );

      // Verify event emission
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_updated',
          key: updatedItem.key,
          item: updatedItem,
          previousItem: originalItem,
          source: 'api',
          affectedLocations: [],
          context: undefined
        })
      );

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);
    });

    it('should update an item with composite key', async () => {
      // Setup
      const comUpdatedItem = { ...updatedItem, key: comKey1 };
      (mockApi.update as any).mockResolvedValue(comUpdatedItem);
      (mockCacheMap.get as any).mockReturnValue({ ...originalItem, key: comKey1 });

      // Execute
      const [resultContext, resultItem] = await update(comKey1, partialUpdate, context);

      // Verify API call
      expect(mockApi.update).toHaveBeenCalledWith(comKey1, partialUpdate);

      // Verify cache operations
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([comKey1]);
      expect(mockCacheMap.set).toHaveBeenCalledWith(comKey1, comUpdatedItem);

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(comUpdatedItem);
    });

    it('should handle update when previous item is not in cache', async () => {
      // Setup - no previous item in cache
      (mockCacheMap.get as any).mockReturnValue(undefined);

      // Execute
      const [resultContext, resultItem] = await update(priKey1, partialUpdate, context);

      // Verify API call still happens
      expect(mockApi.update).toHaveBeenCalledWith(priKey1, partialUpdate);

      // Verify cache operations
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);
      expect(mockCacheMap.set).toHaveBeenCalledWith(updatedItem.key, updatedItem);

      // Verify event emission with undefined previous item
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_updated',
          key: updatedItem.key,
          item: updatedItem,
          previousItem: undefined,
          source: 'api',
          affectedLocations: [],
          context: undefined
        })
      );

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);
    });
  });

  describe('eviction handling', () => {
    it('should handle evicted items when cache is full', async () => {
      // Setup
      const evictedKeys = [JSON.stringify(priKey1), JSON.stringify(comKey1)];
      (mockEvictionManager.onItemAdded as any).mockReturnValue(evictedKeys);
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify evicted items are removed from cache
      expect(mockCacheMap.delete).toHaveBeenCalledTimes(2);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(comKey1);
    });

    it('should handle empty eviction list', async () => {
      // Setup
      (mockEvictionManager.onItemAdded as any).mockReturnValue([]);
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify no items are deleted
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });
  });

  describe('validation and error handling', () => {
    it('should throw error for invalid key', async () => {
      // Setup - invalid key (object that looks like a key but is missing required fields)
      const invalidKey = { kt: 'test' } as any;

      // Execute & Verify
      await expect(update(invalidKey, partialUpdate, context))
        .rejects
        .toThrow('Key for Update is not a valid ItemKey');

      // Verify API is not called
      expect(mockApi.update).not.toHaveBeenCalled();
      expect(mockCacheMap.invalidateItemKeys).not.toHaveBeenCalled();
    });

    it('should throw error for undefined key', async () => {
      // Setup - undefined key
      const undefinedKey = undefined as any;

      // Execute & Verify
      await expect(update(undefinedKey, partialUpdate, context))
        .rejects
        .toThrow('Key for Update is not a valid ItemKey');

      // Verify API is not called
      expect(mockApi.update).not.toHaveBeenCalled();
      expect(mockCacheMap.invalidateItemKeys).not.toHaveBeenCalled();
    });

    it('should throw error for malformed key', async () => {
      // Setup - malformed key missing required properties
      const malformedKey = { kt: 'test' } as any;

      // Execute & Verify
      await expect(update(malformedKey, partialUpdate, context))
        .rejects
        .toThrow('Key for Update is not a valid ItemKey');

      // Verify API is not called
      expect(mockApi.update).not.toHaveBeenCalled();
      expect(mockCacheMap.invalidateItemKeys).not.toHaveBeenCalled();
    });

    it('should propagate API errors', async () => {
      // Setup
      const apiError = new Error('API update failed');
      (mockApi.update as any).mockRejectedValue(apiError);
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute & Verify
      await expect(update(priKey1, partialUpdate, context))
        .rejects
        .toThrow('API update failed');

      // Verify cache was invalidated before the error
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);

      // Verify cache set was not called due to error
      expect(mockCacheMap.set).not.toHaveBeenCalled();

      // Verify TTL and eviction managers not called due to error
      expect(mockTtlManager.onItemAdded).not.toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).not.toHaveBeenCalled();

      // Verify event not emitted due to error
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle network timeouts', async () => {
      // Setup
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      (mockApi.update as any).mockRejectedValue(timeoutError);
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute & Verify
      await expect(update(priKey1, partialUpdate, context))
        .rejects
        .toThrow('Request timeout');

      // Verify cache was invalidated
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);
    });
  });

  describe('cache management', () => {
    it('should invalidate cache before API call', async () => {
      // Setup
      (mockCacheMap.get as any).mockReturnValue(originalItem);
      let invalidationCalled = false;
      let apiCalled = false;

      (mockCacheMap.invalidateItemKeys as any).mockImplementation(() => {
        invalidationCalled = true;
        expect(apiCalled).toBe(false); // API should not be called yet
      });

      (mockApi.update as any).mockImplementation(async () => {
        apiCalled = true;
        expect(invalidationCalled).toBe(true); // Invalidation should happen first
        return updatedItem;
      });

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify order
      expect(invalidationCalled).toBe(true);
      expect(apiCalled).toBe(true);
    });

    it('should cache result after successful API call', async () => {
      // Setup
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify cache set with updated item
      expect(mockCacheMap.set).toHaveBeenCalledWith(updatedItem.key, updatedItem);
    });

    it('should update TTL for cached item', async () => {
      // Setup
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify TTL manager called
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        mockCacheMap
      );
    });
  });

  describe('event emission', () => {
    it('should emit itemUpdated event with correct data', async () => {
      // Setup
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify event emission
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      const emittedEvent = mockEventEmitter.emit.mock.calls[0][0];

      expect(emittedEvent).toEqual(
        expect.objectContaining({
          type: 'item_updated',
          key: updatedItem.key,
          item: updatedItem,
          previousItem: originalItem,
          source: 'api',
          affectedLocations: [],
          context: undefined
        })
      );
    });

    it('should emit event even when previous item is undefined', async () => {
      // Setup
      (mockCacheMap.get as any).mockReturnValue(undefined);

      // Execute
      await update(priKey1, partialUpdate, context);

      // Verify event emission
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      const emittedEvent = mockEventEmitter.emit.mock.calls[0][0];

      expect(emittedEvent).toEqual(
        expect.objectContaining({
          type: 'item_updated',
          key: updatedItem.key,
          item: updatedItem,
          previousItem: undefined,
          source: 'api',
          affectedLocations: [],
          context: undefined
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle partial update with empty object', async () => {
      // Setup
      const emptyUpdate = {};
      (mockCacheMap.get as any).mockReturnValue(originalItem);

      // Execute
      await update(priKey1, emptyUpdate, context);

      // Verify API called with empty update
      expect(mockApi.update).toHaveBeenCalledWith(priKey1, emptyUpdate);
    });

    it('should handle key with special characters in JSON serialization', async () => {
      // Setup
      const specialKey: TestPriKey = { kt: 'test', pk: 'special-"key"' as UUID };
      const specialUpdatedItem = { ...updatedItem, key: specialKey };
      (mockApi.update as any).mockResolvedValue(specialUpdatedItem);
      (mockCacheMap.get as any).mockReturnValue({ ...originalItem, key: specialKey });

      // Execute
      await update(specialKey, partialUpdate, context);

      // Verify JSON serialization works correctly
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(specialKey),
        mockCacheMap
      );
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(specialKey),
        specialUpdatedItem,
        mockCacheMap
      );
    });
  });
});
