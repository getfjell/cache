import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { one } from '../../src/ops/one';
import { CacheContext } from '../../src/CacheContext';
import { CacheMap } from '../../src/CacheMap';
import { ClientApi } from '@fjell/client-api';
import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, PriKey, UUID } from '@fjell/core';
import { NotFoundError } from '@fjell/http-api';
import { createQueryHash } from '../../src/normalization';
import { createCoordinate } from '@fjell/registry';

describe('one operation', () => {
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
  const testItem1: TestItem = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;
  const testItem2: TestItem = { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem;
  const testItem3: TestItem = { key: comKey1, id: '3', name: 'Item 3', value: 300 } as TestItem;

  // Test locations
  const testLocations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

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
      one: vi.fn()
    } as any;

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      getQueryResult: vi.fn(),
      set: vi.fn(),
      setQueryResult: vi.fn(),
      deleteQueryResult: vi.fn(),
      delete: vi.fn(),
      includesKey: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      entries: vi.fn(),
      size: vi.fn(),
      getMetadata: vi.fn(),
      setMetadata: vi.fn()
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
      onItemRemoved: vi.fn(),
      onItemUpdated: vi.fn(),
      clearExpiredItems: vi.fn().mockReturnValue([]),
      scheduledTaskInterval: 60000,
      scheduledTaskCount: 0,
      globalTTLInMs: undefined
    } as any;

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemRemoved: vi.fn(),
      onItemUpdated: vi.fn(),
      getCurrentSize: vi.fn().mockReturnValue(0),
      getMaxSize: vi.fn().mockReturnValue(1000)
    } as any;

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      eventEmitter: mockEventEmitter,
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager,
      options: {},
      statsManager: {} as any,
      registry: {} as any,
      coordinate: createCoordinate(['test', 'container'], [])
    } as CacheContext<TestItem, 'test', 'container'>;
  });

  describe('cache hit scenarios', () => {
    it('should return cached item when query result is cached and item exists', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const queryHash = createQueryHash('test', query, []);

      // Mock cached query result with item key
      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue([priKey1]);
      vi.mocked(mockCacheMap.get).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
      expect(mockApi.one).not.toHaveBeenCalled();
    });

    it('should return null when cached query result is empty array', async () => {
      const query: ItemQuery = IQFactory.condition('id', 'nonexistent').toQuery();
      const queryHash = createQueryHash('test', query, []);

      // Mock cached empty result
      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue([]);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toBeNull();
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockCacheMap.get).not.toHaveBeenCalled();
      expect(mockApi.one).not.toHaveBeenCalled();
    });

    it('should invalidate cache and fetch from API when cached item is missing', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const queryHash = createQueryHash('test', query, []);

      // Mock cached query result exists but item is missing from cache
      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue([priKey1]);
      vi.mocked(mockCacheMap.get).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.deleteQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
    });
  });

  describe('when bypassCache is enabled', () => {
    beforeEach(() => {
      context.options = { bypassCache: true };
    });

    it('should fetch directly from API without checking cache', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();

      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(mockCacheMap.getQueryResult).not.toHaveBeenCalled();
      expect(mockCacheMap.get).not.toHaveBeenCalled();
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockCacheMap.setQueryResult).not.toHaveBeenCalled();
      expect(result).toEqual(testItem1);
      expect(resultContext).toBe(context);
    });

    it('should return null when API returns null', async () => {
      const query: ItemQuery = IQFactory.condition('id', 'nonexistent').toQuery();

      vi.mocked(mockApi.one).mockResolvedValue(null);

      const [resultContext, result] = await one(query, [], context);

      expect(mockCacheMap.getQueryResult).not.toHaveBeenCalled();
      expect(mockCacheMap.get).not.toHaveBeenCalled();
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockCacheMap.setQueryResult).not.toHaveBeenCalled();
      expect(result).toBeNull();
      expect(resultContext).toBe(context);
    });

    it('should handle API errors properly', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const apiError = new Error('API Error');

      vi.mocked(mockApi.one).mockRejectedValue(apiError);

      await expect(one(query, [], context)).rejects.toThrow('API Error');

      expect(mockCacheMap.getQueryResult).not.toHaveBeenCalled();
      expect(mockCacheMap.get).not.toHaveBeenCalled();
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockCacheMap.setQueryResult).not.toHaveBeenCalled();
    });
  });

  describe('cache miss scenarios', () => {
    it('should fetch from API and cache result when no cached query result exists', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const queryHash = createQueryHash('test', query, []);

      // Mock no cached query result
      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem1.key, testItem1);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(queryHash, [testItem1.key]);
    });

    it('should cache empty result when API returns null', async () => {
      const query: ItemQuery = IQFactory.condition('id', 'nonexistent').toQuery();
      const queryHash = createQueryHash('test', query, []);

      // Mock no cached query result and API returns null
      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(null);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toBeNull();
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(queryHash, []);
    });

    it('should work with locations parameter', async () => {
      const query: ItemQuery = IQFactory.condition('id', '3').toQuery();
      const queryHash = createQueryHash('test', query, testLocations);

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem3);

      const [resultContext, result] = await one(query, testLocations, context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem3);
      expect(mockApi.one).toHaveBeenCalledWith(query, testLocations);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(queryHash, [testItem3.key]);
    });
  });

  describe('TTL and eviction integration', () => {
    it('should call TTL manager when item is added to cache', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      await one(query, [], context);

      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(testItem1.key),
        mockCacheMap
      );
    });

    it('should call eviction manager and handle evicted items', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const evictedKeys = [JSON.stringify(priKey2)];

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);
      mockEvictionManager.onItemAdded.mockReturnValue(evictedKeys);

      await one(query, [], context);

      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(testItem1.key),
        testItem1,
        mockCacheMap
      );
      expect(mockCacheMap.delete).toHaveBeenCalledWith(priKey2);
    });

    it('should not call TTL or eviction managers when using cached results', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue([priKey1]);
      vi.mocked(mockCacheMap.get).mockResolvedValue(testItem1);

      await one(query, [], context);

      expect(mockTtlManager.onItemAdded).not.toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle NotFoundError by caching empty result', async () => {
      const query: ItemQuery = IQFactory.condition('id', 'nonexistent').toQuery();
      const queryHash = createQueryHash('test', query, []);
      const notFoundError = new NotFoundError('Item not found', '/test/path', {});

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockRejectedValue(notFoundError);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toBeNull();
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(queryHash, []);
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should propagate non-NotFoundError exceptions', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const genericError = new Error('Generic error');

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockRejectedValue(genericError);

      await expect(one(query, [], context)).rejects.toThrow('Generic error');
      expect(mockCacheMap.setQueryResult).not.toHaveBeenCalled();
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty query object', async () => {
      const query: ItemQuery = {};
      const queryHash = createQueryHash('test', query, []);

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockApi.one).toHaveBeenCalledWith({}, []);
    });

    it('should handle undefined query (defaults to empty object)', async () => {
      const queryHash = createQueryHash('test', {}, []);

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(undefined, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockApi.one).toHaveBeenCalledWith({}, []);
    });

    it('should handle empty locations array', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const queryHash = createQueryHash('test', query, []);

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
    });

    it('should handle cache invalidation when multiple items are returned in cached query but first is missing', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const queryHash = createQueryHash('test', query, []);

      // Mock cached query result with multiple keys but first item missing
      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue([priKey1, priKey2]);
      vi.mocked(mockCacheMap.get).mockResolvedValue(null); // First item is missing
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      const [resultContext, result] = await one(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(testItem1);
      expect(mockCacheMap.deleteQueryResult).toHaveBeenCalledWith(queryHash);
      expect(mockApi.one).toHaveBeenCalledWith(query, []);
    });
  });

  describe('query hash generation', () => {
    it('should generate consistent query hashes for same inputs', async () => {
      const query: ItemQuery = IQFactory.condition('id', '1').toQuery();

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      // Call twice with same parameters
      await one(query, testLocations, context);
      await one(query, testLocations, context);

      const expectedHash = createQueryHash('test', query, testLocations);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(expectedHash);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledTimes(2);
    });

    it('should generate different query hashes for different queries', async () => {
      const query1: ItemQuery = IQFactory.condition('id', '1').toQuery();
      const query2: ItemQuery = IQFactory.condition('id', '2').toQuery();

      vi.mocked(mockCacheMap.getQueryResult).mockResolvedValue(null);
      vi.mocked(mockApi.one).mockResolvedValue(testItem1);

      await one(query1, [], context);
      await one(query2, [], context);

      const hash1 = createQueryHash('test', query1, []);
      const hash2 = createQueryHash('test', query2, []);

      expect(hash1).not.toBe(hash2);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(hash1);
      expect(mockCacheMap.getQueryResult).toHaveBeenCalledWith(hash2);
    });
  });
});
