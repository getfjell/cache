import { beforeEach, describe, expect, it, vi } from 'vitest';
import { allAction } from '../../src/ops/allAction';
import { CacheContext } from '../../src/CacheContext';
import { ComKey, Item, LocKeyArray, PriKey, UUID } from '@fjell/core';
import { ClientApi } from '@fjell/client-api';
import { NotFoundError } from '@fjell/http-api';
import { CacheMap } from '../../src/CacheMap';

// Test data types
interface TestItem extends Item<'test', 'container', 'section'> {
  id: string;
  name: string;
  value: number;
}

type TestPriKey = PriKey<'test'>;
type TestComKey = ComKey<'test', 'container', 'section'>;

describe('allAction operation', () => {
  // Test keys
  const priKey1: TestPriKey = { kt: 'test', pk: '1' as UUID };
  const priKey2: TestPriKey = { kt: 'test', pk: '2' as UUID };
  const comKey1: TestComKey = {
    kt: 'test',
    pk: '3' as UUID,
    loc: [
      { kt: 'container', lk: 'container1' as UUID },
      { kt: 'section', lk: 'section1' as UUID }
    ]
  };

  // Test items
  const testItem1: TestItem = {
    key: priKey1,
    id: '1',
    name: 'Test Item 1',
    value: 100
  } as TestItem;

  const testItem2: TestItem = {
    key: priKey2,
    id: '2',
    name: 'Test Item 2',
    value: 200
  } as TestItem;

  const testItem3: TestItem = {
    key: comKey1,
    id: '3',
    name: 'Test Item 3',
    value: 300
  } as TestItem;

  const testAction = 'processAll';
  const testBody = { operation: 'bulk-update', metadata: { source: 'test' } };
  const testLocations: LocKeyArray<'container', 'section'> = [
    { kt: 'container', lk: 'container1' as UUID },
    { kt: 'section', lk: 'section1' as UUID }
  ];

  let mockApi: ClientApi<TestItem, 'test', 'container', 'section'>;
  let mockCacheMap: CacheMap<TestItem, 'test', 'container', 'section'>;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let context: CacheContext<TestItem, 'test', 'container', 'section'>;

  beforeEach(() => {
    // Mock ClientApi
    mockApi = {
      allAction: vi.fn()
    } as unknown as ClientApi<TestItem, 'test', 'container', 'section'>;

    // Mock CacheMap
    mockCacheMap = {
      invalidateLocation: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      clearQueryResults: vi.fn(),
      invalidateItemKeys: vi.fn(),
      allIn: vi.fn()
    } as unknown as CacheMap<TestItem, 'test', 'container', 'section'>;

    // Properly mock the allIn method
    vi.mocked(mockCacheMap.allIn).mockResolvedValue([]);

    // Mock TTLManager
    mockTtlManager = {
      onItemAdded: vi.fn()
    };

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]) // Returns empty array by default (no evictions)
    };

    // Mock event emitter
    const mockEventEmitter = {
      emit: vi.fn()
    };

    // Mock other required properties
    const mockOptions = {} as any;
    const mockStatsManager = {} as any;

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      options: mockOptions,
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager,
      eventEmitter: mockEventEmitter,
      statsManager: mockStatsManager
    } as unknown as CacheContext<TestItem, 'test', 'container', 'section'>;
  });

  describe('basic functionality', () => {
    it('should execute allAction and cache results', async () => {
      const mockResults = [testItem1, testItem2, testItem3];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        testLocations,
        context
      );

      // Verify API was called with correct parameters
      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);

      // Verify location was invalidated before the action
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith(testLocations);

      // Verify all results were cached
      expect(mockCacheMap.set).toHaveBeenCalledTimes(3);
      expect(mockCacheMap.set).toHaveBeenNthCalledWith(1, testItem1.key, testItem1);
      expect(mockCacheMap.set).toHaveBeenNthCalledWith(2, testItem2.key, testItem2);
      expect(mockCacheMap.set).toHaveBeenNthCalledWith(3, testItem3.key, testItem3);

      // Verify TTL manager was called for each item
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledTimes(3);
      expect(mockTtlManager.onItemAdded).toHaveBeenNthCalledWith(1, JSON.stringify(testItem1.key), mockCacheMap);
      expect(mockTtlManager.onItemAdded).toHaveBeenNthCalledWith(2, JSON.stringify(testItem2.key), mockCacheMap);
      expect(mockTtlManager.onItemAdded).toHaveBeenNthCalledWith(3, JSON.stringify(testItem3.key), mockCacheMap);

      // Verify eviction manager was called for each item
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledTimes(3);
      expect(mockEvictionManager.onItemAdded).toHaveBeenNthCalledWith(1, JSON.stringify(testItem1.key), testItem1, mockCacheMap);
      expect(mockEvictionManager.onItemAdded).toHaveBeenNthCalledWith(2, JSON.stringify(testItem2.key), testItem2, mockCacheMap);
      expect(mockEvictionManager.onItemAdded).toHaveBeenNthCalledWith(3, JSON.stringify(testItem3.key), testItem3, mockCacheMap);

      // Verify return values
      expect(returnedContext).toBe(context);
      expect(results).toEqual(mockResults);
    });

    it('should work with empty locations array', async () => {
      const mockResults = [testItem1];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        [],
        context
      );

      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, []);
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith([]);
      expect(returnedContext).toBe(context);
      expect(results).toEqual(mockResults);
    });

    it('should work with default parameters', async () => {
      const mockResults = [testItem1];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      const [returnedContext, results] = await allAction(
        testAction,
        undefined,
        undefined,
        context
      );

      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, {}, []);
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith([]);
      expect(returnedContext).toBe(context);
      expect(results).toEqual(mockResults);
    });

    it('should handle empty results array', async () => {
      vi.mocked(mockApi.allAction).mockResolvedValue([]);

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        testLocations,
        context
      );

      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith(testLocations);

      // No caching should happen for empty results
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockTtlManager.onItemAdded).not.toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).not.toHaveBeenCalled();

      expect(returnedContext).toBe(context);
      expect(results).toEqual([]);
    });
  });

  describe('eviction handling', () => {
    it('should handle evictions when items are added', async () => {
      const mockResults = [testItem1, testItem2];
      const evictedKey1 = JSON.stringify(priKey2);
      const evictedKey2 = JSON.stringify(comKey1);

      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      // Mock eviction manager to return evicted keys
      mockEvictionManager.onItemAdded
        .mockReturnValueOnce([evictedKey1]) // First item causes one eviction
        .mockReturnValueOnce([evictedKey2]); // Second item causes another eviction

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        testLocations,
        context
      );

      // Verify eviction manager was called
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledTimes(2);

      // Verify evicted items were deleted from cache
      expect(mockCacheMap.delete).toHaveBeenCalledTimes(2);
      expect(mockCacheMap.delete).toHaveBeenNthCalledWith(1, priKey2);
      expect(mockCacheMap.delete).toHaveBeenNthCalledWith(2, comKey1);

      expect(returnedContext).toBe(context);
      expect(results).toEqual(mockResults);
    });

    it('should handle multiple evictions from single item', async () => {
      const mockResults = [testItem1];
      const evictedKeys = [
        JSON.stringify(priKey2),
        JSON.stringify(comKey1)
      ];

      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);
      mockEvictionManager.onItemAdded.mockReturnValue(evictedKeys);

      await allAction(testAction, testBody, testLocations, context);

      // Verify all evicted items were deleted
      expect(mockCacheMap.delete).toHaveBeenCalledTimes(2);
      expect(mockCacheMap.delete).toHaveBeenNthCalledWith(1, priKey2);
      expect(mockCacheMap.delete).toHaveBeenNthCalledWith(2, comKey1);
    });

    it('should handle no evictions', async () => {
      const mockResults = [testItem1];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);
      mockEvictionManager.onItemAdded.mockReturnValue([]); // No evictions

      await allAction(testAction, testBody, testLocations, context);

      // Verify no deletions happened
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle NotFoundError gracefully', async () => {
      const notFoundError = new NotFoundError('Items not found', 'NOT_FOUND_ERROR', { details: 'No items found for action' });
      vi.mocked(mockApi.allAction).mockRejectedValue(notFoundError);

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        testLocations,
        context
      );

      // Verify location was still invalidated
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith(testLocations);

      // Verify API was called
      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);

      // Should return empty array for NotFoundError
      expect(results).toEqual([]);
      expect(returnedContext).toBe(context);

      // No caching should happen
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockTtlManager.onItemAdded).not.toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).not.toHaveBeenCalled();
    });

    it('should re-throw non-NotFoundError exceptions', async () => {
      const genericError = new Error('Generic API error');
      vi.mocked(mockApi.allAction).mockRejectedValue(genericError);

      await expect(
        allAction(testAction, testBody, testLocations, context)
      ).rejects.toThrow('Generic API error');

      // Verify location was still invalidated
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith(testLocations);

      // Verify API was called
      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);

      // No caching should happen
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockTtlManager.onItemAdded).not.toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).not.toHaveBeenCalled();
    });

    it('should handle malformed evicted keys gracefully', async () => {
      const mockResults = [testItem1];
      const malformedEvictedKey = 'invalid-json-key';

      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);
      mockEvictionManager.onItemAdded.mockReturnValue([malformedEvictedKey]);

      // Should not throw even with malformed JSON
      await expect(
        allAction(testAction, testBody, testLocations, context)
      ).rejects.toThrow(); // JSON.parse will throw

      // Verify the item was still cached despite eviction error
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem1.key, testItem1);
      expect(mockTtlManager.onItemAdded).toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalled();
    });
  });

  describe('call sequencing', () => {
    it('should invalidate cache and make API call', async () => {
      const mockResults = [testItem1];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      await allAction(testAction, testBody, testLocations, context);

      // Verify both operations happen
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith(testLocations);
      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);
    });

    it('should cache items and handle evictions', async () => {
      const mockResults = [testItem1];
      const evictedKey = JSON.stringify(priKey2);

      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);
      mockEvictionManager.onItemAdded.mockReturnValue([evictedKey]);

      await allAction(testAction, testBody, testLocations, context);

      // Verify both operations happen
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem1.key, testItem1);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(priKey2);
    });

    it('should call TTL and eviction managers for cached items', async () => {
      const mockResults = [testItem1];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      await allAction(testAction, testBody, testLocations, context);

      // Verify both managers are called
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(JSON.stringify(testItem1.key), mockCacheMap);
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(JSON.stringify(testItem1.key), testItem1, mockCacheMap);
    });
  });

  describe('complex scenarios', () => {
    it('should handle large result sets efficiently', async () => {
      // Create 100 test items
      const largeResultSet = Array.from({ length: 100 }, (_, i) => ({
        key: { kt: 'test', pk: `item-${i}` as UUID },
        id: `item-${i}`,
        name: `Test Item ${i}`,
        value: i * 10
      } as TestItem));

      vi.mocked(mockApi.allAction).mockResolvedValue(largeResultSet);

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        testLocations,
        context
      );

      // Verify all items were processed
      expect(mockCacheMap.set).toHaveBeenCalledTimes(100);
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledTimes(100);
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledTimes(100);

      expect(results).toHaveLength(100);
      expect(returnedContext).toBe(context);
    });

    it('should handle mixed primary and composite keys', async () => {
      const mixedResults = [testItem1, testItem3]; // pri key and com key
      vi.mocked(mockApi.allAction).mockResolvedValue(mixedResults);

      const [returnedContext, results] = await allAction(
        testAction,
        testBody,
        testLocations,
        context
      );

      // Verify both types of keys are handled
      expect(mockCacheMap.set).toHaveBeenNthCalledWith(1, testItem1.key, testItem1);
      expect(mockCacheMap.set).toHaveBeenNthCalledWith(2, testItem3.key, testItem3);

      expect(mockTtlManager.onItemAdded).toHaveBeenNthCalledWith(1, JSON.stringify(testItem1.key), mockCacheMap);
      expect(mockTtlManager.onItemAdded).toHaveBeenNthCalledWith(2, JSON.stringify(testItem3.key), mockCacheMap);

      expect(results).toEqual(mixedResults);
      expect(returnedContext).toBe(context);
    });

    it('should maintain operation atomicity on partial failures', async () => {
      const mockResults = [testItem1, testItem2];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      // Make the second TTL manager call throw
      mockTtlManager.onItemAdded
        .mockImplementationOnce(() => { }) // First call succeeds
        .mockImplementationOnce(() => { throw new Error('TTL error'); }); // Second call fails

      await expect(
        allAction(testAction, testBody, testLocations, context)
      ).rejects.toThrow('TTL error');

      // Verify that cache invalidation and API call still happened
      expect(mockCacheMap.invalidateLocation).toHaveBeenCalledWith(testLocations);
      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);

      // First item should have been cached before the error
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem1.key, testItem1);
    });
  });

  describe('cache event emission and invalidation', () => {
    it('should emit item_updated events for modified items', async () => {
      // Mock existing items in cache
      vi.mocked(mockCacheMap.allIn).mockResolvedValue([testItem1, testItem2]);

      const mockResults = [testItem1, testItem2]; // Same items, so they're modified
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      await allAction(testAction, testBody, testLocations, context);

      // Verify that existing items were retrieved for comparison
      expect(mockCacheMap.allIn).toHaveBeenCalledWith(testLocations);

      // Verify that individual item keys were invalidated for modified items
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([testItem1.key, testItem2.key]);

      // Verify that query results were cleared
      expect(mockCacheMap.clearQueryResults).toHaveBeenCalled();

      // Verify that events were emitted (we can't easily test the exact event content due to mocking)
      expect(context.eventEmitter.emit).toHaveBeenCalled();
    });

    it('should emit item_created events for new items', async () => {
      // Mock no existing items in cache
      vi.mocked(mockCacheMap.allIn).mockResolvedValue([]);

      const mockResults = [testItem1, testItem2]; // New items
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      await allAction(testAction, testBody, testLocations, context);

      // Verify that existing items were retrieved for comparison
      expect(mockCacheMap.allIn).toHaveBeenCalledWith(testLocations);

      // Verify that no individual item keys were invalidated (since they're new)
      expect(mockCacheMap.invalidateItemKeys).not.toHaveBeenCalled();

      // Verify that query results were cleared
      expect(mockCacheMap.clearQueryResults).toHaveBeenCalled();

      // Verify that events were emitted
      expect(context.eventEmitter.emit).toHaveBeenCalled();
    });

    it('should handle mixed modified and new items correctly', async () => {
      // Mock some existing items in cache
      vi.mocked(mockCacheMap.allIn).mockResolvedValue([testItem1]); // Only item1 exists

      const mockResults = [testItem1, testItem2]; // item1 is modified, item2 is new
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      await allAction(testAction, testBody, testLocations, context);

      // Verify that individual item keys were invalidated only for modified items
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([testItem1.key]);

      // Verify that query results were cleared
      expect(mockCacheMap.clearQueryResults).toHaveBeenCalled();

      // Verify that events were emitted
      expect(context.eventEmitter.emit).toHaveBeenCalled();
    });

    it('should handle errors gracefully when retrieving existing items', async () => {
      // Mock error when retrieving existing items
      vi.mocked(mockCacheMap.allIn).mockRejectedValue(new Error('Cache error'));

      const mockResults = [testItem1];
      vi.mocked(mockApi.allAction).mockResolvedValue(mockResults);

      // Should not throw an error
      await expect(allAction(testAction, testBody, testLocations, context)).resolves.toBeDefined();

      // Verify that the operation still completed successfully
      expect(mockApi.allAction).toHaveBeenCalledWith(testAction, testBody, testLocations);
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem1.key, testItem1);
    });
  });
});
