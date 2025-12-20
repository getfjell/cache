import { beforeEach, describe, expect, it, vi } from 'vitest';
import { find } from '../../src/ops/find';
import { findOne } from '../../src/ops/findOne';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { AllOperationResult, ComKey, FindOperationResult, Item, PriKey, UUID } from '@fjell/types';
import { CacheContext, createCacheContext } from '../../src/CacheContext';
import { Options } from '../../src/Options';
import { createFinderHash } from '../../src/normalization';
import { CacheStatsManager } from '../../src/CacheStats';
import { createCoordinate } from '@fjell/core';

describe('Find Operations', () => {
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

  let cacheMap: MemoryCacheMap<TestItem, 'test', 'container'>;
  let mockApi: any;
  let mockEventEmitter: any;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let context: CacheContext<TestItem, 'test', 'container'>;

  beforeEach(() => {
    cacheMap = new MemoryCacheMap<TestItem, 'test', 'container'>(['test', 'container']);

    mockApi = {
      find: vi.fn(),
      findOne: vi.fn()
    };

    const options: Options<TestItem, 'test', 'container'> = {
      cacheType: 'memory' as const,
      // keyTypeArray: ['test', 'container'] as const,
      ttl: 300000
    };

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
      isTTLEnabled: vi.fn().mockReturnValue(true),
      getDefaultTTL: vi.fn().mockReturnValue(300000),
      validateItem: vi.fn().mockReturnValue(true),
      onItemAdded: vi.fn(),
      onItemAccessed: vi.fn(),
      removeExpiredItems: vi.fn()
    } as any;

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemAccessed: vi.fn(),
      onItemRemoved: vi.fn(),
      getEvictionStrategyName: vi.fn().mockReturnValue(null),
      isEvictionSupported: vi.fn().mockReturnValue(false),
      performEviction: vi.fn().mockReturnValue([])
    } as any;

    const mockStatsManager = new CacheStatsManager();
    const mockRegistry = {} as any;
    const mockCoordinate = createCoordinate(['test', 'container'], []);
    context = createCacheContext(mockApi, cacheMap, 'test', options, mockEventEmitter, mockTtlManager, mockEvictionManager, mockStatsManager, mockRegistry, mockCoordinate);
  });

  describe('find operation', () => {
    it('should fetch from API and cache results when no cached data exists', async () => {
      const finder = 'by-value';
      const params = { value: 100 };
      const locations: [] = [];

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([testItems[0]]);
      expect(results.metadata.total).toBe(1);
      expect(await updatedContext.cacheMap.get(priKey1)).toEqual(testItems[0]);

      // Query result should be cached
      expect(updatedContext.cacheMap.hasQueryResult).toBeDefined();
    });

    it('should use cached query results when available and all items exist', async () => {
      const finder = 'by-value';
      const params = { value: 100 };
      const locations: [] = [];

      // Pre-populate cache with items
      cacheMap.set(priKey1, testItems[0]);
      cacheMap.set(priKey2, testItems[1]);

      // Pre-populate query cache
      const queryHash = createFinderHash(finder, params, locations);
      cacheMap.setQueryResult(queryHash, [priKey1, priKey2]);

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).not.toHaveBeenCalled();
      expect(results.items).toEqual([testItems[0], testItems[1]]);
      expect(results.metadata.total).toBe(2);
      expect(updatedContext.cacheMap).toBe(cacheMap);
    });

    it('should invalidate query cache and fetch from API when some cached items are missing', async () => {
      const finder = 'by-name';
      const params = { name: 'Item' };
      const locations: [] = [];

      // Pre-populate cache with only one item
      cacheMap.set(priKey1, testItems[0]);

      // Pre-populate query cache with keys for both items (but second item not in cache)
      const queryHash = createFinderHash(finder, params, locations);
      cacheMap.setQueryResult(queryHash, [priKey1, priKey2]);

      mockApi.find.mockResolvedValue({
        items: [testItems[0], testItems[1]],
        metadata: { total: 2, returned: 2, offset: 0, hasMore: false }
      });

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([testItems[0], testItems[1]]);
      expect(results.metadata.total).toBe(2);
      expect(await updatedContext.cacheMap.get(priKey1)).toEqual(testItems[0]);
      expect(await updatedContext.cacheMap.get(priKey2)).toEqual(testItems[1]);
    });

    it('should handle empty results from API', async () => {
      const finder = 'non-existent';
      const params = { value: 999 };
      const locations: [] = [];

      mockApi.find.mockResolvedValue({
        items: [],
        metadata: { total: 0, returned: 0, offset: 0, hasMore: false }
      });

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([]);
      expect(results.metadata.total).toBe(0);
      expect(updatedContext.cacheMap).toBe(cacheMap);
    });

    it('should handle find operations with complex parameters', async () => {
      const finder = 'complex-search';
      const params = {
        stringParam: 'test',
        numberParam: 42,
        booleanParam: true,
        dateParam: new Date('2023-01-01'),
        arrayParam: ['a', 'b', 'c']
      };
      const locations: [] = [];

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([testItems[0]]);
      expect(results.metadata.total).toBe(1);
    });

    it('should handle find operations with locations', async () => {
      const finder = 'by-location';
      const params = { value: 300 };
      const locations = [{ kt: 'container', lk: 'container1' as UUID }];

      mockApi.find.mockResolvedValue({
        items: [testItems[2]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([testItems[2]]);
      expect(results.metadata.total).toBe(1);
      expect(await updatedContext.cacheMap.get(comKey1)).toEqual(testItems[2]);
    });

    it('should handle API errors gracefully', async () => {
      const finder = 'error-finder';
      const params = { value: 100 };
      const locations: [] = [];

      mockApi.find.mockRejectedValue(new Error('API Error'));

      await expect(find(
        finder,
        params,
        locations as any,
        context
      )).rejects.toThrow('API Error');
    });

    it('should use default parameters when not provided', async () => {
      const finder = 'simple-find';

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [, results] = await find(
        finder,
        {},
        [],
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, {}, [], undefined);
      expect(results.items).toEqual([testItems[0]]);
      expect(results.metadata.total).toBe(1);
    });

    it('should handle query cache that returns null', async () => {
      const finder = 'null-cache-test';
      const params = { value: 100 };

      // Mock getQueryResult to return null
      const originalGetQueryResult = cacheMap.getQueryResult;
      cacheMap.getQueryResult = vi.fn().mockReturnValue(null);

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [, results] = await find(
        finder,
        params,
        [],
        context
      );

      expect(mockApi.find).toHaveBeenCalled();
      expect(results.items).toEqual([testItems[0]]);
      expect(results.metadata.total).toBe(1);

      // Restore original method
      cacheMap.getQueryResult = originalGetQueryResult;
    });

    it('should handle empty cached item keys array', async () => {
      const finder = 'empty-cache-test';
      const params = { value: 100 };

      // Set up empty query result cache
      const queryHash = createFinderHash(finder, params, []);
      cacheMap.setQueryResult(queryHash, []);

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [, results] = await find(
        finder,
        params,
        [],
        context
      );

      // Should use empty cached results
      expect(mockApi.find).not.toHaveBeenCalled();
      expect(results.items).toEqual([]);
      expect(results.metadata.total).toBe(0);
    });
  });

  describe('find operation with bypassCache enabled', () => {
    beforeEach(() => {
      context.options = { ...context.options, bypassCache: true };
    });

    it('should fetch directly from API without checking cache', async () => {
      const finder = 'by-value';
      const params = { value: 100 };
      const locations: [] = [];

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([testItems[0]]);
      expect(results.metadata.total).toBe(1);
      expect(updatedContext.cacheMap).toBe(cacheMap);

      // Should not cache the result
      expect(await updatedContext.cacheMap.get(priKey1)).toBeNull();
    });

    it('should handle empty results from API without caching', async () => {
      const finder = 'non-existent';
      const params = { value: 999 };
      const locations: [] = [];

      mockApi.find.mockResolvedValue({
        items: [],
        metadata: { total: 0, returned: 0, offset: 0, hasMore: false }
      });

      const [updatedContext, results] = await find(
        finder,
        params,
        locations as any,
        context
      );

      expect(mockApi.find).toHaveBeenCalledWith(finder, params, locations, undefined);
      expect(results.items).toEqual([]);
      expect(results.metadata.total).toBe(0);
      expect(updatedContext.cacheMap).toBe(cacheMap);
    });

    it('should handle API errors properly', async () => {
      const finder = 'by-value';
      const params = { value: 100 };
      const locations: [] = [];
      const apiError = new Error('API Error');

      mockApi.find.mockRejectedValue(apiError);

      await expect(find(finder, params, locations as any, context)).rejects.toThrow('API Error');
    });
  });

  describe('findOne operation', () => {
    it('should fetch from API and cache result when no cached data exists', async () => {
      const finder = 'by-id';
      const finderParams = { id: '1' };
      const locations: [] = [];

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [updatedContext, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, finderParams, locations);
      expect(result).toEqual(testItems[0]);
      expect(await updatedContext.cacheMap.get(priKey1)).toEqual(testItems[0]);
    });

    it('should use cached query result when available and item exists', async () => {
      const finder = 'by-id';
      const finderParams = { id: '1' };
      const locations: [] = [];

      // Pre-populate cache with item
      cacheMap.set(priKey1, testItems[0]);

      // Pre-populate query cache
      const queryHash = createFinderHash(finder, finderParams, locations);
      cacheMap.setQueryResult(queryHash, [priKey1]);

      const [updatedContext, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(testItems[0]);
      expect(updatedContext.cacheMap).toBe(cacheMap);
    });

    it('should invalidate query cache and fetch from API when cached item is missing', async () => {
      const finder = 'by-name';
      const finderParams = { name: 'Item 1' };
      const locations: [] = [];

      // Pre-populate query cache with key but no actual item
      const queryHash = createFinderHash(finder, finderParams, locations);
      cacheMap.setQueryResult(queryHash, [priKey1]);

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [updatedContext, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, finderParams, locations);
      expect(result).toEqual(testItems[0]);
      expect(await updatedContext.cacheMap.get(priKey1)).toEqual(testItems[0]);
    });

    it('should handle findOne operations with complex parameters', async () => {
      const finder = 'complex-findOne';
      const finderParams = {
        stringParam: 'test',
        numberParam: 42,
        booleanParam: true,
        dateParam: new Date('2023-01-01'),
        arrayParam: ['x', 'y', 'z']
      };
      const locations: [] = [];

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, finderParams, locations);
      expect(result).toEqual(testItems[0]);
    });

    it('should handle findOne operations with locations', async () => {
      const finder = 'by-location-one';
      const finderParams = { value: 300 };
      const locations = [{ kt: 'container', lk: 'container1' as UUID }];

      mockApi.findOne.mockResolvedValue(testItems[2]);

      const [updatedContext, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, finderParams, locations);
      expect(result).toEqual(testItems[2]);
      expect(await updatedContext.cacheMap.get(comKey1)).toEqual(testItems[2]);
    });

    it('should handle API errors gracefully', async () => {
      const finder = 'error-findOne';
      const finderParams = { id: '1' };
      const locations: [] = [];

      mockApi.findOne.mockRejectedValue(new Error('FindOne API Error'));

      await expect(findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      )).rejects.toThrow('FindOne API Error');
    });

    it('should use default parameters when not provided', async () => {
      const finder = 'simple-findOne';

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [, result] = await findOne(
        finder,
        {},
        [],
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, {}, []);
      expect(result).toEqual(testItems[0]);
    });

    it('should handle query cache that returns null', async () => {
      const finder = 'null-cache-findOne';
      const finderParams = { id: '1' };

      // Mock getQueryResult to return null
      const originalGetQueryResult = cacheMap.getQueryResult;
      cacheMap.getQueryResult = vi.fn().mockReturnValue(null);

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [, result] = await findOne(
        finder,
        finderParams as any,
        [],
        context
      );

      expect(mockApi.findOne).toHaveBeenCalled();
      expect(result).toEqual(testItems[0]);

      // Restore original method
      cacheMap.getQueryResult = originalGetQueryResult;
    });

    it('should handle empty cached item keys array', async () => {
      const finder = 'empty-cache-findOne';
      const finderParams = { id: '1' };

      // Set up empty query result cache
      const queryHash = createFinderHash(finder, finderParams, []);
      cacheMap.setQueryResult(queryHash, []);

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [, result] = await findOne(
        finder,
        finderParams as any,
        [],
        context
      );

      // Should fetch from API since cached result is empty
      expect(mockApi.findOne).toHaveBeenCalled();
      expect(result).toEqual(testItems[0]);
    });

    it('should handle cached query results with multiple keys but use only first', async () => {
      const finder = 'multi-key-cache';
      const finderParams = { value: 100 };

      // Pre-populate cache with items
      cacheMap.set(priKey1, testItems[0]);
      cacheMap.set(priKey2, testItems[1]);

      // Pre-populate query cache with multiple keys
      const queryHash = createFinderHash(finder, finderParams, []);
      cacheMap.setQueryResult(queryHash, [priKey1, priKey2]);

      const [, result] = await findOne(
        finder,
        finderParams as any,
        [],
        context
      );

      expect(mockApi.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(testItems[0]); // Should return first item only
    });
  });

  describe('findOne operation with bypassCache enabled', () => {
    beforeEach(() => {
      context.options = { ...context.options, bypassCache: true };
    });

    it('should fetch directly from API without checking cache', async () => {
      const finder = 'by-id';
      const finderParams = { id: '1' };
      const locations: [] = [];

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [updatedContext, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, finderParams, locations);
      expect(result).toEqual(testItems[0]);
      expect(updatedContext.cacheMap).toBe(cacheMap);
      
      // Should not cache the result
      expect(await updatedContext.cacheMap.get(priKey1)).toBeNull();
    });

    it('should handle complex parameters without caching', async () => {
      const finder = 'complex-findOne';
      const finderParams = {
        stringParam: 'test',
        numberParam: 42,
        booleanParam: true,
        dateParam: new Date('2023-01-01'),
        arrayParam: ['x', 'y', 'z']
      };
      const locations: [] = [];

      mockApi.findOne.mockResolvedValue(testItems[0]);

      const [, result] = await findOne(
        finder,
        finderParams as any,
        locations as any,
        context
      );

      expect(mockApi.findOne).toHaveBeenCalledWith(finder, finderParams, locations);
      expect(result).toEqual(testItems[0]);
    });

    it('should handle API errors properly', async () => {
      const finder = 'by-id';
      const finderParams = { id: '1' };
      const locations: [] = [];
      const apiError = new Error('API Error');

      mockApi.findOne.mockRejectedValue(apiError);

      await expect(findOne(finder, finderParams as any, locations as any, context)).rejects.toThrow('API Error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent find operations with same parameters', async () => {
      const finder = 'concurrent-test';
      const params = { value: 100 };

      mockApi.find.mockResolvedValue({
        items: [testItems[0]],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      // Execute multiple find operations concurrently
      const promises = Array(5).fill(0).map(() =>
        find(finder, params, [], context)
      );

      const results = await Promise.all(promises);

      // All should return the same result
      // find() now returns [context, FindOperationResult]
      results.forEach(([, result]) => {
        expect(result.items).toEqual([testItems[0]]);
        expect(result.metadata.total).toBe(1);
      });

      // API should be called (exact number depends on timing/caching behavior)
      expect(mockApi.find).toHaveBeenCalled();
    });
  });
});
